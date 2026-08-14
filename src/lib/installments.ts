import { randomUUID } from "crypto";

// Shared by the DELIVERED transition (auto-generate) and the retroactive
// "Generate schedule" admin action (for orders that slipped through without
// one) — splits remaining_balance_ntd evenly across installment_term_months,
// one row per period, due dates 30 days apart starting 30 days from `from`.
// Returns null (does nothing) if there's no positive balance or term to
// schedule — callers should treat that as "nothing to generate", not an error
// on its own; it's a legitimate state (e.g. fully paid via downpayment).
export async function insertInstallmentSchedule(
  client: { query: (sql: string, params?: any[]) => Promise<any> },
  orderId: string,
  remainingBalanceNtd: string | number,
  installmentTermMonths: number | null,
  from: Date = new Date()
): Promise<{ generated: boolean; periods: number; totalNtd: number }> {
  const termMonths = Number(installmentTermMonths || 0);
  const totalCents = Math.round(Number(remainingBalanceNtd) * 100);
  if (!(termMonths > 0) || !(totalCents > 0)) {
    return { generated: false, periods: 0, totalNtd: 0 };
  }

  const baseCents = Math.floor(totalCents / termMonths);
  const remainderCents = totalCents - baseCents * termMonths;

  for (let period = 1; period <= termMonths; period++) {
    const amountCents = baseCents + (period === termMonths ? remainderCents : 0);
    const dueDate = new Date(from);
    dueDate.setDate(dueDate.getDate() + 30 * period);
    await client.query(
      `INSERT INTO payment_schedules (schedule_id, order_id, period_number, amount_due_ntd, due_date, status)
       VALUES ($1,$2,$3,$4,$5,'PENDING')`,
      [randomUUID(), orderId, period, (amountCents / 100).toFixed(2), dueDate.toISOString().slice(0, 10)]
    );
  }
  return { generated: true, periods: termMonths, totalNtd: totalCents / 100 };
}
