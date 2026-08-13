import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";

// Bulk import: pasted CSV-like textarea, one row per line:
//   sku,name,qty,price,compatible_model
// compatible_model may be blank (= Universal / fits all models).
// Upserts by SKU: existing rows get name/qty/price/compatible_model overwritten.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "accessories")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "ADMIN" && session.role !== "PACKING") {
    return NextResponse.json({ error: "Your role cannot bulk import." }, { status: 403 });
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

  type Row = { sku: string; name: string; qty: number; price: number; compatibleModel: string | null };
  const rows: Row[] = [];
  const errors: string[] = [];

  lines.forEach((line, idx) => {
    const parts = line.split(",").map((p) => p.trim());
    const [sku, name, qty, price, compatibleModel] = parts;
    if (!sku || !name || qty === undefined || price === undefined) {
      errors.push(`Line ${idx + 1}: expected "sku,name,qty,price,compatible_model" — got "${line}"`);
      return;
    }
    const qtyNum = Number(qty);
    const priceNum = Number(price);
    if (Number.isNaN(qtyNum) || Number.isNaN(priceNum)) {
      errors.push(`Line ${idx + 1}: qty/price must be numbers — got "${line}"`);
      return;
    }
    rows.push({ sku, name, qty: qtyNum, price: priceNum, compatibleModel: compatibleModel || null });
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid rows.", details: errors }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      await client.query(
        `INSERT INTO product_variants
           (variant_id, model_group, model_name, selling_price_ntd, is_serialized, stock_quantity, reserved_quantity, compatible_model)
         VALUES ($1,$2,$2,$3,FALSE,$4,0,$5)
         ON CONFLICT (variant_id) DO UPDATE SET
           model_group = EXCLUDED.model_group,
           model_name = EXCLUDED.model_name,
           selling_price_ntd = EXCLUDED.selling_price_ntd,
           stock_quantity = EXCLUDED.stock_quantity,
           compatible_model = EXCLUDED.compatible_model`,
        [row.sku, row.name, row.price, row.qty, row.compatibleModel]
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, imported: rows.length, errors });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Bulk import failed." }, { status: 500 });
  } finally {
    client.release();
  }
}
