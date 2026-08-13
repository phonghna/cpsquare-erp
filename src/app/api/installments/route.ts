import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { orders, paymentSchedules } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { and, eq, inArray } from "drizzle-orm";

function visibleMarkets(session: { role: string; markets: string[] }) {
  if (["ADMIN", "PACKING", "TECH"].includes(session.role)) return ["VN", "ID", "TH", "PH"];
  return session.markets;
}

// Every payment_schedules row for INSTALLMENT-type orders the caller can see.
// Overdue / Due Soon / All is computed client-side from due_date + status.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "installments")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const markets = visibleMarkets(session);
  const db = getDb();

  const installmentOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.paymentType, "INSTALLMENT"), inArray(orders.marketCode, markets)));

  if (installmentOrders.length === 0) {
    return NextResponse.json({ schedules: [] });
  }
  const orderIds = installmentOrders.map((o) => o.orderId);
  const ordersById = new Map(installmentOrders.map((o) => [o.orderId, o]));

  const schedules = await db
    .select()
    .from(paymentSchedules)
    .where(inArray(paymentSchedules.orderId, orderIds));

  const result = schedules.map((s) => {
    const o = ordersById.get(s.orderId)!;
    return {
      ...s,
      orderCode: o.orderCode,
      customerName: o.customerName,
      marketCode: o.marketCode,
      remainingBalanceNtd: o.remainingBalanceNtd,
    };
  });

  return NextResponse.json({ schedules: result });
}
