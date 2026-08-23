import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

function visibleMarkets(session: { role: string; markets: string[] }) {
  if (["ADMIN", "PACKING", "TECH"].includes(session.role)) return ["VN", "ID", "TH", "PH"];
  return session.markets;
}

type ItemInput = { variantId: string; price: number; mode: "keep" | "auto" | "manual"; keepImei?: string; manualImei?: string };
type AccessoryInput = { variantId: string; quantity: number; price: number };

// Full reconcile edit — only allowed while PENDING_PACK (a PACKED order must
// go through /return-to-inspection first). Releases IMEIs/accessories no
// longer used, claims any newly added ones, replaces order_items/
// order_accessories wholesale, and recomputes the payment breakdown.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    marketCode, salesChannel, customerName, customerSocialHandle, customerPhone,
    postalCode, shippingAddress, carrierService, paymentType, downpayment = 0, installmentTerm,
    items, accessories = [], priceOverridden = false, approvedByUserId = null,
  }: {
    marketCode: string; salesChannel: string; customerName: string; customerSocialHandle?: string; customerPhone?: string;
    postalCode?: string; shippingAddress: string; carrierService: string; paymentType: string; downpayment?: number; installmentTerm?: number;
    items: ItemInput[]; accessories?: AccessoryInput[]; priceOverridden?: boolean; approvedByUserId?: string | null;
  } = body;

  if (!items?.length || !customerName || !shippingAddress || !carrierService || !paymentType) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (marketCode && !visibleMarkets(session).includes(marketCode)) {
    return NextResponse.json({ error: "You do not have access to that market." }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderRes = await client.query(`SELECT order_code, shipment_status FROM orders WHERE order_id = $1 FOR UPDATE`, [orderId]);
    if (orderRes.rowCount === 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Order not found." }, { status: 404 }); }
    if (orderRes.rows[0].shipment_status !== "PENDING_PACK") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Only a Pending Pack order can be edited directly." }, { status: 409 });
    }
    const orderCode = orderRes.rows[0].order_code;

    const oldItems = await client.query(`SELECT imei_serial FROM order_items WHERE order_id = $1`, [orderId]);
    const oldImeis: string[] = oldItems.rows.map((r) => r.imei_serial);
    const keepImeis = items.filter((i) => i.mode === "keep" && i.keepImei).map((i) => i.keepImei!);
    const releasedImeis = oldImeis.filter((im) => !keepImeis.includes(im));

    for (const imei of releasedImeis) {
      await client.query(`UPDATE product_items SET status = 'IN_STOCK', current_location = 'CPSquare Warehouse (TW)', order_id = NULL WHERE imei_serial = $1`, [imei]);
      await client.query(
        `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, related_order_id, performed_by_user_id) VALUES ($1,$2,'RESERVED','IN_STOCK',$3,$4)`,
        [randomUUID(), imei, orderId, session.userId]
      );
    }

    const resolvedItems: { variantId: string; imei: string; price: number }[] = [];
    for (const row of items) {
      let imei: string;
      if (row.mode === "keep" && row.keepImei) {
        imei = row.keepImei;
      } else if (row.mode === "manual") {
        if (!row.manualImei) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Manual IMEI is required for that row." }, { status: 400 }); }
        const claim = await client.query(`SELECT imei_serial FROM product_items WHERE imei_serial = $1 AND status = 'IN_STOCK' FOR UPDATE`, [row.manualImei]);
        if (claim.rowCount === 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: `IMEI ${row.manualImei} is not available.` }, { status: 409 }); }
        imei = claim.rows[0].imei_serial;
      } else {
        const claim = await client.query(
          `SELECT imei_serial FROM product_items WHERE variant_id = $1 AND status = 'IN_STOCK' ORDER BY imei_serial FOR UPDATE SKIP LOCKED LIMIT 1`,
          [row.variantId]
        );
        if (claim.rowCount === 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: `No IN_STOCK device available for ${row.variantId}.` }, { status: 409 }); }
        imei = claim.rows[0].imei_serial;
      }
      resolvedItems.push({ variantId: row.variantId, imei, price: Number(row.price) });
    }

    const newImeis = resolvedItems.map((i) => i.imei);
    for (const imei of newImeis) {
      if (!oldImeis.includes(imei)) {
        await client.query(`UPDATE product_items SET status = 'RESERVED', order_id = $1, updated_by_user_id = $2, updated_at = now() WHERE imei_serial = $3`, [orderId, session.userId, imei]);
        await client.query(
          `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, related_order_id, performed_by_user_id) VALUES ($1,$2,'IN_STOCK','RESERVED',$3,$4)`,
          [randomUUID(), imei, orderId, session.userId]
        );
      }
    }

    await client.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
    for (const it of resolvedItems) {
      await client.query(`INSERT INTO order_items (item_id, order_id, variant_id, imei_serial, item_price_ntd) VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), orderId, it.variantId, it.imei, it.price]);
    }

    // Reconcile accessories — accessory rows aren't tied to a specific
    // serialized unit (unlike phones/IMEIs), so quantity is fungible stock:
    // release every old row's quantity back to product_variants first, then
    // re-claim every new row's quantity fresh. Simpler and just as correct
    // as trying to diff per-row quantity deltas, since it all happens inside
    // one transaction (no race window between release and re-claim).
    const oldAccRes = await client.query(`SELECT variant_id, quantity FROM order_accessories WHERE order_id = $1`, [orderId]);
    for (const row of oldAccRes.rows) {
      await client.query(`UPDATE product_variants SET stock_quantity = stock_quantity + $1, reserved_quantity = GREATEST(0, reserved_quantity - $1) WHERE variant_id = $2`, [row.quantity, row.variant_id]);
    }
    const claimedAccessories: { variantId: string; name: string; quantity: number; price: number }[] = [];
    for (const row of accessories as AccessoryInput[]) {
      const qty = Number(row.quantity) || 0;
      if (qty < 1) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Accessory quantity must be at least 1." }, { status: 400 }); }
      const acc = await client.query(`SELECT model_name FROM product_variants WHERE variant_id = $1 AND is_serialized = FALSE FOR UPDATE`, [row.variantId]);
      if (acc.rowCount === 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: `Accessory ${row.variantId} not found.` }, { status: 400 }); }
      const claim = await client.query(
        `UPDATE product_variants SET stock_quantity = stock_quantity - $1, reserved_quantity = reserved_quantity + $1
         WHERE variant_id = $2 AND stock_quantity >= $1`,
        [qty, row.variantId]
      );
      if (claim.rowCount === 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: `Not enough stock for accessory ${acc.rows[0].model_name} (need ${qty}).` }, { status: 409 }); }
      claimedAccessories.push({ variantId: row.variantId, name: acc.rows[0].model_name, quantity: qty, price: Number(row.price) });
    }
    const oldAccIds = oldAccRes.rows.map((r) => r.variant_id);
    const newAccIds = claimedAccessories.map((a) => a.variantId);
    await client.query(`DELETE FROM order_accessories WHERE order_id = $1`, [orderId]);
    for (const acc of claimedAccessories) {
      await client.query(
        `INSERT INTO order_accessories (accessory_row_id, order_id, variant_id, accessory_name, is_verified, quantity, unit_price_ntd)
         VALUES ($1,$2,$3,$4,FALSE,$5,$6)`,
        [randomUUID(), orderId, acc.variantId, acc.name, acc.quantity, acc.price]
      );
    }

    const total = resolvedItems.reduce((s, i) => s + i.price, 0) + claimedAccessories.reduce((s, a) => s + a.price * a.quantity, 0);
    let downReceived = 0, codCollect = total, remaining = 0;
    if (paymentType === "DOWNPAYMENT_COD") { downReceived = Number(downpayment); codCollect = Math.max(0, total - downReceived); }
    if (paymentType === "INSTALLMENT") { downReceived = Number(downpayment); codCollect = downReceived; remaining = Math.max(0, total - downReceived); }

    await client.query(
      `UPDATE orders SET market_code = $1, sales_channel = $2, customer_name = $3, customer_social_handle = $4, customer_phone = $5,
         postal_code = $6, shipping_address = $7, carrier_service = $8, payment_type = $9,
         total_invoice_amount_ntd = $10, downpayment_received_ntd = $11, cod_collect_amount_ntd = $12, remaining_balance_ntd = $13,
         installment_term_months = $14, price_approved_by_user_id = COALESCE($15, price_approved_by_user_id)
       WHERE order_id = $16`,
      [marketCode, salesChannel, customerName, customerSocialHandle || null, customerPhone || null,
       postalCode || null, shippingAddress, carrierService, paymentType,
       total, downReceived, codCollect, remaining,
       paymentType === "INSTALLMENT" ? (installmentTerm || null) : null,
       priceOverridden ? approvedByUserId : null, orderId]
    );

    if (priceOverridden && approvedByUserId) {
      const overriddenVariantIds = [...resolvedItems.map((i) => i.variantId), ...claimedAccessories.map((a) => a.variantId)];
      await client.query(
        `INSERT INTO price_change_logs (log_id, variant_id, order_id, approved_by_user_id, note) VALUES ($1,$2,$3,$4,$5)`,
        [randomUUID(), overriddenVariantIds.join(", "), orderId, approvedByUserId, `Order edit override, total locked at ${total} NTD`]
      );
    }

    const changeSummary: string[] = [];
    if (releasedImeis.length) changeSummary.push(`${releasedImeis.length} IMEI swapped`);
    if (oldAccIds.join(",") !== newAccIds.join(",")) changeSummary.push("accessories changed");
    await client.query(
      `INSERT INTO order_logs (log_id, order_id, action_type, performed_by_user_id, note) VALUES ($1,$2,'ORDER_EDITED',$3,$4)`,
      [randomUUID(), orderId, session.userId, changeSummary.length ? changeSummary.join("; ") : "No structural changes"]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, orderCode });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to update order." }, { status: 500 });
  } finally {
    client.release();
  }
}
