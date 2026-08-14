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

  // Single atomic statement: update + clear old market rows + insert new
  // ones, all in one CTE query instead of separate round-trips. Splitting
  // this across multiple queries over a pooled WebSocket connection could
  // intermittently land on a different backend session mid-transaction.
  const pool = getPool();
  try {
    const result = await pool.query(
      `WITH upd AS (
         UPDATE app_users SET display_name = $1, role = $2, team_allocation = $3,
           require_password_change = COALESCE($4, require_password_change), updated_at = now()
         WHERE user_id = $5
         RETURNING user_id
       ), del AS (
         DELETE FROM user_market_access WHERE user_id = $5
       )
       INSERT INTO user_market_access (user_id, market_code)
       SELECT user_id, m FROM upd, unnest($6::text[]) AS m
       RETURNING user_id`,
      [displayName, role, resolvedTeam, requirePasswordChange ?? null, userId, resolvedMarkets]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "This account no longer exists — reload the page and try again." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to update user." }, { status: 500 });
  }
}
