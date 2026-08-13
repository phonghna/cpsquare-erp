import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

// Admin-only inline price edit. Every change is written to price_change_logs
// with order_id = NULL (distinguishing a Price Book base-price edit from a
// per-order price override).
export async function POST(req: NextRequest, { params }: { params: Promise<{ variantId: string }> }) {
  const { variantId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "pricebook")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only Admin can edit prices." }, { status: 403 });
  }

  const { price } = await req.json();
  const priceNum = Number(price);
  if (Number.isNaN(priceNum) || priceNum < 0) {
    return NextResponse.json({ error: "Invalid price." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT selling_price_ntd FROM product_variants WHERE variant_id = $1 AND is_serialized = TRUE FOR UPDATE`,
      [variantId]
    );
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Variant not found." }, { status: 404 });
    }
    const oldPrice = current.rows[0].selling_price_ntd;

    await client.query(
      `UPDATE product_variants SET selling_price_ntd = $1 WHERE variant_id = $2`,
      [priceNum.toFixed(2), variantId]
    );
    await client.query(
      `INSERT INTO price_change_logs (log_id, variant_id, order_id, approved_by_user_id, note)
       VALUES ($1,$2,NULL,$3,$4)`,
      [randomUUID(), variantId, session.userId, `Price changed from ${oldPrice} to ${priceNum.toFixed(2)} NTD`]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to update price." }, { status: 500 });
  } finally {
    client.release();
  }
}
