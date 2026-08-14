import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";

// Admin-only bulk add: pasted CSV-like textarea, one row per line:
//   sku,brand,model,storage,color,price
// SKU is always caller-supplied — kept consistent with the single "Add New
// Product Variant" form, which also requires an explicit SKU.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "pricebook")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only Admin can bulk add product variants." }, { status: 403 });
  }

  const { csv } = await req.json();
  if (!csv || typeof csv !== "string") {
    return NextResponse.json({ error: "No CSV text provided." }, { status: 400 });
  }

  const lines = csv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.toLowerCase().startsWith("sku,"));
  if (lines.length === 0) {
    return NextResponse.json({ error: "No data rows found." }, { status: 400 });
  }

  type Row = { sku: string; brand: string | null; modelGroup: string; storage: string | null; color: string | null; price: number };
  const rows: Row[] = [];
  const errors: string[] = [];
  const seenInBatch = new Set<string>();
  lines.forEach((line, idx) => {
    const [skuRaw, brand, modelGroup, storage, color, price] = line.split(",").map((p) => p.trim());
    const sku = skuRaw ? skuRaw.toUpperCase() : "";
    if (!sku || !modelGroup || !price) {
      errors.push(`Line ${idx + 1}: expected "sku,brand,model,storage,color,price" — got "${line}"`);
      return;
    }
    const priceNum = Number(price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      errors.push(`Line ${idx + 1}: price must be a number — got "${price}"`);
      return;
    }
    if (seenInBatch.has(sku)) {
      errors.push(`Line ${idx + 1}: SKU "${sku}" is duplicated within this batch — skipped.`);
      return;
    }
    seenInBatch.add(sku);
    rows.push({ sku, brand: brand || null, modelGroup, storage: storage || null, color: color || null, price: priceNum });
  });
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid rows.", details: errors }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`SELECT variant_id FROM product_variants`);
    const skuSet = new Set<string>(existing.rows.map((r: any) => r.variant_id));
    let imported = 0;
    for (const row of rows) {
      if (skuSet.has(row.sku)) {
        errors.push(`SKU "${row.sku}" already exists — skipped.`);
        continue;
      }
      const modelName = [row.modelGroup, row.storage].filter(Boolean).join(" ");
      await client.query(
        `INSERT INTO product_variants (variant_id, brand, model_group, model_name, storage, color, selling_price_ntd, is_serialized, stock_quantity, reserved_quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,0,0)`,
        [row.sku, row.brand, row.modelGroup, modelName, row.storage, row.color, row.price.toFixed(2)]
      );
      skuSet.add(row.sku);
      imported++;
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, imported, errors });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Bulk add failed." }, { status: 500 });
  } finally {
    client.release();
  }
}
