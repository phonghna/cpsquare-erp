import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";
import { insertInstallmentSchedule } from "@/lib/installments";

// Mark delivered: SHIPPED -> DELIVERED. If the order is an INSTALLMENT-type
// order, this is also where its payment_schedules rows get generated for the
// first time (business rule: only on the DELIVERED transition) — splits
// remaining_balance_ntd evenly across installment_term_months, one row per
// period, due dates 30 days apart starting 30 days after delivery.
export async function POST(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "tracking")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT shipment_status, payment_type, remaining_balance_ntd, installment_term_months
       FROM orders WHERE order_id = $1 FOR UPDATE`,
      [orderId]
    );
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    const order = current.rows[0];
    if (order.shipment_status !== "SHIPPED") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order must be SHIPPED before it can be marked delivered." }, { status: 409 });
    }

    await client.query(`UPDATE orders SET shipment_status = 'DELIVERED' WHERE order_id = $1`, [orderId]);
    await client.query(
      `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note)
       VALUES ($1,$2,'DELIVERED',$3,NULL)`,
      [randomUUID(), orderId, session.userId]
    );

    let generatedSchedule = false;
    let scheduleWarning: string | null = null;
    if (order.payment_type === "INSTALLMENT") {
      const result = await insertInstallmentSchedule(client, orderId, order.remaining_balance_ntd, order.installment_term_months);
      generatedSchedule = result.generated;
      if (result.generated) {
        await client.query(
          `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note)
           VALUES ($1,$2,'INSTALLMENT_SCHEDULE_GENERATED',$3,$4)`,
          [randomUUID(), orderId, session.userId, `${result.periods} period(s), total ${result.totalNtd.toFixed(2)} NTD`]
        );
      } else {
        // Don't fail the delivery over this — but don't fail silently either.
        // The CS/Manager needs to know right away, not discover an empty
        // Installment Debt Board later. They can fix it from the board's
        // "Needs a schedule" panel once the order data is corrected.
        scheduleWarning = !(Number(order.installment_term_months) > 0)
          ? "This is an Installment order but no installment term is set — no schedule was generated. Edit the order to set a term, then use \"Generate schedule\" on the Installment Debt Board."
          : "This Installment order has no remaining balance to schedule (fully covered by the downpayment) — no schedule was generated.";
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, generatedSchedule, scheduleWarning });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to mark delivered." }, { status: 500 });
  } finally {
    client.release();
  }
}
