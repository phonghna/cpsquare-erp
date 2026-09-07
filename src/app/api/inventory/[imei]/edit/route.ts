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

  const battery = batteryHealth === null || batteryHealth === undefined || batteryHealth === "" ? null : Number(batteryHealth);
  const cosmetic = cosmeticCondition ? String(cosmeticCondition) : null;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT * FROM product_items WHERE imei_serial = $1 FOR UPDATE`, [imei]);
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "IMEI not found." }, { status: 404 });
    }
    const row = current.rows[0];

    const variant = await client.query(`SELECT variant_id FROM product_variants WHERE variant_id = $1 AND is_serialized = TRUE`, [variantId]);
    if (variant.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Model "${variantId}" does not exist.` }, { status: 400 });
    }

    if (newImei === imei) {
      // No IMEI change — a plain in-place update, no foreign-key concerns.
      await client.query(
        `UPDATE product_items SET variant_id = $1, battery_health = $2, cosmetic_condition = $3, updated_by_user_id = $4, updated_at = now() WHERE imei_serial = $5`,
        [variantId, battery, cosmetic, session.userId, imei]
      );
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, imeiSerial: newImei });
    }

    // Renaming the primary key is trickier than it looks: order_items has a
    // real foreign key on imei_serial (order_items_imei_serial_fkey) —
    // discovered when a delete on a previously-ordered device hit it. That
    // FK is checked immediately (not deferrable), so neither ordering of a
    // plain UPDATE works: changing product_items.imei_serial first leaves
    // any order_items row still pointing at a value that no longer exists
    // in the parent table; repointing order_items to the new value first
    // fails because that new parent row doesn't exist yet. The safe
    // sequence is insert-new-parent -> repoint-children -> delete-old-parent,
    // so a valid parent row exists at every step.
    const dup = await client.query(`SELECT 1 FROM product_items WHERE imei_serial = $1`, [newImei]);
    if ((dup.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `IMEI ${newImei} already exists in the system.` }, { status: 409 });
    }

    await client.query(
      `INSERT INTO product_items
         (imei_serial, variant_id, battery_health, cosmetic_condition, status, current_location,
          order_id, rma_stage, remark, status_updated_at, warehouse_code, updated_by_user_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())`,
      [
        newImei, variantId, battery, cosmetic, row.status, row.current_location,
        row.order_id, row.rma_stage, row.remark, row.status_updated_at, row.warehouse_code,
        session.userId, row.created_at,
      ]
    );
    await client.query(`UPDATE order_items SET imei_serial = $1 WHERE imei_serial = $2`, [newImei, imei]);
    await client.query(`UPDATE imei_logs SET imei_serial = $1 WHERE imei_serial = $2`, [newImei, imei]);
    await client.query(`DELETE FROM product_items WHERE imei_serial = $1`, [imei]);

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, imeiSerial: newImei });
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err?.code === "23505") {
      return NextResponse.json({ error: `IMEI ${newImei} already exists in the system.` }, { status: 409 });
    }
    return NextResponse.json({ error: err.message || "Failed to update device." }, { status: 500 });
  } finally {
    client.release();
  }
}
