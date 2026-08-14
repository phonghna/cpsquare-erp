import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";
import { roomFor } from "../route";

// Zero-click check-out: grabs the first IN_STOCK unit (any SKU) and puts it
// live in the caller's own room — no manual room/device picker. Room is
// resolved from the account's role/team: Admins get a dedicated Admin room,
// everyone else is routed by team_allocation (see TEAM_MARKET in ../route.ts).
export async function POST() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "live")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const room = roomFor(session.role, session.team);
  if (!room) {
    return NextResponse.json({ error: "Your account isn't assigned to a team that maps to a livestream room." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claim = await client.query(
      `SELECT imei_serial, variant_id FROM product_items
       WHERE status = 'IN_STOCK'
       ORDER BY imei_serial
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );
    if (claim.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "No IN_STOCK device available." }, { status: 409 });
    }
    const { imei_serial: imei, variant_id: variantId } = claim.rows[0];
    const location = room.label;

    await client.query(
      `UPDATE product_items SET status = 'CHECKED_OUT_LIVE', current_location = $1, updated_by_user_id = $2, updated_at = now()
       WHERE imei_serial = $3`,
      [location, session.userId, imei]
    );
    await client.query(
      `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, performed_by_user_id)
       VALUES ($1,$2,'IN_STOCK','CHECKED_OUT_LIVE',$3)`,
      [randomUUID(), imei, session.userId]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, imei, variantId, location });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Check-out failed." }, { status: 500 });
  } finally {
    client.release();
  }
}
