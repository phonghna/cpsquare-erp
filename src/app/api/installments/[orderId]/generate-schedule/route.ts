import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage, canGenerateInstallmentSchedule } from "@/lib/auth";
import { randomUUID } from "crypto";
import { insertInstallmentSchedule } from "@/lib/installments";

// Retroactive fix for a DELIVERED Installment order that slipped through
// without a payment_schedules row (e.g. term/remaining balance were missing
// or zero at delivery time and have since been corrected via an order edit).
export async function POST(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "installments")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canGenerateInstallmentSchedule(session.role)) {
    return NextResponse.json({ error: "Only Admin or Manager can generate an installment schedule." }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT payment_type, shipment_status, remaining_balance_ntd, installment_term_months
       FROM orders WHERE order_id = $1 FOR UPDATE`,
      [orderId]
    );
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    const order = current.rows[0];
    if (order.payment_type !== "INSTALLMENT") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This order isn't an Installment-type order." }, { status: 409 });
    }
    if (order.shipment_status !== "DELIVERED") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order must be Delivered before a schedule can be generated." }, { status: 409 });
    }
    const existing = await client.query(`SELECT 1 FROM payment_schedules WHERE order_id = $1 LIMIT 1`, [orderId]);
    if ((existing.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This order already has a schedule." }, { status: 409 });
    }

    const result = await insertInstallmentSchedule(client, orderId, order.remaining_balance_ntd, order.installment_term_months);
    if (!result.generated) {
      await client.query("ROLLBACK");
      const reason = !(Number(order.installment_term_months) > 0)
        ? "No installment term is set on this order — edit the order to set one first."
        : "This order has no remaining balance to schedule.";
      return NextResponse.json({ error: reason }, { status: 409 });
    }

    await client.query(
      `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note)
       VALUES ($1,$2,'INSTALLMENT_SCHEDULE_GENERATED',$3,$4)`,
      [randomUUID(), orderId, session.userId, `${result.periods} period(s), total ${result.totalNtd.toFixed(2)} NTD (generated retroactively)`]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, periods: result.periods });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to generate schedule." }, { status: 500 });
  } finally {
    client.release();
  }
}
