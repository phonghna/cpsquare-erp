import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

// Manual tracking-number entry: PACKED -> SHIPPED, stamps shipped_at.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "tracking")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { trackingNumber } = await req.json();
  if (!trackingNumber || !String(trackingNumber).trim()) {
    return NextResponse.json({ error: "Tracking number is required." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT shipment_status FROM orders WHERE order_id = $1 FOR UPDATE`,
      [orderId]
    );
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    if (current.rows[0].shipment_status !== "PACKED") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order is not awaiting tracking assignment." }, { status: 409 });
    }

    await client.query(
      `UPDATE orders SET tracking_number = $1, shipment_status = 'SHIPPED', shipped_at = now() WHERE order_id = $2`,
      [String(trackingNumber).trim(), orderId]
    );
    await client.query(
      `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note)
       VALUES ($1,$2,'TRACKING_ASSIGNED',$3,$4)`,
      [randomUUID(), orderId, session.userId, `Tracking number ${trackingNumber}`]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to save tracking number." }, { status: 500 });
  } finally {
    client.release();
  }
}
