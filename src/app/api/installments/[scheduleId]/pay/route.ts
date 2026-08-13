import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

// Mark a payment_schedules row as PAID and decrement the order's
// remaining_balance_ntd by that period's amount (clamped at 0).
export async function POST(_req: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "installments")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const scheduleRes = await client.query(
      `SELECT schedule_id, order_id, amount_due_ntd, status FROM payment_schedules WHERE schedule_id = $1 FOR UPDATE`,
      [scheduleId]
    );
    if (scheduleRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
    }
    const schedule = scheduleRes.rows[0];
    if (schedule.status === "PAID") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This period is already paid." }, { status: 409 });
    }

    await client.query(
      `UPDATE payment_schedules SET status = 'PAID', paid_at = now() WHERE schedule_id = $1`,
      [scheduleId]
    );

    const orderRes = await client.query(
      `SELECT remaining_balance_ntd FROM orders WHERE order_id = $1 FOR UPDATE`,
      [schedule.order_id]
    );
    const currentRemaining = Number(orderRes.rows[0]?.remaining_balance_ntd ?? 0);
    const nextRemaining = Math.max(0, currentRemaining - Number(schedule.amount_due_ntd));
    await client.query(
      `UPDATE orders SET remaining_balance_ntd = $1 WHERE order_id = $2`,
      [nextRemaining.toFixed(2), schedule.order_id]
    );

    await client.query(
      `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note)
       VALUES ($1,$2,'INSTALLMENT_PAID',$3,$4)`,
      [randomUUID(), schedule.order_id, session.userId, `Period paid: ${schedule.amount_due_ntd} NTD`]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, remainingBalanceNtd: nextRemaining });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to mark as paid." }, { status: 500 });
  } finally {
    client.release();
  }
}
