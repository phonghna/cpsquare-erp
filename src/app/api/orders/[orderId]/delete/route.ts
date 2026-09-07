import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { WAREHOUSE_LABELS } from "@/lib/warehouse";
import { randomUUID } from "crypto";

// Admin-only, permanent hard delete — different from Cancel (which keeps the
// order as a CANCELLED/DELIVERY_FAILED record for history). This is for
// erasing a mistaken or test order entirely: any status is deletable
// (including SHIPPED/DELIVERED/RETURNED), every phone/accessory it claimed
// is unwound back to available stock as if the order never existed, and all
// rows referencing the order (order_items, order_accessories, payment
// schedules + their dunning logs, order_logs, price_change_logs) are
// removed. imei_logs rows for the affected devices are kept for device
// history but detached from the now-gone order_id.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only Admin can permanently delete an order." }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderRes = await client.query(`SELECT order_code FROM orders WHERE order_id = $1 FOR UPDATE`, [orderId]);
    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    const orderCode = orderRes.rows[0].order_code;

    // Release each phone this order claimed back to IN_STOCK, at its home
    // warehouse — regardless of what status it's currently sitting in
    // (RESERVED, PACKING, SHIPPED, ...). Guarded by `AND order_id = $2` so a
    // device that has since been reassigned elsewhere is left untouched.
    const items = await client.query(`SELECT imei_serial FROM order_items WHERE order_id = $1`, [orderId]);
    for (const row of items.rows) {
      const current = await client.query(`SELECT status, warehouse_code FROM product_items WHERE imei_serial = $1 AND order_id = $2 FOR UPDATE`, [row.imei_serial, orderId]);
      if (current.rowCount === 0) continue;
      const homeLabel = WAREHOUSE_LABELS[current.rows[0].warehouse_code] || WAREHOUSE_LABELS.XINSHENG;
      await client.query(
        `UPDATE product_items
         SET status = 'IN_STOCK', current_location = $1, order_id = NULL, remark = NULL, rma_stage = NULL,
             status_updated_at = now(), updated_by_user_id = $2, updated_at = now()
         WHERE imei_serial = $3`,
        [homeLabel, session.userId, row.imei_serial]
      );
      await client.query(
        `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, performed_by_user_id) VALUES ($1,$2,$3,'IN_STOCK',$4)`,
        [randomUUID(), row.imei_serial, current.rows[0].status, session.userId]
      );
    }

    // Same reversal for accessory line quantities.
    const accs = await client.query(`SELECT variant_id, quantity FROM order_accessories WHERE order_id = $1`, [orderId]);
    for (const row of accs.rows) {
      await client.query(
        `UPDATE product_variants SET stock_quantity = stock_quantity + $1, reserved_quantity = GREATEST(0, reserved_quantity - $1) WHERE variant_id = $2`,
        [row.quantity, row.variant_id]
      );
    }

    // Detach (not delete) device history that referenced this order, so a
    // device's own audit trail survives the order's deletion.
    await client.query(`UPDATE imei_logs SET related_order_id = NULL WHERE related_order_id = $1`, [orderId]);

    // Everything below only makes sense in the context of this specific
    // order, so it's removed outright. Dunning logs first (they reference
    // payment_schedules, which references this order).
    await client.query(
      `DELETE FROM installment_dunning_logs WHERE schedule_id IN (SELECT schedule_id FROM payment_schedules WHERE order_id = $1)`,
      [orderId]
    );
    await client.query(`DELETE FROM payment_schedules WHERE order_id = $1`, [orderId]);
    await client.query(`DELETE FROM price_change_logs WHERE order_id = $1`, [orderId]);
    await client.query(`DELETE FROM order_logs WHERE order_id = $1`, [orderId]);
    await client.query(`DELETE FROM order_accessories WHERE order_id = $1`, [orderId]);
    await client.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
    await client.query(`DELETE FROM orders WHERE order_id = $1`, [orderId]);

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, orderCode });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to delete order." }, { status: 500 });
  } finally {
    client.release();
  }
}
