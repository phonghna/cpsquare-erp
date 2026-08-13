import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { announcements } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { eq } from "drizzle-orm";

// Soft delete — sets is_active = false, row stays in history.
export async function POST(_req: Request, { params }: { params: Promise<{ announcementId: string }> }) {
  const { announcementId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "announcements")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  await db.update(announcements).set({ isActive: false }).where(eq(announcements.announcementId, announcementId));
  return NextResponse.json({ ok: true });
}
