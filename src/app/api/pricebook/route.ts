import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productVariants } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "pricebook")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.isSerialized, true))
    .orderBy(productVariants.modelGroup);
  return NextResponse.json({ variants: rows, canEdit: session.role === "ADMIN" });
}

// Admin-only: on-the-fly creation of a new serialized product variant.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "pricebook")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only Admin can add new variants." }, { status: 403 });
  }

  const body = await req.json();
  const { sku, brand, modelGroup, storage, color, price } = body;
  if (!sku || !modelGroup || price === undefined || price === null) {
    return NextResponse.json({ error: "SKU, model, and price are required." }, { status: 400 });
  }

  const db = getDb();
  const existing = await db
    .select({ variantId: productVariants.variantId })
    .from(productVariants)
    .where(eq(productVariants.variantId, sku));
  if (existing.length > 0) {
    return NextResponse.json({ error: `SKU "${sku}" already exists.` }, { status: 409 });
  }

  const modelName = [modelGroup, storage].filter(Boolean).join(" ");
  await db.insert(productVariants).values({
    variantId: sku,
    brand: brand || null,
    modelGroup,
    modelName,
    storage: storage || null,
    color: color || null,
    sellingPriceNtd: String(price),
    isSerialized: true,
    stockQuantity: 0,
    reservedQuantity: 0,
  });

  return NextResponse.json({ ok: true, sku });
}
