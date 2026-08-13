import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { orders, paymentSchedules } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { and, eq, inArray, sql } from "drizzle-orm";

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
      customerSocialHandle: o.customerSocialHandle,
      marketCode: o.marketCode,
      remainingBalanceNtd: o.remainingBalanceNtd,
    };
  });

  const scheduleIds = schedules.map((s) => s.scheduleId);
  let dunningLogs: any[] = [];
  if (scheduleIds.length > 0) {
    const rows = await db.execute(sql`
      SELECT l.log_id, l.schedule_id, l.contact_channel, l.dunning_result, l.promised_payment_date, l.cs_notes, l.created_at,
             u.display_name AS performed_by, ps.order_id
      FROM installment_dunning_logs l
      JOIN app_users u ON u.user_id = l.performed_by_user_id
      JOIN payment_schedules ps ON ps.schedule_id = l.schedule_id
      WHERE l.schedule_id = ANY(${scheduleIds})
      ORDER BY l.created_at DESC
    `);
    dunningLogs = (rows as any).rows ?? rows;
    dunningLogs = dunningLogs.map((l: any) => ({
      logId: l.log_id,
      scheduleId: l.schedule_id,
      orderCode: ordersById.get(l.order_id)?.orderCode || "",
      contactChannel: l.contact_channel,
      dunningResult: l.dunning_result,
      promisedPaymentDate: l.promised_payment_date,
      csNotes: l.cs_notes,
      performedBy: l.performed_by,
      createdAt: l.created_at,
    }));
  }

  return NextResponse.json({ schedules: result, dunningLogs });
}
