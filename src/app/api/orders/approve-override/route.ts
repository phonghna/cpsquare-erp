import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { appUsers } from "@/lib/schema";
import { getSession, verifyPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";

// Re-authentication step for price override approval: a CS/Streamer who
// can't edit price directly asks an Admin/Manager to type their own
// credentials in-app. Verified against the real account, not a shared code.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  const db = getDb();
  const [approver] = await db.select().from(appUsers).where(eq(appUsers.username, String(username).toLowerCase())).limit(1);
  if (!approver || !approver.isActive) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }
  if (!["ADMIN", "MANAGER"].includes(approver.role)) {
    return NextResponse.json({ error: "Only an Admin or Manager can approve a price override." }, { status: 403 });
  }
  const ok = await verifyPassword(password, approver.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  return NextResponse.json({ ok: true, approverUserId: approver.userId, approverName: approver.displayName });
}
