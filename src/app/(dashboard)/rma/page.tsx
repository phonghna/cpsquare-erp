"use client";

import { useEffect, useMemo, useState } from "react";

type Item = { imeiSerial: string; variantId: string; rmaStage: string; cosmeticCondition: string | null };

const STAGES = [
  { key: "RECEIVE", label: "Receive" },
  { key: "INSPECTION", label: "Inspection" },
  { key: "REPAIRING", label: "Repairing" },
  { key: "REPAIR_DONE", label: "Repair Done" },
  { key: "SENT_OUT", label: "Sent Out" },
];

export default function RmaPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/rma");
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const byStage = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const s of STAGES) map[s.key] = [];
    for (const i of items) { if (map[i.rmaStage]) map[i.rmaStage].push(i); }
    return map;
  }, [items]);

  async function advance(imei: string) {
    setBusy(imei);
    setError("");
    const res = await fetch(`/api/rma/${imei}/advance`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) { setError(data.error || "Failed to advance."); return; }
    load();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-disp text-2xl font-bold">Repair / RMA</h1>
        <p className="text-sm text-slate-500 mt-1">Devices moving through repair — advance each card as work progresses.</p>
      </div>

      {error && <div className="text-sm text-danger mb-3">{error}</div>}

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {STAGES.map((s) => (
            <div key={s.key} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="p-3 border-b border-slate-200">
                <div className="font-disp font-bold text-sm">{s.label}</div>
                <div className="text-[11px] text-slate-500">{byStage[s.key].length} device(s)</div>
              </div>
              <div>
                {byStage[s.key].length === 0 ? (
                  <div className="p-5 text-center text-slate-400 text-xs">Empty</div>
                ) : (
                  byStage[s.key].map((i) => (
                    <div key={i.imeiSerial} className="p-3 border-b border-slate-100">
                      <div className="font-mono text-xs font-bold truncate">{i.imeiSerial}</div>
                      <div className="text-[11px] text-slate-500 mb-2 truncate">{i.variantId}</div>
                      <button
                        onClick={() => advance(i.imeiSerial)}
                        disabled={busy === i.imeiSerial}
                        className="w-full px-2 py-1 rounded-md bg-accent text-white text-[11px] font-semibold disabled:opacity-40"
                      >
                        {busy === i.imeiSerial ? "…" : s.key === "SENT_OUT" ? "Complete → IN STOCK" : "Advance stage →"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
