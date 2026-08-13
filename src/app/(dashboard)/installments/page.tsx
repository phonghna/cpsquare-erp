"use client";

import { useMemo, useState, useEffect } from "react";
import { StatusPill, INSTALLMENT_META } from "@/components/ui";

type Schedule = {
  scheduleId: string;
  orderId: string;
  periodNumber: number;
  amountDueNtd: string;
  dueDate: string;
  status: string;
  orderCode: string;
  customerName: string;
  marketCode: string;
  remainingBalanceNtd: string;
};

type Tab = "OVERDUE" | "DUE_SOON" | "ALL";

const CHANNELS = ["LINE", "TIKTOK", "PHONE", "FACEBOOK"];

export default function InstallmentsPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("OVERDUE");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dunningTarget, setDunningTarget] = useState<Schedule | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/installments");
    const data = await res.json();
    setSchedules(data.schedules || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const in5Days = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 5); return d; }, [today]);

  function dueDateOf(s: Schedule) { return new Date(s.dueDate); }
  function isOverdue(s: Schedule) { return s.status === "PENDING" && dueDateOf(s) < today; }
  function isDueSoon(s: Schedule) { return s.status === "PENDING" && dueDateOf(s) >= today && dueDateOf(s) <= in5Days; }

  const overdue = useMemo(() => schedules.filter(isOverdue), [schedules, today]);
  const dueSoon = useMemo(() => schedules.filter(isDueSoon), [schedules, today, in5Days]);
  const rows = tab === "OVERDUE" ? overdue : tab === "DUE_SOON" ? dueSoon : schedules;

  const fmt = (n: string) => "$" + Math.round(Number(n)).toLocaleString("en-US") + " NTD";

  async function markPaid(scheduleId: string) {
    setBusy(scheduleId);
    setError("");
    const res = await fetch(`/api/installments/${scheduleId}/pay`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) { setError(data.error || "Failed to mark as paid."); return; }
    load();
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "OVERDUE", label: "Overdue", count: overdue.length },
    { key: "DUE_SOON", label: "Due Soon", count: dueSoon.length },
    { key: "ALL", label: "All Schedules", count: schedules.length },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-disp text-2xl font-bold">Installment Debt Board</h1>
        <p className="text-sm text-slate-500 mt-1">Payment schedules generated on delivery for installment orders.</p>
      </div>

      <div className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              tab === t.key ? "bg-accent text-white border-accent" : "border-slate-200 text-slate-600"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {error && <div className="text-sm text-danger mb-3">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">Nothing here.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="p-3">Order Code</th><th className="p-3">Customer</th><th className="p-3">Market</th>
                <th className="p-3">Period</th><th className="p-3">Amount Due</th><th className="p-3">Due Date</th>
                <th className="p-3">Status</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.scheduleId} className="border-b border-slate-100">
                  <td className="p-3 font-mono font-bold">{s.orderCode}</td>
                  <td className="p-3">{s.customerName}</td>
                  <td className="p-3">{s.marketCode}</td>
                  <td className="p-3">{s.periodNumber}</td>
                  <td className="p-3 font-mono">{fmt(s.amountDueNtd)}</td>
                  <td className={`p-3 ${isOverdue(s) ? "text-danger font-semibold" : "text-slate-500"}`}>
                    {new Date(s.dueDate).toLocaleDateString()}
                  </td>
                  <td className="p-3"><StatusPill status={s.status} meta={INSTALLMENT_META} /></td>
                  <td className="p-3 space-x-2 whitespace-nowrap">
                    {s.status === "PENDING" && (
                      <>
                        <button
                          onClick={() => setDunningTarget(s)}
                          className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold"
                        >
                          Log dunning
                        </button>
                        <button
                          onClick={() => markPaid(s.scheduleId)}
                          disabled={busy === s.scheduleId}
                          className="px-2.5 py-1 rounded-md bg-accent text-white text-xs font-semibold disabled:opacity-40"
                        >
                          {busy === s.scheduleId ? "…" : "Mark as paid"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dunningTarget && (
        <DunningModal
          schedule={dunningTarget}
          onClose={() => setDunningTarget(null)}
          onLogged={() => setDunningTarget(null)}
        />
      )}
    </div>
  );
}

function DunningModal({
  schedule, onClose, onLogged,
}: { schedule: Schedule; onClose: () => void; onLogged: () => void }) {
  const [channel, setChannel] = useState("LINE");
  const [result, setResult] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="font-disp font-bold text-lg mb-1">Log Dunning — {schedule.orderCode}</div>
        <p className="text-xs text-slate-500 mb-4">Period {schedule.periodNumber} · {schedule.customerName}</p>

        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Channel</div>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="input">
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Result</div>
            <input value={result} onChange={(e) => setResult(e.target.value)} className="input" placeholder="e.g. Promised to pay Friday" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Promised payment date</div>
            <input type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} className="input" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Notes</div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input" />
          </div>
        </div>

        {error && <div className="text-sm text-danger mt-3">{error}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">Cancel</button>
          <button onClick={submit} disabled={submitting || !result.trim()} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <style jsx global>{`.input { width:100%; padding:9px 11px; border-radius:8px; border:1px solid #E2E5EA; font-size:13.5px; }`}</style>
    </div>
  );
}
