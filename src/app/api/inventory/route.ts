import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { productItems } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { desc } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "inventory")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await db.select().from(productItems).orderBy(desc(productItems.createdAt)).limit(300);
  return NextResponse.json({ items: rows });
}
