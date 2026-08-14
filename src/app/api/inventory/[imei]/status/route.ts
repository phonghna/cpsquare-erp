import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage, canOperateInventory } from "@/lib/auth";
import { randomUUID } from "crypto";
import { roomFor } from "@/app/api/live/route";

const ALLOWED_TRANSITIONS: Record<string, string> = {
  CHECKOUT_LIVE: "CHECKED_OUT_LIVE",
  CHECKIN: "IN_STOCK",
  MEDIA_HOLD: "MEDIA_HOLD",
  RELEASE_HOLD: "IN_STOCK",
  UNASSIGN: "IN_STOCK",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ imei: string }> }) {
  const { imei } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "inventory")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canOperateInventory(session.role)) {
    return NextResponse.json({ error: "Your role is search-only for Inventory." }, { status: 403 });
  }

  const { action } = await req.json();
  const nextStatus = ALLOWED_TRANSITIONS[action];
  if (!nextStatus) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT status FROM product_items WHERE imei_serial = $1 FOR UPDATE`,
      [imei]
    );
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "IMEI not found." }, { status: 404 });
    }
    const fromStatus = current.rows[0].status;
    if (action === "UNASSIGN" && fromStatus !== "RESERVED") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Only a RESERVED device can be unassigned." }, { status: 409 });
    }

    if (action === "CHECKOUT_LIVE" && !roomFor(session.role, session.team)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Your account isn't assigned to a team that maps to a livestream room." }, { status: 400 });
    }

    // Live check-outs are routed to a market/Admin room by the caller's own
    // role/team — same rule the Livestream Rotation page uses — so this
    // Inventory-board shortcut and the dedicated Live Rotation check-out
    // button always agree on where a device lands.
    const location =
      action === "CHECKOUT_LIVE" ? roomFor(session.role, session.team)!.label :
      (action === "CHECKIN" || action === "RELEASE_HOLD" || action === "UNASSIGN") ? "CPSquare Warehouse (TW)" : undefined;

    await client.query(
      `UPDATE product_items
       SET status = $1, current_location = COALESCE($2, current_location), order_id = CASE WHEN $5 THEN NULL ELSE order_id END,
           updated_by_user_id = $3, updated_at = now()
       WHERE imei_serial = $4`,
      [nextStatus, location ?? null, session.userId, imei, action === "UNASSIGN"]
    );
    await client.query(
      `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, performed_by_user_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), imei, fromStatus, nextStatus, session.userId]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Update failed." }, { status: 500 });
  } finally {
    client.release();
  }
}
