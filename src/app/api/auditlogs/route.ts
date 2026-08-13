import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";

function visibleMarkets(session: { role: string; markets: string[] }) {
  if (["ADMIN", "PACKING", "TECH"].includes(session.role)) return ["VN", "ID", "TH", "PH"];
  return session.markets;
}

// Read-only — joins order_logs/imei_logs to orders and app_users for display
// names, so a plain pool query is simpler here than the drizzle read helper.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "auditlogs")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const markets = visibleMarkets(session);

  const pool = getPool();
  const client = await pool.connect();
  try {
    const orderLogs = await client.query(
      `SELECT ol.log_id, ol.order_id, ol.action_type, ol.note, ol.created_at,
              o.order_code, o.market_code, u.display_name AS performed_by_name, u.role AS performed_by_role
       FROM order_logs ol
       JOIN orders o ON o.order_id = ol.order_id
       LEFT JOIN app_users u ON u.user_id = ol.performed_by_user_id
       WHERE o.market_code = ANY($1)
       ORDER BY ol.created_at DESC
       LIMIT 500`,
      [markets]
    );

    const imeiLogs = await client.query(
      `SELECT il.log_id, il.imei_serial, il.status_from, il.status_to, il.related_order_id, il.created_at,
              u.display_name AS performed_by_name, u.role AS performed_by_role, o.order_code AS related_order_code
       FROM imei_logs il
       LEFT JOIN app_users u ON u.user_id = il.performed_by_user_id
       LEFT JOIN orders o ON o.order_id = il.related_order_id
       ORDER BY il.created_at DESC
       LIMIT 500`
    );

    return NextResponse.json({ orderLogs: orderLogs.rows, imeiLogs: imeiLogs.rows });
  } finally {
    client.release();
  }
}
