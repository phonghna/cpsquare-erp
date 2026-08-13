import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productItems, productVariants } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { isNotNull } from "drizzle-orm";

// Every device currently in the RMA pipeline, grouped by stage for the kanban.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "rma")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = await db.select().from(productItems).where(isNotNull(productItems.rmaStage));
  const variants = await db.select({ variantId: productVariants.variantId, modelName: productVariants.modelName }).from(productVariants);
  const variantById = new Map(variants.map((v) => [v.variantId, v.modelName]));
  const items = rows.map((r) => ({ ...r, modelName: variantById.get(r.variantId) || r.variantId }));
  return NextResponse.json({ items });
}
