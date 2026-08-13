import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPool } from "@/lib/db-pool";
import { orders } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { desc, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

function visibleMarkets(session: { role: string; markets: string[] }) {
  if (["ADMIN", "PACKING", "TECH"].includes(session.role)) return ["VN", "ID", "TH", "PH"];
  return session.markets;
}

const MARKET_PREFIX: Record<string, string> = { VN: "V", ID: "I", TH: "T", PH: "P" };
const MONTH_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const markets = visibleMarkets(session);
  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(inArray(orders.marketCode, markets))
    .orderBy(desc(orders.createdAt))
    .limit(200);
  return NextResponse.json({ orders: rows });
}

// Creates a single-phone order and atomically claims one IN_STOCK IMEI for
// the requested variant. Uses SELECT ... FOR UPDATE SKIP LOCKED inside a real
// transaction so two concurrent requests can never claim the same device.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["ADMIN", "MANAGER", "CS", "STREAMER"].includes(session.role)) {
    return NextResponse.json({ error: "Your role cannot create orders." }, { status: 403 });
  }

  const body = await req.json();
  const {
    marketCode, salesChannel, variantId, customerName, customerSocialHandle,
    customerPhone, postalCode, shippingAddress, carrierService, paymentType,
    downpayment = 0, price,
  } = body;

  if (!marketCode || !variantId || !customerName || !shippingAddress || !carrierService || !paymentType || !price) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (!visibleMarkets(session).includes(marketCode)) {
    return NextResponse.json({ error: "You do not have access to that market." }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock exactly one available unit of this variant so no one else can take it.
    const claim = await client.query(
      `SELECT imei_serial FROM product_items
       WHERE variant_id = $1 AND status = 'IN_STOCK'
       ORDER BY imei_serial
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [variantId]
    );
    if (claim.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "No IN_STOCK device available for this SKU." }, { status: 409 });
    }
    const imei: string = claim.rows[0].imei_serial;

    // Generate order_code with a per-market, per-month sequence (locked row prevents duplicates).
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const counter = await client.query(
      `INSERT INTO order_code_counters (market_code, year_month, last_sequence)
       VALUES ($1, $2, 1)
       ON CONFLICT (market_code, year_month)
       DO UPDATE SET last_sequence = order_code_counters.last_sequence + 1
       RETURNING last_sequence`,
      [marketCode, yearMonth]
    );
    const seq = counter.rows[0].last_sequence;
    const orderCode = `${MARKET_PREFIX[marketCode]}${seq}${MONTH_ABBR[now.getMonth()]}${now.getFullYear()}`;

    const total = Number(price);
    let downReceived = 0, codCollect = total, remaining = 0;
    if (paymentType === "DOWNPAYMENT_COD") { downReceived = Number(downpayment); codCollect = Math.max(0, total - downReceived); }
    if (paymentType === "INSTALLMENT") { downReceived = Number(downpayment); codCollect = downReceived; remaining = Math.max(0, total - downReceived); }

    const orderId = randomUUID();
    await client.query(
      `INSERT INTO orders (order_id, order_code, market_code, sales_channel, customer_name,
         customer_social_handle, customer_phone, postal_code, shipping_address, carrier_service,
         payment_type, total_invoice_amount_ntd, downpayment_received_ntd, cod_collect_amount_ntd,
         remaining_balance_ntd, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [orderId, orderCode, marketCode, salesChannel, customerName, customerSocialHandle || null,
       customerPhone || null, postalCode || null, shippingAddress, carrierService, paymentType,
       total, downReceived, codCollect, remaining, session.userId]
    );

    const itemId = randomUUID();
    await client.query(
      `INSERT INTO order_items (item_id, order_id, variant_id, imei_serial, item_price_ntd)
       VALUES ($1,$2,$3,$4,$5)`,
      [itemId, orderId, variantId, imei, total]
    );

    await client.query(
      `UPDATE product_items SET status = 'RESERVED', order_id = $1, updated_by_user_id = $2, updated_at = now()
       WHERE imei_serial = $3`,
      [orderId, session.userId, imei]
    );

    await client.query(
      `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, related_order_id, performed_by_user_id)
       VALUES ($1,$2,'IN_STOCK','RESERVED',$3,$4)`,
      [randomUUID(), imei, orderId, session.userId]
    );
    await client.query(
      `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note)
       VALUES ($1,$2,'ORDER_CREATED',$3,$4)`,
      [randomUUID(), orderId, session.userId, `1 item, total ${total} NTD, IMEI ${imei}`]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, orderId, orderCode, imei });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to create order." }, { status: 500 });
  } finally {
    client.release();
  }
}
