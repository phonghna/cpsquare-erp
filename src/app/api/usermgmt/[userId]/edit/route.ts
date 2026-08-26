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
  const resolvedTeam = role === "ADMIN" ? "Global" : (team || null);
  const resolvedMarkets = resolveMarkets(role, markets);
  if (resolvedMarkets.length === 0) {
    return NextResponse.json({ error: "At least one market is required for this role." }, { status: 400 });
  }

  // Update + clear old market rows + insert new ones, on one dedicated
  // client inside a real transaction. This USED to be a single CTE query
  // (`WITH upd AS (...), del AS (DELETE ...) INSERT ... SELECT FROM upd,
  // unnest(...)`), which looked atomic but wasn't safe: the final INSERT
  // only has a data dependency on `upd` (it selects from it), not on `del`
  // — and Postgres does not guarantee write-CTEs execute in the order
  // they're written, only in dependency order. With no dependency forcing
  // `del` to run before the INSERT, Postgres was free to run them in either
  // order, so whenever a market stayed assigned across an edit (e.g. the
  // user keeps ID + TH), the INSERT could execute before the DELETE had
  // removed the old (user_id, market_code) row, hitting
  // user_market_access_pkey. A dedicated client with BEGIN/DELETE/INSERT/
  // COMMIT — the same pattern already used everywhere else in this app for
  // multi-statement writes — makes the ordering explicit and correct.
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const upd = await client.query(
      `UPDATE app_users SET display_name = $1, role = $2, team_allocation = $3,
         require_password_change = COALESCE($4, require_password_change), updated_at = now()
       WHERE user_id = $5`,
      [displayName, role, resolvedTeam, requirePasswordChange ?? null, userId]
    );
    if (upd.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This account no longer exists — reload the page and try again." }, { status: 404 });
    }
    await client.query(`DELETE FROM user_market_access WHERE user_id = $1`, [userId]);
    await client.query(
      `INSERT INTO user_market_access (user_id, market_code) SELECT $1, m FROM unnest($2::text[]) AS m`,
      [userId, resolvedMarkets]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err?.message || "Failed to update user." }, { status: 500 });
  } finally {
    client.release();
  }
}
