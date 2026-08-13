import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productVariants } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { eq } from "drizzle-orm";

// Lightweight SKU list for the "Add new IMEI" dropdown — kept separate from
// /api/pricebook because Packing can receive stock but doesn't have the
// pricebook page in their nav.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "inventory")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = await db
    .select({ variantId: productVariants.variantId, modelName: productVariants.modelName, sellingPriceNtd: productVariants.sellingPriceNtd })
    .from(productVariants)
    .where(eq(productVariants.isSerialized, true))
    .orderBy(productVariants.modelName);
  return NextResponse.json({ variants: rows });
}
