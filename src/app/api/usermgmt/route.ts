import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { appUsers, userMarketAccess } from "@/lib/schema";
import { getSession, canAccessPage, hashPassword, ROLE_SCOPE } from "@/lib/auth";
import { eq, inArray } from "drizzle-orm";
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

  const body = await req.json();
  const { username, displayName, role, team, markets = [], password, requirePasswordChange = false } = body;
  if (!username || !displayName || !role || !password) {
    return NextResponse.json({ error: "Username, display name, role, and password are required." }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  const resolvedMarkets = resolveMarkets(role, markets);
  if (resolvedMarkets.length === 0) {
    return NextResponse.json({ error: "At least one market is required for this role." }, { status: 400 });
  }

  const db = getDb();
  const usernameLower = String(username).toLowerCase();
  const existing = await db.select({ userId: appUsers.userId }).from(appUsers).where(eq(appUsers.username, usernameLower));
  if (existing.length > 0) {
    return NextResponse.json({ error: `Username "${usernameLower}" is already taken.` }, { status: 409 });
  }

  const userId = randomUUID();
  const passwordHash = await hashPassword(password);

  await db.insert(appUsers).values({
    userId,
    username: usernameLower,
    displayName,
    passwordHash,
    role,
    teamAllocation: team || null,
    requirePasswordChange: !!requirePasswordChange,
  });
  await db.insert(userMarketAccess).values(resolvedMarkets.map((marketCode) => ({ userId, marketCode })));

  return NextResponse.json({ ok: true, userId });
}
