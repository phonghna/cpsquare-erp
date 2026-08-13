import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { orderItems, orders } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { inArray } from "drizzle-orm";

function visibleMarkets(session: { role: string; markets: string[] }) {
  if (["ADMIN", "PACKING", "TECH"].includes(session.role)) return ["VN", "ID", "TH", "PH"];
  return session.markets;
}

// A few sample IMEIs from shipped/delivered orders, so the returns screen can
// offer clickable examples the way the reference demo does.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "returns")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const markets = visibleMarkets(session);
  const db = getDb();

  const eligibleIds = new Set(
    (await db.select().from(orders).where(inArray(orders.marketCode, markets)))
      .filter((o) => ["PACKED", "SHIPPED", "DELIVERED", "DELIVERY_FAILED"].includes(o.shipmentStatus))
      .map((o) => o.orderId)
  );
  if (eligibleIds.size === 0) return NextResponse.json({ imeis: [] });

  const items = await db.select({ imeiSerial: orderItems.imeiSerial, orderId: orderItems.orderId }).from(orderItems).limit(500);
  const imeis = items.filter((i) => eligibleIds.has(i.orderId)).map((i) => i.imeiSerial).slice(0, 3);

  return NextResponse.json({ imeis });
}
