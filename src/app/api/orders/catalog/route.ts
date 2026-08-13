import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productVariants } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { eq } from "drizzle-orm";

// Phone models + accessory catalog for the order intake form. Gated by the
// "orders" page (not "pricebook"/"accessories") so CS/Streamer — who can
// create orders but don't have those pages in their nav — can still load it.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();

  const variants = await db
    .select({
      variantId: productVariants.variantId,
      brand: productVariants.brand,
      modelGroup: productVariants.modelGroup,
      modelName: productVariants.modelName,
      color: productVariants.color,
      sellingPriceNtd: productVariants.sellingPriceNtd,
    })
    .from(productVariants)
    .where(eq(productVariants.isSerialized, true))
    .orderBy(productVariants.modelName);

  const accessories = await db
    .select({
      variantId: productVariants.variantId,
      modelName: productVariants.modelName,
      compatibleModel: productVariants.compatibleModel,
      stockQuantity: productVariants.stockQuantity,
    })
    .from(productVariants)
    .where(eq(productVariants.isSerialized, false))
    .orderBy(productVariants.modelName);

  return NextResponse.json({ variants, accessories });
}
