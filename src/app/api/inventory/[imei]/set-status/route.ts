import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage, canSetSensitiveInventoryStatus } from "@/lib/auth";
import { randomUUID } from "crypto";
import { roomFor } from "@/app/api/live/route";

// Admin/Manager-only override: jump a device directly to any of the 5
// "settable by hand" statuses, regardless of its current status. This is
// separate from the quick-action buttons (Check-out live / Media hold /
// Check-in / Release hold) that other operating roles use, and is the only
// way to record MISSING (lost/unaccounted-for) or WHOLESALE (bulk-sold
// outside the normal one-customer Orders flow). REPAIRING is intentionally
// not offered here — it stays driven by the RMA flow so its stage tracking
// isn't bypassed.
const SETTABLE_STATUSES = ["IN_STOCK", "CHECKED_OUT_LIVE", "MEDIA_HOLD", "MISSING", "WHOLESALE"];
const REMARK_REQUIRED = new Set(["MISSING", "WHOLESALE"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ imei: string }> }) {
  const { imei } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "inventory")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canSetSensitiveInventoryStatus(session.role)) {
    return NextResponse.json({ error: "Only Admin or Manager can set a device's status this way." }, { status: 403 });
  }

  const { status, remark } = await req.json();
  if (!SETTABLE_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  const trimmedRemark = typeof remark === "string" ? remark.trim() : "";
  if (REMARK_REQUIRED.has(status) && !trimmedRemark) {
    return NextResponse.json({ error: "A remark is required when setting a device to Missing or Wholesale." }, { status: 400 });
  }

  let location: string | null = null;
  if (status === "IN_STOCK") {
    location = "CPSquare Warehouse (TW)";
  } else if (status === "CHECKED_OUT_LIVE") {
    const room = roomFor(session.role, session.team);
    if (!room) {
      return NextResponse.json({ error: "Your account isn't assigned to a team that maps to a livestream room." }, { status: 400 });
    }
    location = room.label;
  }
  // MEDIA_HOLD / MISSING / WHOLESALE: leave current_location as-is — for
  // MISSING in particular, the last known location is useful context
  // alongside the remark, not something to overwrite.

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT status FROM product_items WHERE imei_serial = $1 FOR UPDATE`, [imei]);
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "IMEI not found." }, { status: 404 });
    }
    const fromStatus = current.rows[0].status;

    await client.query(
      `UPDATE product_items
       SET status = $1, current_location = COALESCE($2, current_location), remark = $3,
           updated_by_user_id = $4, updated_at = now(), status_updated_at = now()
       WHERE imei_serial = $5`,
      [status, location, trimmedRemark || null, session.userId, imei]
    );
    await client.query(
      `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, performed_by_user_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), imei, fromStatus, status, session.userId]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, status });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to update status." }, { status: 500 });
  } finally {
    client.release();
  }
}
