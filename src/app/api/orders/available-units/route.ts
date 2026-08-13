import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productItems } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

// IN_STOCK units for a given SKU — powers the manual IMEI picker in the
// order intake form.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const variantId = req.nextUrl.searchParams.get("variantId");
  if (!variantId) return NextResponse.json({ error: "variantId is required." }, { status: 400 });

  const db = getDb();
  const rows = await db
    .select({
      imeiSerial: productItems.imeiSerial,
      batteryHealth: productItems.batteryHealth,
      cosmeticCondition: productItems.cosmeticCondition,
    })
    .from(productItems)
    .where(and(eq(productItems.variantId, variantId), eq(productItems.status, "IN_STOCK")));

  return NextResponse.json({ units: rows });
}
