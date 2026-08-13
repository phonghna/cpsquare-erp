import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

// Check-in: CHECKED_OUT_LIVE -> IN_STOCK, back to the central warehouse.
export async function POST(_req: Request, { params }: { params: Promise<{ imei: string }> }) {
  const { imei } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "live")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT status FROM product_items WHERE imei_serial = $1 FOR UPDATE`,
      [imei]
    );
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "IMEI not found." }, { status: 404 });
    }
    if (current.rows[0].status !== "CHECKED_OUT_LIVE") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This device is not checked out live." }, { status: 409 });
    }

    await client.query(
      `UPDATE product_items SET status = 'IN_STOCK', current_location = 'CPSquare Warehouse (TW)', updated_by_user_id = $1, updated_at = now()
       WHERE imei_serial = $2`,
      [session.userId, imei]
    );
    await client.query(
      `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, performed_by_user_id)
       VALUES ($1,$2,'CHECKED_OUT_LIVE','IN_STOCK',$3)`,
      [randomUUID(), imei, session.userId]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Check-in failed." }, { status: 500 });
  } finally {
    client.release();
  }
}
