import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";
import { WAREHOUSE_CODES } from "@/lib/warehouse";

// Bulk receive: pasted CSV-like textarea, one row per line:
//   imei,variant_id,battery_health,cosmetic_condition
// battery_health and cosmetic_condition may be blank.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "inventory")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only Admin can bulk import IMEI stock." }, { status: 403 });
  }

  const { csv, warehouseCode } = await req.json();
  if (!csv || typeof csv !== "string") {
    return NextResponse.json({ error: "No CSV text provided." }, { status: 400 });
  }
  const resolvedWarehouse = WAREHOUSE_CODES.includes(warehouseCode) ? warehouseCode : "XINSHENG";

  const lines = csv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.toLowerCase().startsWith("imei,"));
  if (lines.length === 0) {
    return NextResponse.json({ error: "No data rows found." }, { status: 400 });
  }

  type Row = { imei: string; variantId: string; battery: number | null; condition: string | null };
  const rows: Row[] = [];
  const errors: string[] = [];
  lines.forEach((line, idx) => {
    const [imei, variantId, battery, condition] = line.split(",").map((p) => p.trim());
    if (!imei || !variantId) {
      errors.push(`Line ${idx + 1}: expected "imei,variant_id,battery_health,cosmetic_condition" — got "${line}"`);
      return;
    }
    const batteryNum = battery ? Number(battery) : null;
    if (battery && Number.isNaN(batteryNum)) {
      errors.push(`Line ${idx + 1}: battery_health must be a number — got "${battery}"`);
      return;
    }
    rows.push({ imei, variantId, battery: batteryNum, condition: condition || null });
  });
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid rows.", details: errors }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let imported = 0;
    for (const row of rows) {
      const variantCheck = await client.query(`SELECT 1 FROM product_variants WHERE variant_id = $1`, [row.variantId]);
      if (variantCheck.rowCount === 0) {
        errors.push(`SKU "${row.variantId}" does not exist — skipped IMEI ${row.imei}.`);
        continue;
      }
      const dupeCheck = await client.query(`SELECT 1 FROM product_items WHERE imei_serial = $1`, [row.imei]);
      if ((dupeCheck.rowCount ?? 0) > 0) {
        errors.push(`IMEI "${row.imei}" already exists — skipped.`);
        continue;
      }
      await client.query(
        `INSERT INTO product_items (imei_serial, variant_id, battery_health, cosmetic_condition, status, current_location, warehouse_code, updated_by_user_id)
         VALUES ($1,$2,$3,$4,'IN_STOCK','CPSquare Warehouse (TW)',$5,$6)`,
        [row.imei, row.variantId, row.battery, row.condition, resolvedWarehouse, session.userId]
      );
      await client.query(
        `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, performed_by_user_id)
         VALUES ($1,$2,NULL,'IN_STOCK',$3)`,
        [randomUUID(), row.imei, session.userId]
      );
      imported++;
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, imported, errors });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Bulk import failed." }, { status: 500 });
  } finally {
    client.release();
  }
}
