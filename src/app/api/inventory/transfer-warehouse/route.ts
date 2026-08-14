import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage, canOperateInventory } from "@/lib/auth";
import { randomUUID } from "crypto";
import { WAREHOUSE_CODES, WAREHOUSE_SITTING_STATUSES } from "@/lib/warehouse";

// Single-item AND bulk transfer share this one endpoint — bulk is just the
// same per-device logic looped inside one transaction, per the spec. Only
// allowed for devices currently "sitting in a warehouse" (IN_STOCK, RESERVED,
// MEDIA_HOLD, PACKING) — doesn't make sense for a device out at a Live Room
// or in repair. Same permission tier as Check-out Live / Media Hold
// (everyone except CS) — this is routine physical handling, not a sensitive
// action like Missing/Wholesale.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "inventory")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canOperateInventory(session.role)) {
    return NextResponse.json({ error: "Your role is search-only for Inventory." }, { status: 403 });
  }

  const { imeiSerials, targetWarehouse } = await req.json();
  if (!Array.isArray(imeiSerials) || imeiSerials.length === 0) {
    return NextResponse.json({ error: "No devices selected." }, { status: 400 });
  }
  if (!WAREHOUSE_CODES.includes(targetWarehouse)) {
    return NextResponse.json({ error: "Invalid target warehouse." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT imei_serial, status, warehouse_code FROM product_items WHERE imei_serial = ANY($1::text[]) FOR UPDATE`,
      [imeiSerials]
    );
    if (current.rowCount !== imeiSerials.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "One or more IMEIs were not found." }, { status: 404 });
    }
    const ineligible = current.rows.filter((r) => !WAREHOUSE_SITTING_STATUSES.includes(r.status));
    if (ineligible.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `${ineligible.length} selected device(s) aren't sitting in a warehouse right now (checked out, in repair, etc.) and can't be transferred.` }, { status: 409 });
    }
    const sourceCodes = new Set(current.rows.map((r) => r.warehouse_code));
    if (sourceCodes.size > 1) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Selected devices are split across both warehouses — select devices from a single warehouse first." }, { status: 409 });
    }
    const sourceCode = current.rows[0].warehouse_code;
    if (sourceCode === targetWarehouse) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Selected device(s) are already at that warehouse." }, { status: 409 });
    }

    await client.query(
      `UPDATE product_items SET warehouse_code = $1, updated_by_user_id = $2, updated_at = now() WHERE imei_serial = ANY($3::text[])`,
      [targetWarehouse, session.userId, imeiSerials]
    );
    for (const row of current.rows) {
      await client.query(
        `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, performed_by_user_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [randomUUID(), row.imei_serial, sourceCode, targetWarehouse, session.userId]
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, transferred: current.rows.length, targetWarehouse });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Transfer failed." }, { status: 500 });
  } finally {
    client.release();
  }
}
