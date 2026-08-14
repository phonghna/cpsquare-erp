import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPool } from "@/lib/db-pool";
import { appUsers, userMarketAccess } from "@/lib/schema";
import { getSession, canAccessPage, hashPassword, ROLE_SCOPE } from "@/lib/auth";
import { randomUUID } from "crypto";

const ROLES = ["ADMIN", "MANAGER", "CS", "STREAMER", "PACKING", "TECH"];
const MARKETS = ["VN", "ID", "TH", "PH"];

function resolveMarkets(role: string, requested: string[]): string[] {
  const scope = ROLE_SCOPE[role] || "SINGLE";
  if (scope === "ALL") return MARKETS;
  if (scope === "SINGLE") return requested.slice(0, 1).filter((m) => MARKETS.includes(m));
  return requested.filter((m) => MARKETS.includes(m));
}

export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "usermgmt")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const users = await db.select().from(appUsers).orderBy(appUsers.username);
  const access = await db.select().from(userMarketAccess);
  const marketsByUser = new Map<string, string[]>();
  for (const row of access) {
    const list = marketsByUser.get(row.userId) || [];
    list.push(row.marketCode);
    marketsByUser.set(row.userId, list);
  }
  const result = users.map(({ passwordHash, ...u }) => ({ ...u, markets: marketsByUser.get(u.userId) || [] }));
  return NextResponse.json({ users: result });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "usermgmt")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { username, displayName, role, team, markets = [], password, requirePasswordChange = false } = body;
  if (!username || !displayName || !role || !password) {
    return NextResponse.json({ error: "Username, display name, role, and password are required." }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  // ADMIN accounts are always the "Global" team, regardless of what the
  // client sends — mirrors the seeded super-admin account.
  const resolvedTeam = role === "ADMIN" ? "Global" : (team || null);
  const resolvedMarkets = resolveMarkets(role, markets);
  if (resolvedMarkets.length === 0) {
    return NextResponse.json({ error: "At least one market is required for this role." }, { status: 400 });
  }

  const usernameLower = String(username).toLowerCase();
  const userId = randomUUID();
  const passwordHash = await hashPassword(password);

  // Single atomic statement (one CTE query) instead of separate
  // BEGIN/INSERT/INSERT/COMMIT round-trips. Splitting this across multiple
  // queries over a pooled WebSocket connection was intermittently landing on
  // different backend sessions mid-transaction, so the second insert
  // couldn't see the first — leaving a user with no market access, or (as
  // seen in testing) failing outright with a foreign-key error on a
  // brand-new account. A single statement can't be split like that.
  const pool = getPool();
  try {
    await pool.query(
      `WITH ins_user AS (
         INSERT INTO app_users (user_id, username, display_name, password_hash, role, team_allocation, require_password_change)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING user_id
       )
       INSERT INTO user_market_access (user_id, market_code)
       SELECT user_id, m FROM ins_user, unnest($8::text[]) AS m`,
      [userId, usernameLower, displayName, passwordHash, role, resolvedTeam, !!requirePasswordChange, resolvedMarkets]
    );
    return NextResponse.json({ ok: true, userId });
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (err?.code === "23505" || msg.toLowerCase().includes("app_users_username")) {
      return NextResponse.json({ error: `Username "${usernameLower}" is already taken.` }, { status: 409 });
    }
    return NextResponse.json({ error: msg || "Failed to create user." }, { status: 500 });
  }
}
