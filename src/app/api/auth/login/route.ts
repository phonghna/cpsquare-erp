import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appUsers, userMarketAccess } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, createSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  const [user] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.username, String(username).toLowerCase()))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "No account found with that username." }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "This account has been deactivated." }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const marketRows = await db
    .select()
    .from(userMarketAccess)
    .where(eq(userMarketAccess.userId, user.userId));

  await createSessionCookie({
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    team: user.teamAllocation,
    markets: marketRows.map((m) => m.marketCode),
  });

  return NextResponse.json({ ok: true });
}
