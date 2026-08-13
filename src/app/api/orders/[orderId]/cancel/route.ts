import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

const NOT_CANCELLABLE = ["CANCELLED", "DELIVERY_FAILED", "RETURNED", "DELIVERED"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { reason } = await req.json();
  if (!reason) return NextResponse.json({ error: "Cancellation reason is required." }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderRes = await client.query(`SELECT order_code, shipment_status FROM orders WHERE order_id = $1 FOR UPDATE`, [orderId]);
    if (orderRes.rowCount === 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Order not found." }, { status: 404 }); }
    const { order_code: orderCode, shipment_status: current } = orderRes.rows[0];
    if (NOT_CANCELLABLE.includes(current)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This order can no longer be cancelled." }, { status: 409 });
    }

    const wasShipped = current === "SHIPPED";
    const newStatus = wasShipped ? "DELIVERY_FAILED" : "CANCELLED";

    await client.query(`UPDATE orders SET shipment_status = $1, cancel_reason = $2 WHERE order_id = $3`, [newStatus, reason, orderId]);

    if (!wasShipped) {
      const items = await client.query(`SELECT imei_serial FROM order_items WHERE order_id = $1`, [orderId]);
      for (const row of items.rows) {
        await client.query(
          `UPDATE product_items SET status = 'IN_STOCK', current_location = 'CPSquare Warehouse (TW)', order_id = NULL, updated_by_user_id = $1, updated_at = now() WHERE imei_serial = $2`,
          [session.userId, row.imei_serial]
        );
        await client.query(
          `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, related_order_id, performed_by_user_id) VALUES ($1,$2,'RESERVED','IN_STOCK',$3,$4)`,
          [randomUUID(), row.imei_serial, orderId, session.userId]
        );
      }
      const accs = await client.query(`SELECT variant_id FROM order_accessories WHERE order_id = $1`, [orderId]);
      for (const row of accs.rows) {
        await client.query(`UPDATE product_variants SET stock_quantity = stock_quantity + 1, reserved_quantity = GREATEST(0, reserved_quantity - 1) WHERE variant_id = $1`, [row.variant_id]);
      }
    }

    await client.query(
      `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note) VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), orderId, newStatus, session.userId, `Reason: ${reason}`]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, orderCode, status: newStatus });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to cancel order." }, { status: 500 });
  } finally {
    client.release();
  }
}
