import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

function visibleMarkets(session: { role: string; markets: string[] }) {
  if (["ADMIN", "PACKING", "TECH"].includes(session.role)) return ["VN", "ID", "TH", "PH"];
  return session.markets;
}

function randomTrackingNumber() {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `TRK${digits}`;
}

// Simulates importing a carrier tracking file: assigns a random TRK######
// number to every currently PACKED order the caller can see, all at once.
export async function POST() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "tracking")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const markets = visibleMarkets(session);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const packed = await client.query(
      `SELECT order_id FROM orders WHERE shipment_status = 'PACKED' AND market_code = ANY($1) FOR UPDATE`,
      [markets]
    );
    let count = 0;
    for (const row of packed.rows) {
      const trk = randomTrackingNumber();
      await client.query(
        `UPDATE orders SET tracking_number = $1, shipment_status = 'SHIPPED', shipped_at = now() WHERE order_id = $2`,
        [trk, row.order_id]
      );
      await client.query(
        `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note)
         VALUES ($1,$2,'TRACKING_ASSIGNED',$3,$4)`,
        [randomUUID(), row.order_id, session.userId, `Bulk import — tracking number ${trk}`]
      );
      count++;
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, assigned: count });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Bulk assign failed." }, { status: 500 });
  } finally {
    client.release();
  }
}
