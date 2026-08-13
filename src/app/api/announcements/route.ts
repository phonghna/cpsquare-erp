import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { announcements } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const PRIORITIES = ["NORMAL", "IMPORTANT", "URGENT"];

// Admin-only management list — includes soft-deleted rows so it reads as a
// full sent-history, not just what's currently live.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "announcements")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = await db.select().from(announcements).orderBy(desc(announcements.createdAt)).limit(200);

  const readCountsRaw = await db.execute(sql`
    SELECT announcement_id, COUNT(*)::int AS n FROM announcement_reads GROUP BY announcement_id
  `);
  const readCountRows = (readCountsRaw as any).rows ?? readCountsRaw;
  const readCountByAnnouncement = new Map(readCountRows.map((r: any) => [r.announcement_id, r.n]));

  const result = rows.map((a) => ({ ...a, readCount: readCountByAnnouncement.get(a.announcementId) || 0 }));
  return NextResponse.json({ announcements: result });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "announcements")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, content, priority = "NORMAL", targetMarkets = "ALL", startDatetime, expirationDatetime } = body;
  if (!title || !content || !startDatetime || !expirationDatetime) {
    return NextResponse.json({ error: "Title, message, start and expiration are required." }, { status: 400 });
  }
  if (!PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
  }

  const db = getDb();
  await db.insert(announcements).values({
    announcementId: randomUUID(),
    title,
    content,
    priority,
    targetMarkets,
    startDatetime: new Date(startDatetime),
    expirationDatetime: new Date(expirationDatetime),
    createdByUserId: session.userId,
  });

  return NextResponse.json({ ok: true });
}
