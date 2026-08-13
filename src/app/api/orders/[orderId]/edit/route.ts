import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

function visibleMarkets(session: { role: string; markets: string[] }) {
  if (["ADMIN", "PACKING", "TECH"].includes(session.role)) return ["VN", "ID", "TH", "PH"];
  return session.markets;
}

type ItemInput = { variantId: string; price: number; mode: "keep" | "auto" | "manual"; keepImei?: string; manualImei?: string };

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
    items, accessoryVariantIds = [], priceOverridden = false, approvedByUserId = null,
  }: {
    marketCode: string; salesChannel: string; customerName: string; customerSocialHandle?: string; customerPhone?: string;
    postalCode?: string; shippingAddress: string; carrierService: string; paymentType: string; downpayment?: number; installmentTerm?: number;
    items: ItemInput[]; accessoryVariantIds?: string[]; priceOverridden?: boolean; approvedByUserId?: string | null;
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

    // Reconcile accessories
    const oldAccRes = await client.query(`SELECT variant_id FROM order_accessories WHERE order_id = $1`, [orderId]);
    const oldAccIds: string[] = oldAccRes.rows.map((r) => r.variant_id);
    const newAccIds: string[] = accessoryVariantIds;
    for (const variantId of oldAccIds.filter((id) => !newAccIds.includes(id))) {
      await client.query(`UPDATE product_variants SET stock_quantity = stock_quantity + 1, reserved_quantity = GREATEST(0, reserved_quantity - 1) WHERE variant_id = $1`, [variantId]);
    }
    const claimedAccessories: { variantId: string; name: string }[] = [];
    for (const variantId of newAccIds) {
      const acc = await client.query(`SELECT model_name, stock_quantity FROM product_variants WHERE variant_id = $1 AND is_serialized = FALSE FOR UPDATE`, [variantId]);
      if (acc.rowCount === 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: `Accessory ${variantId} not found.` }, { status: 400 }); }
      if (!oldAccIds.includes(variantId)) {
        if (acc.rows[0].stock_quantity <= 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: `Accessory ${variantId} is out of stock.` }, { status: 409 }); }
        await client.query(`UPDATE product_variants SET stock_quantity = stock_quantity - 1, reserved_quantity = reserved_quantity + 1 WHERE variant_id = $1`, [variantId]);
      }
      claimedAccessories.push({ variantId, name: acc.rows[0].model_name });
    }
    await client.query(`DELETE FROM order_accessories WHERE order_id = $1`, [orderId]);
    for (const acc of claimedAccessories) {
      await client.query(`INSERT INTO order_accessories (accessory_row_id, order_id, variant_id, accessory_name, is_verified) VALUES ($1,$2,$3,$4,FALSE)`, [randomUUID(), orderId, acc.variantId, acc.name]);
    }

    const total = resolvedItems.reduce((s, i) => s + i.price, 0);
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
      await client.query(
        `INSERT INTO price_change_logs (log_id, variant_id, order_id, approved_by_user_id, note) VALUES ($1,$2,$3,$4,$5)`,
        [randomUUID(), resolvedItems.map((i) => i.variantId).join(", "), orderId, approvedByUserId, `Order edit override, total locked at ${total} NTD`]
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
