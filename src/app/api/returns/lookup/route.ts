import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";

function visibleMarkets(session: { role: string; markets: string[] }) {
  if (["ADMIN", "PACKING", "TECH"].includes(session.role)) return ["VN", "ID", "TH", "PH"];
  return session.markets;
}

// Traces an IMEI back to the order it shipped on (most recent order_items
// match), so the returns screen can show what to process.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "returns")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const imei = req.nextUrl.searchParams.get("imei")?.trim();
  if (!imei) {
    return NextResponse.json({ error: "Provide an IMEI to search." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const itemRes = await client.query(
      `SELECT pi.*, pv.model_name FROM product_items pi
       JOIN product_variants pv ON pv.variant_id = pi.variant_id
       WHERE pi.imei_serial = $1`,
      [imei]
    );
    if (itemRes.rowCount === 0) {
      return NextResponse.json({ error: "No device found with that IMEI." }, { status: 404 });
    }

    const orderRes = await client.query(
      `SELECT o.* FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       WHERE oi.imei_serial = $1
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [imei]
    );
    const order = orderRes.rows[0] || null;

    if (order && !visibleMarkets(session).includes(order.market_code)) {
      return NextResponse.json({ error: "You do not have access to that order's market." }, { status: 403 });
    }

    return NextResponse.json({ item: itemRes.rows[0], order });
  } finally {
    client.release();
  }
}
