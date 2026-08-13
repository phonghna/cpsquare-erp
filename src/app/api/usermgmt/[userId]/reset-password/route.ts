import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { appUsers } from "@/lib/schema";
import { getSession, canAccessPage, hashPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "usermgmt")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { password } = await req.json();
  if (!password || String(password).length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const db = getDb();
  const passwordHash = await hashPassword(password);
  await db
    .update(appUsers)
    .set({ passwordHash, requirePasswordChange: true, updatedAt: new Date() })
    .where(eq(appUsers.userId, userId));

  return NextResponse.json({ ok: true });
}
