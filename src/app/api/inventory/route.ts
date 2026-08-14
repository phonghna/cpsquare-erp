import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productItems, productVariants, imeiLogs, orders } from "@/lib/schema";
import { getSession, canAccessPage, canSetSensitiveInventoryStatus } from "@/lib/auth";
import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { deriveDisplayLocation, WAREHOUSE_CODES } from "@/lib/warehouse";

// Only Admin manages the physical device catalog (add / bulk import / delete),
// matching the v8.6 design reference.
function canManageInventory(role: string) {
  return role === "ADMIN";
}

export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "inventory")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const items = await db.select().from(productItems).orderBy(desc(productItems.createdAt)).limit(500);

  const variants = await db.select({ variantId: productVariants.variantId, modelName: productVariants.modelName, color: productVariants.color }).from(productVariants);
  const variantById = new Map(variants.map((v) => [v.variantId, v]));

  const orderIds = Array.from(new Set(items.map((i) => i.orderId).filter(Boolean))) as string[];
  const orderRows = orderIds.length
    ? await db.select({ orderId: orders.orderId, orderCode: orders.orderCode, customerName: orders.customerName, customerSocialHandle: orders.customerSocialHandle, marketCode: orders.marketCode }).from(orders).where(inArray(orders.orderId, orderIds))
    : [];
  const orderById = new Map(orderRows.map((o) => [o.orderId, o]));

  const result = items.map((i) => ({
    ...i,
    // current_location is derived from warehouse_code for statuses where
    // the device is physically sitting in a warehouse (or last known,
    // for SHIPPED) — see src/lib/warehouse.ts. Everything else (Live Room,
    // Admin, Technical Repair Room, etc.) is unchanged, existing behavior.
    currentLocation: deriveDisplayLocation(i.status, i.warehouseCode, i.currentLocation),
    variant: variantById.get(i.variantId) || null,
    order: i.orderId ? orderById.get(i.orderId) || null : null,
  }));

  return NextResponse.json({
    items: result,
    canManage: canManageInventory(session.role),
    canSetStatus: canSetSensitiveInventoryStatus(session.role),
    isAdmin: session.role === "ADMIN",
  });
}

// Receive a single new IMEI unit into stock (IN_STOCK, central warehouse).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "inventory")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canManageInventory(session.role)) {
    return NextResponse.json({ error: "Your role cannot add new IMEI stock." }, { status: 403 });
  }

  const body = await req.json();
  const { imeiSerial, variantId, batteryHealth, cosmeticCondition, warehouseCode } = body;
  if (!imeiSerial || !variantId) {
    return NextResponse.json({ error: "IMEI and SKU are required." }, { status: 400 });
  }
  const resolvedWarehouse = WAREHOUSE_CODES.includes(warehouseCode) ? warehouseCode : "XINSHENG";

  const db = getDb();
  const variant = await db.select({ variantId: productVariants.variantId }).from(productVariants).where(eq(productVariants.variantId, variantId));
  if (variant.length === 0) {
    return NextResponse.json({ error: `SKU "${variantId}" does not exist.` }, { status: 400 });
  }
  const existing = await db.select({ imeiSerial: productItems.imeiSerial }).from(productItems).where(eq(productItems.imeiSerial, imeiSerial));
  if (existing.length > 0) {
    return NextResponse.json({ error: `Duplicate IMEI ${imeiSerial} already exists in the system.` }, { status: 409 });
  }

  await db.insert(productItems).values({
    imeiSerial,
    variantId,
    batteryHealth: batteryHealth !== undefined && batteryHealth !== null && batteryHealth !== "" ? Number(batteryHealth) : null,
    cosmeticCondition: cosmeticCondition || null,
    status: "IN_STOCK",
    currentLocation: "CPSquare Warehouse (TW)",
    warehouseCode: resolvedWarehouse,
    updatedByUserId: session.userId,
  });
  await db.insert(imeiLogs).values({
    logId: randomUUID(),
    imeiSerial,
    statusFrom: null,
    statusTo: "IN_STOCK",
    performedByUserId: session.userId,
  });

  return NextResponse.json({ ok: true, imeiSerial });
}
