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

  // Transactional so the user row and its market-access rows are always
  // created together — a partial failure previously left a user with no
  // markets (shown as "—" in the console) and no error surfaced to the UI.
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`SELECT user_id FROM app_users WHERE username = $1 FOR UPDATE`, [usernameLower]);
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Username "${usernameLower}" is already taken.` }, { status: 409 });
    }
    await client.query(
      `INSERT INTO app_users (user_id, username, display_name, password_hash, role, team_allocation, require_password_change)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, usernameLower, displayName, passwordHash, role, resolvedTeam, !!requirePasswordChange]
    );
    for (const marketCode of resolvedMarkets) {
      await client.query(`INSERT INTO user_market_access (user_id, market_code) VALUES ($1,$2)`, [userId, marketCode]);
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, userId });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to create user." }, { status: 500 });
  } finally {
    client.release();
  }
}
