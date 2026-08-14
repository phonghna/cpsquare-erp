"use client";

import { useMemo, useState, useEffect } from "react";
import { StatusPill, Card, KPI, Tabs, Empty, Field, ModalShell, inputStyle, btnPrimary, btnGhost, tableStyle, th, td } from "@/components/ui";

type Schedule = {
  scheduleId: string;
  orderId: string;
  periodNumber: number;
  amountDueNtd: string;
  dueDate: string;
  status: string;
  orderCode: string;
  customerName: string;
  customerSocialHandle: string | null;
  marketCode: string;
  remainingBalanceNtd: string;
};

type MissingSchedule = {
  orderId: string; orderCode: string; customerName: string; marketCode: string;
  totalInvoiceAmountNtd: string; downpaymentReceivedNtd: string; remainingBalanceNtd: string;
  installmentTermMonths: number | null; reason: string | null;
};

type DunningLog = {
  logId: string;
  scheduleId: string;
  orderCode: string;
  contactChannel: string;
  dunningResult: string;
  promisedPaymentDate: string | null;
  csNotes: string | null;
  performedBy: string;
  createdAt: string;
};

const CHANNELS = ["LINE", "TIKTOK", "PHONE", "FACEBOOK"];
const DUNNING_META = {
  PENDING: { label: "Pending", color: "var(--warn)", bg: "var(--warn-bg)" },
  PAID: { label: "Paid", color: "var(--ok)", bg: "var(--ok-bg)" },
};

const fmt = (n: string) => "$" + Math.round(Number(n)).toLocaleString("en-US") + " NTD";
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US");

export default function InstallmentsPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [dunningLogs, setDunningLogs] = useState<DunningLog[]>([]);
  const [missingSchedules, setMissingSchedules] = useState<MissingSchedule[]>([]);
  const [canGenerate, setCanGenerate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overdue");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dunningTarget, setDunningTarget] = useState<Schedule | null>(null);
  const [generateError, setGenerateError] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/installments");
      let data: any = {};
      try { data = await res.json(); } catch { /* non-JSON error response */ }
      if (!res.ok) { setError(data.error || `Failed to load installments (HTTP ${res.status}).`); return; }
      setSchedules(data.schedules || []);
      setDunningLogs(data.dunningLogs || []);
      setMissingSchedules(data.missingSchedules || []);
      setCanGenerate(!!data.canGenerate);
    } catch (err: any) {
      setError(err?.message || "Network error — failed to load installments.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function generateSchedule(orderId: string) {
    setBusy(orderId);
    setGenerateError((e) => ({ ...e, [orderId]: "" }));
    const res = await fetch(`/api/installments/${orderId}/generate-schedule`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) { setGenerateError((e) => ({ ...e, [orderId]: data.error || "Failed to generate schedule." })); return; }
    load();
  }

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const in5Days = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 5); return d; }, [today]);

  function dueDateOf(s: Schedule) { return new Date(s.dueDate); }
  function daysOverdue(s: Schedule) { return Math.round((today.getTime() - dueDateOf(s).getTime()) / 86400000); }
  function isOverdue(s: Schedule) { return s.status === "PENDING" && dueDateOf(s) < today; }
  function isDueSoon(s: Schedule) { return s.status === "PENDING" && dueDateOf(s) >= today && dueDateOf(s) <= in5Days; }

  const overdue = useMemo(() => schedules.filter(isOverdue).sort((a, b) => daysOverdue(b) - daysOverdue(a)), [schedules, today]);
  const dueSoon = useMemo(() => schedules.filter(isDueSoon).sort((a, b) => daysOverdue(b) - daysOverdue(a)), [schedules, today, in5Days]);
  const allRows = useMemo(() => schedules.slice().sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()), [schedules]);
  const openCount = useMemo(() => schedules.filter((s) => s.status === "PENDING").length, [schedules]);
  const instOrderCount = useMemo(() => new Set(schedules.map((s) => s.orderId)).size, [schedules]);

  async function markPaid(scheduleId: string) {
    setBusy(scheduleId);
    setError("");
    const res = await fetch(`/api/installments/${scheduleId}/pay`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) { setError(data.error || "Failed to mark as paid."); return; }
    load();
  }

  const rows = tab === "overdue" ? overdue : tab === "duesoon" ? dueSoon : allRows;

  function RowTable({ data, showDays }: { data: Schedule[]; showDays: boolean }) {
    if (data.length === 0) return <Empty title="Nothing here" sub="Deliver an INSTALLMENT order to auto-generate its schedule." />;
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Order</th><th style={th}>Customer</th><th style={th}>Period</th><th style={th}>Amount</th><th style={th}>Due date</th>
              {showDays && <th style={th}>Days overdue</th>}
              <th style={th}>Status</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => {
              const days = daysOverdue(r);
              return (
                <tr key={r.scheduleId}>
                  <td style={{ ...td, fontWeight: 700 }} className="mono">{r.orderCode}</td>
                  <td style={td}>{r.customerName} <span style={{ color: "var(--text-faint)" }}>({r.customerSocialHandle})</span></td>
                  <td style={td}>#{r.periodNumber}</td>
                  <td style={td} className="mono">{fmt(r.amountDueNtd)}</td>
                  <td style={td}>{fmtDate(r.dueDate)}</td>
                  {showDays && (
                    <td style={{ ...td, fontWeight: 700, color: days > 0 ? "var(--danger)" : "var(--text-dim)" }}>
                      {days > 0 ? `${days}d overdue` : `${Math.abs(days)}d left`}
                    </td>
                  )}
                  <td style={td}><StatusPill status={r.status} meta={DUNNING_META} /></td>
                  <td style={td}>
                    {r.status === "PENDING" && (
                      <>
                        <button onClick={() => setDunningTarget(r)} style={{ ...btnGhost, marginRight: 6 }}>Log dunning</button>
                        <button onClick={() => markPaid(r.scheduleId)} disabled={busy === r.scheduleId} style={{ ...btnGhost, opacity: busy === r.scheduleId ? 0.5 : 1 }}>
                          {busy === r.scheduleId ? "…" : "Mark as paid"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="disp text-2xl font-bold">Installment Debt Board</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Upfront downpayment collected via COD on delivery; remaining balance splits into 3/6/9/12-month schedules auto-generated once DELIVERED.</p>
      </div>

      {error && <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</div>}

      {loading ? (
        <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
            <KPI label="Overdue periods" value={String(overdue.length)} sub={fmt(String(overdue.reduce((s, r) => s + Number(r.amountDueNtd), 0))) + " at risk"} accent="var(--danger)" />
            <KPI label="Due within 5 days" value={String(dueSoon.length)} sub={fmt(String(dueSoon.reduce((s, r) => s + Number(r.amountDueNtd), 0))) + " upcoming"} accent="var(--warn)" />
            <KPI label="All open schedules" value={String(openCount)} sub={`${instOrderCount} installment orders`} />
          </div>

          {missingSchedules.length > 0 && (
            <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20, border: "1px solid var(--warn)" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--warn-bg)" }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Needs a schedule ({missingSchedules.length})</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                  Delivered as Installment but no payment schedule exists yet — usually because the term or remaining balance was missing at delivery time.
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr><th style={th}>Order</th><th style={th}>Customer</th><th style={th}>Market</th><th style={th}>Total</th><th style={th}>Downpayment</th><th style={th}>Remaining</th><th style={th}>Term</th><th style={th}>Why it's missing</th><th style={th}></th></tr>
                  </thead>
                  <tbody>
                    {missingSchedules.map((m) => (
                      <tr key={m.orderId}>
                        <td style={{ ...td, fontWeight: 700 }} className="mono">{m.orderCode}</td>
                        <td style={td}>{m.customerName}</td>
                        <td style={td}>{m.marketCode}</td>
                        <td style={td} className="mono">{fmt(m.totalInvoiceAmountNtd)}</td>
                        <td style={td} className="mono">{fmt(m.downpaymentReceivedNtd)}</td>
                        <td style={td} className="mono">{fmt(m.remainingBalanceNtd)}</td>
                        <td style={td}>{m.installmentTermMonths ? `${m.installmentTermMonths} months` : "—"}</td>
                        <td style={{ ...td, color: "var(--danger)" }}>{m.reason || "—"}</td>
                        <td style={td}>
                          {canGenerate ? (
                            <>
                              <button onClick={() => generateSchedule(m.orderId)} disabled={!!m.reason || busy === m.orderId} style={{ ...btnPrimary, opacity: m.reason || busy === m.orderId ? 0.5 : 1 }}>
                                {busy === m.orderId ? "…" : "Generate schedule"}
                              </button>
                              {generateError[m.orderId] && <div style={{ color: "var(--danger)", fontSize: 11.5, marginTop: 4, maxWidth: 200 }}>{generateError[m.orderId]}</div>}
                            </>
                          ) : (
                            <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>Admin/Manager only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Tabs
            tabs={[
              { id: "overdue", label: `Overdue (${overdue.length})` },
              { id: "duesoon", label: `Due Soon (${dueSoon.length})` },
              { id: "all", label: `All Schedules (${allRows.length})` },
            ]}
            active={tab}
            onChange={setTab}
          />
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <RowTable data={rows} showDays />
          </Card>

          <div className="disp" style={{ fontWeight: 700, fontSize: 15, margin: "22px 0 10px" }}>Installment_Dunning_Logs</div>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {dunningLogs.length === 0 ? (
              <Empty title="No dunning attempts logged yet" />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr><th style={th}>Time</th><th style={th}>Order</th><th style={th}>Channel</th><th style={th}>Result</th><th style={th}>Promised date</th><th style={th}>By</th><th style={th}>Notes</th></tr>
                  </thead>
                  <tbody>
                    {dunningLogs.map((l) => (
                      <tr key={l.logId}>
                        <td style={td} className="mono">{new Date(l.createdAt).toLocaleString("en-US")}</td>
                        <td style={td} className="mono">{l.orderCode}</td>
                        <td style={td}>{l.contactChannel}</td>
                        <td style={td}>{l.dunningResult}</td>
                        <td style={td}>{l.promisedPaymentDate ? fmtDate(l.promisedPaymentDate) : "—"}</td>
                        <td style={td}>{l.performedBy}</td>
                        <td style={td}>{l.csNotes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {dunningTarget && (
        <DunningModal
          schedule={dunningTarget}
          onClose={() => setDunningTarget(null)}
          onLogged={() => { setDunningTarget(null); load(); }}
        />
      )}
    </div>
  );
}

function DunningModal({
  schedule, onClose, onLogged,
}: { schedule: Schedule; onClose: () => void; onLogged: () => void }) {
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [result, setResult] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!result.trim()) return;
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/installments/${schedule.scheduleId}/dunning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, result, promisedDate: promisedDate || null, notes: notes || null }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to log dunning."); return; }
    onLogged();
  }

  return (
    <ModalShell onClose={onClose} title={`Log dunning attempt — ${schedule.orderCode} (Period #${schedule.periodNumber})`}>
      <Field label="Contact channel">
        <select value={channel} onChange={(e) => setChannel(e.target.value)} style={inputStyle}>
          {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <div style={{ height: 10 }} />
      <Field label="Result">
        <input value={result} onChange={(e) => setResult(e.target.value)} placeholder="e.g. Promised to pay Friday" style={inputStyle} />
      </Field>
      <div style={{ height: 10 }} />
      <Field label="Promised payment date (if any)">
        <input type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} style={inputStyle} />
      </Field>
      <div style={{ height: 10 }} />
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
      </Field>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={submit} disabled={submitting || !result.trim()} style={{ ...btnPrimary, opacity: submitting || !result.trim() ? 0.6 : 1 }}>
          {submitting ? "Saving…" : "Save log"}
        </button>
      </div>
    </ModalShell>
  );
}
