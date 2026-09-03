import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";

// Admin-only — corrects data-entry mistakes on an existing device: its
// assigned model/variant, battery %, cosmetic condition, and even the IMEI
// serial itself (the primary key). Allowed regardless of the device's
// current status (IN_STOCK, RESERVED, SHIPPED, ...) since this is a pure
// data-correction tool, not a status transition — order_items already
// stores its own locked variant_id/item_price_ntd snapshot at order time,
// so correcting product_items' catalog identity later doesn't retroactively
// alter a past order.
//
// Renaming the IMEI cascades the new value into order_items and imei_logs,
// which mirror imei_serial as plain text (no DB-level foreign key — see
// schema.ts, nothing uses .references()), so those rows would otherwise
// silently keep pointing at a serial number that no longer exists.
export async function POST(req: NextRequest, { params }: { params: Promise<{ imei: string }> }) {
  const { imei } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "inventory")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only Admin can edit a device's details." }, { status: 403 });
  }

  const body = await req.json();
  const { imeiSerial, variantId, batteryHealth, cosmeticCondition } = body;
  const newImei = typeof imeiSerial === "string" ? imeiSerial.trim() : "";
  if (!newImei || !variantId) {
    return NextResponse.json({ error: "IMEI and model are required." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT imei_serial FROM product_items WHERE imei_serial = $1 FOR UPDATE`, [imei]);
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "IMEI not found." }, { status: 404 });
    }

    const variant = await client.query(`SELECT variant_id FROM product_variants WHERE variant_id = $1 AND is_serialized = TRUE`, [variantId]);
    if (variant.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Model "${variantId}" does not exist.` }, { status: 400 });
    }

    if (newImei !== imei) {
      const dup = await client.query(`SELECT 1 FROM product_items WHERE imei_serial = $1`, [newImei]);
      if ((dup.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `IMEI ${newImei} already exists in the system.` }, { status: 409 });
      }
    }

    const battery = batteryHealth === null || batteryHealth === undefined || batteryHealth === "" ? null : Number(batteryHealth);
    const cosmetic = cosmeticCondition ? String(cosmeticCondition) : null;

    await client.query(
      `UPDATE product_items
       SET imei_serial = $1, variant_id = $2, battery_health = $3, cosmetic_condition = $4,
           updated_by_user_id = $5, updated_at = now()
       WHERE imei_serial = $6`,
      [newImei, variantId, battery, cosmetic, session.userId, imei]
    );

    if (newImei !== imei) {
      await client.query(`UPDATE order_items SET imei_serial = $1 WHERE imei_serial = $2`, [newImei, imei]);
      await client.query(`UPDATE imei_logs SET imei_serial = $1 WHERE imei_serial = $2`, [newImei, imei]);
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, imeiSerial: newImei });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to update device." }, { status: 500 });
  } finally {
    client.release();
  }
}
