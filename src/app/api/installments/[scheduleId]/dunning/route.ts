import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

const CHANNELS = ["LINE", "TIKTOK", "PHONE", "FACEBOOK"];

// Logs a dunning attempt against a payment_schedules row — does not change
// the schedule's own status.
export async function POST(req: NextRequest, { params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "installments")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { channel, result, promisedDate, notes } = await req.json();
  if (!channel || !CHANNELS.includes(channel)) {
    return NextResponse.json({ error: "Invalid contact channel." }, { status: 400 });
  }
  if (!result || !String(result).trim()) {
    return NextResponse.json({ error: "Dunning result is required." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const exists = await client.query(`SELECT schedule_id FROM payment_schedules WHERE schedule_id = $1`, [scheduleId]);
    if (exists.rowCount === 0) {
      return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
    }
    await client.query(
      `INSERT INTO installment_dunning_logs
         (log_id, schedule_id, performed_by_user_id, contact_channel, dunning_result, promised_payment_date, cs_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), scheduleId, session.userId, channel, result, promisedDate || null, notes || null]
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to log dunning." }, { status: 500 });
  } finally {
    client.release();
  }
}
