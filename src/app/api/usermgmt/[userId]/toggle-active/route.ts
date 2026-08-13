import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";

export async function POST(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "usermgmt")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (userId === session.userId) {
    return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT is_active FROM app_users WHERE user_id = $1 FOR UPDATE`, [userId]);
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    const next = !current.rows[0].is_active;
    await client.query(`UPDATE app_users SET is_active = $1, updated_at = now() WHERE user_id = $2`, [next, userId]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, isActive: next });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to update status." }, { status: 500 });
  } finally {
    client.release();
  }
}
