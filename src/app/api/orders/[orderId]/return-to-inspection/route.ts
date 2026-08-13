import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

// Pulls a PACKED parcel back to PENDING_PACK so it can be edited — IMEIs go
// back to RESERVED (not IN_STOCK; they're still committed to this order).
export async function POST(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderRes = await client.query(`SELECT shipment_status FROM orders WHERE order_id = $1 FOR UPDATE`, [orderId]);
    if (orderRes.rowCount === 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Order not found." }, { status: 404 }); }
    if (orderRes.rows[0].shipment_status !== "PACKED") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Only a Packed order can be pulled back for editing." }, { status: 409 });
    }

    await client.query(`UPDATE orders SET shipment_status = 'PENDING_PACK' WHERE order_id = $1`, [orderId]);
    const items = await client.query(`SELECT imei_serial FROM order_items WHERE order_id = $1`, [orderId]);
    for (const row of items.rows) {
      await client.query(`UPDATE product_items SET status = 'RESERVED', updated_by_user_id = $1, updated_at = now() WHERE imei_serial = $2`, [session.userId, row.imei_serial]);
    }
    await client.query(
      `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note) VALUES ($1,$2,'RETURNED_TO_INSPECTION',$3,$4)`,
      [randomUUID(), orderId, session.userId, "Parcel pulled back from packed queue for editing"]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to return to inspection." }, { status: 500 });
  } finally {
    client.release();
  }
}
