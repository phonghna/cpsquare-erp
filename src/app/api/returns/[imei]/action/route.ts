import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

function visibleMarkets(session: { role: string; markets: string[] }) {
  if (["ADMIN", "PACKING", "TECH"].includes(session.role)) return ["VN", "ID", "TH", "PH"];
  return session.markets;
}

// RESTOCK -> product_items back to IN_STOCK at the warehouse.
// REPAIR   -> product_items to REPAIRING, rma_stage RECEIVE (enters the RMA kanban).
// Either way the traced order (if any) is marked RETURNED.
export async function POST(req: NextRequest, { params }: { params: Promise<{ imei: string }> }) {
  const { imei } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "returns")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { action } = await req.json();
  if (!["RESTOCK", "REPAIR"].includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const itemRes = await client.query(`SELECT status FROM product_items WHERE imei_serial = $1 FOR UPDATE`, [imei]);
    if (itemRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "No device found with that IMEI." }, { status: 404 });
    }
    const fromStatus = itemRes.rows[0].status;

    const orderRes = await client.query(
      `SELECT o.order_id, o.market_code FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       WHERE oi.imei_serial = $1
       ORDER BY o.created_at DESC
       LIMIT 1
       FOR UPDATE OF o`,
      [imei]
    );
    const order = orderRes.rows[0] || null;
    if (order && !visibleMarkets(session).includes(order.market_code)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "You do not have access to that order's market." }, { status: 403 });
    }

    if (action === "RESTOCK") {
      await client.query(
        `UPDATE product_items
         SET status = 'IN_STOCK', current_location = 'CPSquare Warehouse (TW)', rma_stage = NULL,
             updated_by_user_id = $1, updated_at = now()
         WHERE imei_serial = $2`,
        [session.userId, imei]
      );
      await client.query(
        `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, related_order_id, performed_by_user_id)
         VALUES ($1,$2,$3,'IN_STOCK',$4,$5)`,
        [randomUUID(), imei, fromStatus, order?.order_id || null, session.userId]
      );
    } else {
      await client.query(
        `UPDATE product_items
         SET status = 'REPAIRING', rma_stage = 'RECEIVE', updated_by_user_id = $1, updated_at = now()
         WHERE imei_serial = $2`,
        [session.userId, imei]
      );
      await client.query(
        `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, related_order_id, performed_by_user_id)
         VALUES ($1,$2,$3,'REPAIRING',$4,$5)`,
        [randomUUID(), imei, fromStatus, order?.order_id || null, session.userId]
      );
    }

    if (order) {
      await client.query(`UPDATE orders SET shipment_status = 'RETURNED' WHERE order_id = $1`, [order.order_id]);
      await client.query(
        `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note)
         VALUES ($1,$2,'RETURN_PROCESSED',$3,$4)`,
        [randomUUID(), order.order_id, session.userId, `IMEI ${imei} — ${action === "RESTOCK" ? "re-stocked" : "queued for repair"}`]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to process return." }, { status: 500 });
  } finally {
    client.release();
  }
}
