import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { and, desc, inArray } from "drizzle-orm";

function visibleMarkets(session: { role: string; markets: string[] }) {
  if (["ADMIN", "PACKING", "TECH"].includes(session.role)) return ["VN", "ID", "TH", "PH"];
  return session.markets;
}

// Two lists for the Tracking UI: orders awaiting a tracking number (PACKED)
// and orders already SHIPPED/DELIVERED. Search + date-range filtering happens
// client-side against this payload.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "tracking")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const markets = visibleMarkets(session);
  const db = getDb();

  const rows = await db
    .select()
    .from(orders)
    .where(and(inArray(orders.marketCode, markets), inArray(orders.shipmentStatus, ["PACKED", "SHIPPED", "DELIVERED"])))
    .orderBy(desc(orders.createdAt))
    .limit(500);

  return NextResponse.json({
    awaitingTracking: rows.filter((o) => o.shipmentStatus === "PACKED"),
    shippedOrDelivered: rows.filter((o) => o.shipmentStatus === "SHIPPED" || o.shipmentStatus === "DELIVERED"),
  });
}
