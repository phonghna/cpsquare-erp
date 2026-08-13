import { NextResponse } from "next/server";
import { getPool } from "@/lib/db-pool";
import { getSession, canAccessPage } from "@/lib/auth";
import { randomUUID } from "crypto";

const STAGES = ["RECEIVE", "INSPECTION", "REPAIRING", "REPAIR_DONE", "SENT_OUT"];

// Advances a device one step through the RMA kanban. From the final column
// (SENT_OUT) this completes the repair: back to IN_STOCK, rma_stage cleared.
export async function POST(_req: Request, { params }: { params: Promise<{ imei: string }> }) {
  const { imei } = await params;
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "rma")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT status, rma_stage FROM product_items WHERE imei_serial = $1 FOR UPDATE`,
      [imei]
    );
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "IMEI not found." }, { status: 404 });
    }
    const stage = current.rows[0].rma_stage;
    const idx = STAGES.indexOf(stage);
    if (idx === -1) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This device is not in the RMA pipeline." }, { status: 409 });
    }

    if (idx === STAGES.length - 1) {
      // SENT_OUT -> complete
      await client.query(
        `UPDATE product_items
         SET status = 'IN_STOCK', current_location = 'CPSquare Warehouse (TW)', rma_stage = NULL,
             updated_by_user_id = $1, updated_at = now()
         WHERE imei_serial = $2`,
        [session.userId, imei]
      );
      await client.query(
        `INSERT INTO imei_logs (log_id, imei_serial, status_from, status_to, performed_by_user_id)
         VALUES ($1,$2,'REPAIRING','IN_STOCK',$3)`,
        [randomUUID(), imei, session.userId]
      );
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, completed: true });
    }

    const nextStage = STAGES[idx + 1];
    await client.query(
      `UPDATE product_items SET rma_stage = $1, updated_by_user_id = $2, updated_at = now() WHERE imei_serial = $3`,
      [nextStage, session.userId, imei]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, stage: nextStage });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Failed to advance stage." }, { status: 500 });
  } finally {
    client.release();
  }
}
