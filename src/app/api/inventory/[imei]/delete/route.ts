import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

// Admin-only, IN_STOCK-only device deletion.
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
    await client.query(`DELETE FROM product_items WHERE imei_serial = $1`, [imei]);
    await client.query(
      `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, performed_by_user_id) VALUES ($1,$2,'IN_STOCK','DELETED',$3)`,
      [randomUUID(), imei, session.userId]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to delete device." }, { status: 500 });
  } finally {
    client.release();
  }
}
