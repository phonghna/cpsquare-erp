import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productVariants } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { eq } from "drizzle-orm";

// Admin + Packing are the only roles allowed to create new SKUs or bulk
// import — everyone else with page access is quick-adjust / read only.
function canManageAccessories(role: string) {
  return role === "ADMIN" || role === "PACKING";
}

export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "accessories")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.isSerialized, false))
    .orderBy(productVariants.modelGroup);
  return NextResponse.json({
    accessories: rows,
    canManage: canManageAccessories(session.role),
  });
}

// Creates a single new accessory SKU (quantity-based, is_serialized = false).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "accessories")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canManageAccessories(session.role)) {
    return NextResponse.json({ error: "Your role cannot add new accessories." }, { status: 403 });
  }

  const body = await req.json();
  const { sku, name, compatibleModel, price, quantity } = body;
  if (!sku || !name || price === undefined || price === null || quantity === undefined || quantity === null) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const db = getDb();
  const existing = await db
    .select({ variantId: productVariants.variantId })
    .from(productVariants)
    .where(eq(productVariants.variantId, sku));
  if (existing.length > 0) {
    return NextResponse.json({ error: `SKU "${sku}" already exists.` }, { status: 409 });
  }

  await db.insert(productVariants).values({
    variantId: sku,
    modelGroup: name,
    modelName: name,
    sellingPriceNtd: String(price),
    isSerialized: false,
    stockQuantity: Number(quantity),
    reservedQuantity: 0,
    compatibleModel: compatibleModel || null,
  });

  return NextResponse.json({ ok: true, sku });
}
