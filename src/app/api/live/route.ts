import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productItems, productVariants } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const MARKET_NAMES: Record<string, string> = { VN: "Vietnam", ID: "Indonesia", TH: "Thailand", PH: "Philippines" };
const MARKETS = ["VN", "ID", "TH", "PH"];

export function liveRoomFor(market: string) {
  return `Live Room · ${MARKET_NAMES[market]}`;
}

// All devices currently checked out to a live room, grouped by market.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "live")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = await db.select().from(productItems).where(eq(productItems.status, "CHECKED_OUT_LIVE"));
  const variants = await db.select({ variantId: productVariants.variantId, modelName: productVariants.modelName }).from(productVariants);
  const variantById = new Map(variants.map((v) => [v.variantId, v]));

  const byMarket: Record<string, any[]> = { VN: [], ID: [], TH: [], PH: [] };
  for (const row of rows) {
    const market = MARKETS.find((m) => row.currentLocation.includes(MARKET_NAMES[m]));
    if (market) byMarket[market].push({ ...row, variant: variantById.get(row.variantId) || null });
  }

  const myMarket = session.markets.length === 1 ? session.markets[0] : null;
  return NextResponse.json({ byMarket, myMarket, role: session.role });
}
