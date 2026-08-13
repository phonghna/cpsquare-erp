import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

// "Print label & complete" — only succeeds once every IMEI on the order has
// been scan-confirmed and every accessory row ticked. Sets shipment_status
// PACKED, flips each IMEI to PACKING, and decrements accessory reserved_quantity.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "packing")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { confirmedImeis = [], confirmedAccessoryIds = [] } = await req.json();

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      `SELECT order_id, shipment_status FROM orders WHERE order_id = $1 FOR UPDATE`,
      [orderId]
    );
    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    if (orderRes.rows[0].shipment_status !== "PENDING_PACK") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order is no longer awaiting packing." }, { status: 409 });
    }

    const itemsRes = await client.query(
      `SELECT imei_serial FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    const actualImeis = itemsRes.rows.map((r) => r.imei_serial).sort();
    const submittedImeis = [...confirmedImeis].sort();
    const imeisMatch =
      actualImeis.length === submittedImeis.length &&
      actualImeis.every((v, i) => v === submittedImeis[i]);
    if (!imeisMatch) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "All IMEIs on this order must be scan-confirmed first." }, { status: 400 });
    }

    const accRes = await client.query(
      `SELECT accessory_row_id, variant_id FROM order_accessories WHERE order_id = $1`,
      [orderId]
    );
    const actualAccIds = accRes.rows.map((r) => r.accessory_row_id).sort();
    const submittedAccIds = [...confirmedAccessoryIds].sort();
    const accMatch =
      actualAccIds.length === submittedAccIds.length &&
      actualAccIds.every((v, i) => v === submittedAccIds[i]);
    if (!accMatch) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "All accessories on this order must be checked off first." }, { status: 400 });
    }

    await client.query(
      `UPDATE orders SET shipment_status = 'PACKED', packed_at = now() WHERE order_id = $1`,
      [orderId]
    );

    for (const imei of actualImeis) {
      await client.query(
        `UPDATE product_items SET status = 'PACKING', updated_by_user_id = $1, updated_at = now() WHERE imei_serial = $2`,
        [session.userId, imei]
      );
      await client.query(
        `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, related_order_id, performed_by_user_id)
         VALUES ($1,$2,'RESERVED','PACKING',$3,$4)`,
        [randomUUID(), imei, orderId, session.userId]
      );
    }

    for (const row of accRes.rows) {
      await client.query(
        `UPDATE order_accessories SET is_verified = TRUE WHERE accessory_row_id = $1`,
        [row.accessory_row_id]
      );
      await client.query(
        `UPDATE product_variants SET reserved_quantity = GREATEST(0, reserved_quantity - 1) WHERE variant_id = $1`,
        [row.variant_id]
      );
    }

    await client.query(
      `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note)
       VALUES ($1,$2,'PACKED',$3,$4)`,
      [randomUUID(), orderId, session.userId, `${actualImeis.length} IMEI(s), ${accRes.rows.length} accessory line(s) confirmed`]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to complete packing." }, { status: 500 });
  } finally {
    client.release();
  }
}
