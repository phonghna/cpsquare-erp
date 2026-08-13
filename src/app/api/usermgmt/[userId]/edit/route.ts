import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage, ROLE_SCOPE } from "@/lib/auth";

const ROLES = ["ADMIN", "MANAGER", "CS", "STREAMER", "PACKING", "TECH"];
const MARKETS = ["VN", "ID", "TH", "PH"];

function resolveMarkets(role: string, requested: string[]): string[] {
  const scope = ROLE_SCOPE[role] || "SINGLE";
  if (scope === "ALL") return MARKETS;
  if (scope === "SINGLE") return requested.slice(0, 1).filter((m) => MARKETS.includes(m));
  return requested.filter((m) => MARKETS.includes(m));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "usermgmt")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { displayName, role, team, markets = [], requirePasswordChange } = body;
  if (!displayName || !role) {
    return NextResponse.json({ error: "Display name and role are required." }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  const resolvedMarkets = resolveMarkets(role, markets);
  if (resolvedMarkets.length === 0) {
    return NextResponse.json({ error: "At least one market is required for this role." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`SELECT user_id FROM app_users WHERE user_id = $1 FOR UPDATE`, [userId]);
    if (existing.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    await client.query(
      `UPDATE app_users SET display_name = $1, role = $2, team_allocation = $3,
         require_password_change = COALESCE($4, require_password_change), updated_at = now()
       WHERE user_id = $5`,
      [displayName, role, team || null, requirePasswordChange ?? null, userId]
    );
    await client.query(`DELETE FROM user_market_access WHERE user_id = $1`, [userId]);
    for (const marketCode of resolvedMarkets) {
      await client.query(`INSERT INTO user_market_access (user_id, market_code) VALUES ($1,$2)`, [userId, marketCode]);
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to update user." }, { status: 500 });
  } finally {
    client.release();
  }
}
