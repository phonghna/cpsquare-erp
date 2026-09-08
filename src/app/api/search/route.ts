import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productItems, orders } from "@/lib/schema";
import { eq, ilike, sql } from "drizzle-orm";
import { getSession, canAccessPage } from "@/lib/auth";

// Powers the global camera/barcode "scan to search" button: given whatever
// text a barcode/QR decoded to (an IMEI, an order code, or something messy
// with extra characters), figure out what it is and hand back enough for
// the client to jump straight to the right screen — Inventory for a device,
// Packing (if it's still awaiting packing) or Orders otherwise for an order.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (req.nextUrl.searchParams.get("code") || "").trim();
  if (!raw) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const db = getDb();

  // Everyone with inventory access can look up a device by IMEI.
  if (canAccessPage(session.role, "inventory")) {
    const exact = await db.select({ imeiSerial: productItems.imeiSerial }).from(productItems).where(eq(productItems.imeiSerial, raw)).limit(1);
    if (exact[0]) return NextResponse.json({ type: "inventory", imeiSerial: exact[0].imeiSerial });

    // Barcodes sometimes carry extra leading/trailing characters — fall back
    // to a substring match so a slightly-off scan still finds the device.
    if (/^\d{6,}$/.test(raw)) {
      const partial = await db
        .select({ imeiSerial: productItems.imeiSerial })
        .from(productItems)
        .where(ilike(productItems.imeiSerial, `%${raw}%`))
        .limit(1);
      if (partial[0]) return NextResponse.json({ type: "inventory", imeiSerial: partial[0].imeiSerial });
    }
  }

  // Order codes aren't purely numeric (e.g. VN0142Jan2026), so anything that
  // didn't match as an IMEI is worth trying as an order code too — if this
  // role can see Orders at all.
  if (canAccessPage(session.role, "orders")) {
    const exact = await db
      .select({ orderId: orders.orderId, orderCode: orders.orderCode, shipmentStatus: orders.shipmentStatus })
      .from(orders)
      .where(sql`lower(${orders.orderCode}) = lower(${raw})`)
      .limit(1);
    const match = exact[0] || (await db
      .select({ orderId: orders.orderId, orderCode: orders.orderCode, shipmentStatus: orders.shipmentStatus })
      .from(orders)
      .where(ilike(orders.orderCode, `%${raw}%`))
      .limit(1))[0];
    if (match) {
      const needsPacking = ["PENDING_PACK", "PACKED"].includes(match.shipmentStatus) && canAccessPage(session.role, "packing");
      return NextResponse.json({ type: "order", orderId: match.orderId, orderCode: match.orderCode, needsPacking });
    }
  }

  return NextResponse.json({ type: "none" });
}
