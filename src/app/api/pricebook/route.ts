import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productVariants } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { eq, sql } from "drizzle-orm";

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

  const logRows = await db.execute(sql`
    SELECT l.log_id, l.variant_id, l.order_id, l.note, l.created_at, u.display_name AS approved_by, o.order_code
    FROM price_change_logs l
    JOIN app_users u ON u.user_id = l.approved_by_user_id
    LEFT JOIN orders o ON o.order_id = l.order_id
    ORDER BY l.created_at DESC
    LIMIT 200
  `);
  const priceLogsRaw = (logRows as any).rows ?? logRows;
  const priceLogs = priceLogsRaw.map((l: any) => ({
    logId: l.log_id,
    variantId: l.variant_id,
    orderCode: l.order_code,
    approvedBy: l.approved_by,
    note: l.note,
    createdAt: l.created_at,
  }));

  return NextResponse.json({ variants: rows, canEdit: session.role === "ADMIN", priceLogs });
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
  let { sku, brand, modelGroup, storage, color, price } = body;
  if (!modelGroup || price === undefined || price === null) {
    return NextResponse.json({ error: "Model and price are required." }, { status: 400 });
  }

  const db = getDb();
  const existingSkus = await db.select({ variantId: productVariants.variantId }).from(productVariants);
  const skuSet = new Set(existingSkus.map((v) => v.variantId));

  if (!sku) {
    const base = `${brand || ""}-${modelGroup}-${storage || ""}-${color || ""}`
      .toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
    sku = base || `SKU-${Date.now()}`;
    let n = 1;
    while (skuSet.has(sku)) { n++; sku = `${base}-${n}`; }
  } else if (skuSet.has(sku)) {
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
