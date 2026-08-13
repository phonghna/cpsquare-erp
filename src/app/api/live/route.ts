import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productItems } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { eq } from "drizzle-orm";

const MARKETS = ["VN", "ID", "TH", "PH"];

export function liveRoomFor(market: string) {
  return `Live Room (${market})`;
}

// All devices currently checked out to a live room, grouped by market.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "live")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = await db.select().from(productItems).where(eq(productItems.status, "CHECKED_OUT_LIVE"));

  const byMarket: Record<string, typeof rows> = { VN: [], ID: [], TH: [], PH: [] };
  for (const row of rows) {
    const market = MARKETS.find((m) => row.currentLocation === liveRoomFor(m));
    if (market) byMarket[market].push(row);
  }

  return NextResponse.json({ byMarket, myMarket: session.markets[0] || null });
}
