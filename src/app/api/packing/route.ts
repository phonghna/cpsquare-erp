import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { orders, orderItems, orderAccessories } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { and, eq, inArray } from "drizzle-orm";

function visibleMarkets(session: { role: string; markets: string[] }) {
  if (["ADMIN", "PACKING", "TECH"].includes(session.role)) return ["VN", "ID", "TH", "PH"];
  return session.markets;
}

// Orders awaiting packing, with their IMEI line items and accessory checklist
// rows attached, grouped by carrier on the client into 711 / FAMILY / TCAT buckets.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "packing")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const markets = visibleMarkets(session);
  const db = getDb();

  const pendingOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.shipmentStatus, "PENDING_PACK"), inArray(orders.marketCode, markets)));

  if (pendingOrders.length === 0) {
    return NextResponse.json({ orders: [] });
  }
  const orderIds = pendingOrders.map((o) => o.orderId);

  const [items, accessories] = await Promise.all([
    db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)),
    db.select().from(orderAccessories).where(inArray(orderAccessories.orderId, orderIds)),
  ]);

  const result = pendingOrders.map((o) => ({
    ...o,
    items: items.filter((i) => i.orderId === o.orderId),
    accessories: accessories.filter((a) => a.orderId === o.orderId),
  }));

  return NextResponse.json({ orders: result });
}
