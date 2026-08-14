import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { orders, paymentSchedules } from "@/lib/schema";
import { getSession, canAccessPage, canGenerateInstallmentSchedule } from "@/lib/auth";
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

  try {
    const installmentOrders = await db
      .select()
      .from(orders)
      .where(and(eq(orders.paymentType, "INSTALLMENT"), inArray(orders.marketCode, markets)));

    if (installmentOrders.length === 0) {
      return NextResponse.json({ schedules: [], missingSchedules: [], canGenerate: canGenerateInstallmentSchedule(session.role) });
    }
    const orderIds = installmentOrders.map((o) => o.orderId);
    const ordersById = new Map(installmentOrders.map((o) => [o.orderId, o]));

    const schedules = await db
      .select()
      .from(paymentSchedules)
      .where(inArray(paymentSchedules.orderId, orderIds));

    // DELIVERED Installment orders that never got a payment_schedules row —
    // e.g. the order's installment term or remaining balance was missing/zero
    // at delivery time. Surfaced here (rather than staying silently invisible)
    // so Admin/Manager can fix the order data and retroactively generate one.
    const orderIdsWithSchedule = new Set(schedules.map((s) => s.orderId));
    const missingSchedules = installmentOrders
      .filter((o) => o.shipmentStatus === "DELIVERED" && !orderIdsWithSchedule.has(o.orderId))
      .map((o) => ({
        orderId: o.orderId,
        orderCode: o.orderCode,
        customerName: o.customerName,
        marketCode: o.marketCode,
        totalInvoiceAmountNtd: o.totalInvoiceAmountNtd,
        downpaymentReceivedNtd: o.downpaymentReceivedNtd,
        remainingBalanceNtd: o.remainingBalanceNtd,
        installmentTermMonths: o.installmentTermMonths,
        reason: !(Number(o.installmentTermMonths) > 0)
          ? "No installment term set"
          : !(Number(o.remainingBalanceNtd) > 0)
          ? "No remaining balance (fully covered by downpayment)"
          : null,
      }));

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
      // Build an explicit IN (...) list rather than `= ANY(${scheduleIds})`
      // — the neon-http driver doesn't reliably bind a JS array as a single
      // parameter through the sql tagged template (throws "op ANY/ALL
      // (array) requires array on right side" at runtime), so we sidestep
      // that entirely with a comma-joined list of individually-bound params.
      const idList = sql.join(scheduleIds.map((id) => sql`${id}`), sql`, `);
      const rows = await db.execute(sql`
        SELECT l.log_id, l.schedule_id, l.contact_channel, l.dunning_result, l.promised_payment_date, l.cs_notes, l.created_at,
               u.display_name AS performed_by, ps.order_id
        FROM installment_dunning_logs l
        JOIN app_users u ON u.user_id = l.performed_by_user_id
        JOIN payment_schedules ps ON ps.schedule_id = l.schedule_id
        WHERE l.schedule_id IN (${idList})
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

    return NextResponse.json({ schedules: result, dunningLogs, missingSchedules, canGenerate: canGenerateInstallmentSchedule(session.role) });
  } catch (err: any) {
    // Surface the real DB/runtime error instead of an opaque 500 HTML page —
    // the frontend now shows this text directly instead of hanging on
    // "Loading..." forever.
    return NextResponse.json({ error: err?.message || "Failed to load installments." }, { status: 500 });
  }
}
