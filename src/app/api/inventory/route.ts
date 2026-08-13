import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productItems, productVariants, imeiLogs } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Admin + Packing receive new physical stock — same split as Accessories.
function canManageInventory(role: string) {
  return role === "ADMIN" || role === "PACKING";
}

export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "inventory")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = await db.select().from(productItems).orderBy(desc(productItems.createdAt)).limit(300);
  return NextResponse.json({ items: rows, canManage: canManageInventory(session.role) });
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
  const { imeiSerial, variantId, batteryHealth, cosmeticCondition } = body;
  if (!imeiSerial || !variantId) {
    return NextResponse.json({ error: "IMEI and SKU are required." }, { status: 400 });
  }

  const db = getDb();
  const variant = await db.select({ variantId: productVariants.variantId }).from(productVariants).where(eq(productVariants.variantId, variantId));
  if (variant.length === 0) {
    return NextResponse.json({ error: `SKU "${variantId}" does not exist. Add it in Price Book first.` }, { status: 400 });
  }
  const existing = await db.select({ imeiSerial: productItems.imeiSerial }).from(productItems).where(eq(productItems.imeiSerial, imeiSerial));
  if (existing.length > 0) {
    return NextResponse.json({ error: `IMEI "${imeiSerial}" already exists.` }, { status: 409 });
  }

  await db.insert(productItems).values({
    imeiSerial,
    variantId,
    batteryHealth: batteryHealth !== undefined && batteryHealth !== null && batteryHealth !== "" ? Number(batteryHealth) : null,
    cosmeticCondition: cosmeticCondition || null,
    status: "IN_STOCK",
    currentLocation: "CPSquare Warehouse (TW)",
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
