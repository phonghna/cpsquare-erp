import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";

// Quick-adjust stock_quantity: +10 / -1. Any role with page access may use
// this (Admin, Manager, Packing). Row-locked so concurrent clicks can't race.
export async function POST(req: NextRequest, { params }: { params: Promise<{ variantId: string }> }) {
  const { variantId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "accessories")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { delta } = await req.json();
  const deltaNum = Number(delta);
  if (![10, -1].includes(deltaNum)) {
    return NextResponse.json({ error: "Invalid delta." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT stock_quantity FROM product_variants WHERE variant_id = $1 AND is_serialized = FALSE FOR UPDATE`,
      [variantId]
    );
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Accessory not found." }, { status: 404 });
    }
    const nextQty = Math.max(0, current.rows[0].stock_quantity + deltaNum);
    await client.query(
      `UPDATE product_variants SET stock_quantity = $1 WHERE variant_id = $2`,
      [nextQty, variantId]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, stockQuantity: nextQty });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Adjust failed." }, { status: 500 });
  } finally {
    client.release();
  }
}
