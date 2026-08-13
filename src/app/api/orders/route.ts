import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPool } from "@/lib/db-pool";
import { orders, orderItems, orderAccessories } from "@/lib/schema";
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

  if (rows.length === 0) return NextResponse.json({ orders: [], role: session.role });
  const orderIds = rows.map((o) => o.orderId);
  const [items, accessories] = await Promise.all([
    db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)),
    db.select().from(orderAccessories).where(inArray(orderAccessories.orderId, orderIds)),
  ]);

  const result = rows.map((o) => ({
    ...o,
    items: items.filter((i) => i.orderId === o.orderId),
    accessories: accessories.filter((a) => a.orderId === o.orderId),
  }));
  return NextResponse.json({ orders: result, role: session.role });
}

type ItemInput = { variantId: string; price: number; imeiMode: "auto" | "manual"; manualImei?: string };

// Creates a multi-item order: each phone row claims either a specific IMEI
// (manual) or the first available unit for its SKU (auto, SKIP LOCKED), all
// inside one transaction so concurrent staff can never double-claim a device.
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
    marketCode, salesChannel, customerName, customerSocialHandle,
    customerPhone, postalCode, shippingAddress, carrierService, paymentType,
    downpayment = 0, installmentTerm,
    items, accessoryVariantIds = [],
    priceOverridden = false, approvedByUserId = null,
  }: {
    marketCode: string; salesChannel: string; customerName: string; customerSocialHandle?: string;
    customerPhone?: string; postalCode?: string; shippingAddress: string; carrierService: string; paymentType: string;
    downpayment?: number; installmentTerm?: number;
    items: ItemInput[]; accessoryVariantIds?: string[];
    priceOverridden?: boolean; approvedByUserId?: string | null;
  } = body;

  if (!marketCode || !items?.length || !customerName || !shippingAddress || !carrierService || !paymentType) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (!visibleMarkets(session).includes(marketCode)) {
    return NextResponse.json({ error: "You do not have access to that market." }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const claimedImeis: string[] = [];
    const resolvedItems: { variantId: string; imei: string; price: number }[] = [];
    for (const row of items) {
      let imei: string;
      if (row.imeiMode === "manual") {
        if (!row.manualImei) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Manual IMEI is required for that row." }, { status: 400 }); }
        const claim = await client.query(
          `SELECT imei_serial FROM product_items WHERE imei_serial = $1 AND status = 'IN_STOCK' FOR UPDATE`,
          [row.manualImei]
        );
        if (claim.rowCount === 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: `IMEI ${row.manualImei} is not available.` }, { status: 409 }); }
        imei = claim.rows[0].imei_serial;
      } else {
        const claim = await client.query(
          `SELECT imei_serial FROM product_items WHERE variant_id = $1 AND status = 'IN_STOCK'
           ORDER BY imei_serial FOR UPDATE SKIP LOCKED LIMIT 1`,
          [row.variantId]
        );
        if (claim.rowCount === 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: `No IN_STOCK device available for ${row.variantId}.` }, { status: 409 }); }
        imei = claim.rows[0].imei_serial;
      }
      claimedImeis.push(imei);
      resolvedItems.push({ variantId: row.variantId, imei, price: Number(row.price) });
    }

    // Claim accessories (decrement stock, increment reserved)
    const claimedAccessories: { variantId: string; name: string }[] = [];
    for (const variantId of accessoryVariantIds as string[]) {
      const acc = await client.query(
        `SELECT model_name, stock_quantity FROM product_variants WHERE variant_id = $1 AND is_serialized = FALSE FOR UPDATE`,
        [variantId]
      );
      if (acc.rowCount === 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: `Accessory ${variantId} not found.` }, { status: 400 }); }
      if (acc.rows[0].stock_quantity <= 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: `Accessory ${variantId} is out of stock.` }, { status: 409 }); }
      await client.query(`UPDATE product_variants SET stock_quantity = stock_quantity - 1, reserved_quantity = reserved_quantity + 1 WHERE variant_id = $1`, [variantId]);
      claimedAccessories.push({ variantId, name: acc.rows[0].model_name });
    }

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const counter = await client.query(
      `INSERT INTO order_code_counters (market_code, year_month, last_sequence)
       VALUES ($1, $2, 1)
       ON CONFLICT (market_code, year_month) DO UPDATE SET last_sequence = order_code_counters.last_sequence + 1
       RETURNING last_sequence`,
      [marketCode, yearMonth]
    );
    const seq = counter.rows[0].last_sequence;
    const orderCode = `${MARKET_PREFIX[marketCode]}${seq}${MONTH_ABBR[now.getMonth()]}${now.getFullYear()}`;

    const total = resolvedItems.reduce((s, i) => s + i.price, 0);
    let downReceived = 0, codCollect = total, remaining = 0;
    if (paymentType === "DOWNPAYMENT_COD") { downReceived = Number(downpayment); codCollect = Math.max(0, total - downReceived); }
    if (paymentType === "INSTALLMENT") { downReceived = Number(downpayment); codCollect = downReceived; remaining = Math.max(0, total - downReceived); }

    const orderId = randomUUID();
    await client.query(
      `INSERT INTO orders (order_id, order_code, market_code, sales_channel, customer_name,
         customer_social_handle, customer_phone, postal_code, shipping_address, carrier_service,
         payment_type, total_invoice_amount_ntd, downpayment_received_ntd, cod_collect_amount_ntd,
         remaining_balance_ntd, installment_term_months, price_approved_by_user_id, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [orderId, orderCode, marketCode, salesChannel, customerName, customerSocialHandle || null,
       customerPhone || null, postalCode || null, shippingAddress, carrierService, paymentType,
       total, downReceived, codCollect, remaining,
       paymentType === "INSTALLMENT" ? (installmentTerm || null) : null,
       priceOverridden ? approvedByUserId : null, session.userId]
    );

    for (const it of resolvedItems) {
      await client.query(
        `INSERT INTO order_items (item_id, order_id, variant_id, imei_serial, item_price_ntd) VALUES ($1,$2,$3,$4,$5)`,
        [randomUUID(), orderId, it.variantId, it.imei, it.price]
      );
      await client.query(
        `UPDATE product_items SET status = 'RESERVED', order_id = $1, updated_by_user_id = $2, updated_at = now() WHERE imei_serial = $3`,
        [orderId, session.userId, it.imei]
      );
      await client.query(
        `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, related_order_id, performed_by_user_id) VALUES ($1,$2,'IN_STOCK','RESERVED',$3,$4)`,
        [randomUUID(), it.imei, orderId, session.userId]
      );
    }

    for (const acc of claimedAccessories) {
      await client.query(
        `INSERT INTO order_accessories (accessory_row_id, order_id, variant_id, accessory_name, is_verified) VALUES ($1,$2,$3,$4,FALSE)`,
        [randomUUID(), orderId, acc.variantId, acc.name]
      );
    }

    if (priceOverridden && approvedByUserId) {
      await client.query(
        `INSERT INTO price_change_logs (log_id, variant_id, order_id, approved_by_user_id, note) VALUES ($1,$2,$3,$4,$5)`,
        [randomUUID(), resolvedItems.map((i) => i.variantId).join(", "), orderId, approvedByUserId, `Order-level override, total locked at ${total} NTD`]
      );
      await client.query(
        `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note) VALUES ($1,$2,'PRICE_OVERRIDE_APPROVED',$3,$4)`,
        [randomUUID(), orderId, session.userId, `Approved by user ${approvedByUserId}`]
      );
    }
    await client.query(
      `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note) VALUES ($1,$2,'ORDER_CREATED',$3,$4)`,
      [randomUUID(), orderId, session.userId, `${resolvedItems.length} item(s), ${claimedAccessories.length} accessory(ies), total ${total} NTD`]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, orderId, orderCode });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to create order." }, { status: 500 });
  } finally {
    client.release();
  }
}
