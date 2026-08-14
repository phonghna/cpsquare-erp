import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";

// Admin-only. Blocked if any IMEI or historical order line still references
// this SKU, to avoid orphaning inventory/order records.
export async function POST(_req: Request, { params }: { params: Promise<{ variantId: string }> }) {
  const { variantId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "pricebook")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only Admin can delete a product variant." }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT 1 FROM product_variants WHERE variant_id = $1 FOR UPDATE`, [variantId]);
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Variant not found." }, { status: 404 });
    }
    const itemCount = await client.query(`SELECT COUNT(*)::int AS n FROM product_items WHERE variant_id = $1`, [variantId]);
    if (itemCount.rows[0].n > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Cannot delete — ${itemCount.rows[0].n} IMEI unit(s) in Inventory still use this SKU.` }, { status: 409 });
    }
    const orderCount = await client.query(`SELECT COUNT(*)::int AS n FROM order_items WHERE variant_id = $1`, [variantId]);
    if (orderCount.rows[0].n > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Cannot delete — this SKU appears on ${orderCount.rows[0].n} past order line(s).` }, { status: 409 });
    }
    await client.query(`DELETE FROM product_variants WHERE variant_id = $1`, [variantId]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to delete variant." }, { status: 500 });
  } finally {
    client.release();
  }
}
