import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productItems } from "@/lib/schema";
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
  return NextResponse.json({ items: rows });
}
