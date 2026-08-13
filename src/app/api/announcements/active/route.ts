import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { announcements } from "@/lib/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

// Powers the header-blinking badge — every authenticated user (not just
// Admin, who owns the management page) can see what's currently live for
// their market(s).
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = await db.select().from(announcements).where(eq(announcements.isActive, true));

  const now = new Date();
  const active = rows.filter((a) => {
    if (a.startDatetime > now || a.expirationDatetime < now) return false;
    if (a.targetMarkets === "ALL") return true;
    const targets = a.targetMarkets.split(",").map((t) => t.trim());
    return session.markets.some((m) => targets.includes(m));
  });

  return NextResponse.json({ announcements: active });
}
