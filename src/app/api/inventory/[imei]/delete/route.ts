import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

// Admin-only, IN_STOCK-only device deletion. A device that has ever been on
// an order — even one since cancelled or edited off the order — still has
// an order_items row pointing at its imei_serial (kept deliberately, for
// historical record-keeping), and the database enforces a real foreign key
// (order_items_imei_serial_fkey) from order_items.imei_serial to
// product_items.imei_serial. So an IN_STOCK-but-previously-ordered device
// can still fail to delete; we check for that up front and explain it,
// rather than letting the user hit a raw Postgres FK error.
export async function POST(_req: Request, { params }: { params: Promise<{ imei: string }> }) {
  const { imei } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "inventory")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only Admin can delete a device." }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT status FROM product_items WHERE imei_serial = $1 FOR UPDATE`, [imei]);
    if (current.rowCount === 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: "IMEI not found." }, { status: 404 }); }
    if (current.rows[0].status !== "IN_STOCK") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Only an IN_STOCK device can be deleted." }, { status: 409 });
    }
    const history = await client.query(
      `SELECT o.order_code FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE oi.imei_serial = $1 LIMIT 5`,
      [imei]
    );
    if (history.rowCount! > 0) {
      await client.query("ROLLBACK");
      const codes = history.rows.map((r) => r.order_code).join(", ");
      return NextResponse.json({
        error: `Cannot delete — this IMEI was previously used on order(s) ${codes}${history.rowCount! === 5 ? "…" : ""}, and that order history is kept even after cancellation/editing. If it's a duplicate or mistaken entry, use "Edit details" to fix its data instead.`,
      }, { status: 409 });
    }
    // Log the deletion while the row still exists, then remove it — some
    // deployments may also have a foreign key from imei_logs.imei_serial to
    // product_items, so log-then-delete is the safe order either way.
    await client.query(
      `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, performed_by_user_id) VALUES ($1,$2,'IN_STOCK','DELETED',$3)`,
      [randomUUID(), imei, session.userId]
    );
    await client.query(`DELETE FROM product_items WHERE imei_serial = $1`, [imei]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err?.code === "23503") {
      return NextResponse.json({ error: "Cannot delete — this device is still referenced by other records (order history, logs, etc.)." }, { status: 409 });
    }
    return NextResponse.json({ error: err.message || "Failed to delete device." }, { status: 500 });
  } finally {
    client.release();
  }
}
