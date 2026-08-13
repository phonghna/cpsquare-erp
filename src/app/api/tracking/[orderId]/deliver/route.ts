import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

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
    if (order.payment_type === "INSTALLMENT" && order.installment_term_months > 0) {
      const termMonths = Number(order.installment_term_months);
      const totalCents = Math.round(Number(order.remaining_balance_ntd) * 100);
      if (totalCents > 0) {
        const baseCents = Math.floor(totalCents / termMonths);
        const remainderCents = totalCents - baseCents * termMonths;
        const deliveryDate = new Date();

        for (let period = 1; period <= termMonths; period++) {
          const amountCents = baseCents + (period === termMonths ? remainderCents : 0);
          const dueDate = new Date(deliveryDate);
          dueDate.setDate(dueDate.getDate() + 30 * period);
          await client.query(
            `INSERT INTO payment_schedules (schedule_id, order_id, period_number, amount_due_ntd, due_date, status)
             VALUES ($1,$2,$3,$4,$5,'PENDING')`,
            [randomUUID(), orderId, period, (amountCents / 100).toFixed(2), dueDate.toISOString().slice(0, 10)]
          );
        }
        generatedSchedule = true;
        await client.query(
          `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note)
           VALUES ($1,$2,'INSTALLMENT_SCHEDULE_GENERATED',$3,$4)`,
          [randomUUID(), orderId, session.userId, `${termMonths} period(s), total ${(totalCents / 100).toFixed(2)} NTD`]
        );
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, generatedSchedule });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to mark delivered." }, { status: 500 });
  } finally {
    client.release();
  }
}
