"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, btnGhost } from "@/components/ui";

type Item = { imeiSerial: string; variantId: string; modelName: string; rmaStage: string };

const STAGES = ["RECEIVE", "INSPECTION", "REPAIRING", "REPAIR_DONE", "SENT_OUT"];

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
    for (const s of STAGES) map[s] = [];
    for (const i of items) { const stage = i.rmaStage || "RECEIVE"; if (map[stage]) map[stage].push(i); }
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
      <div className="mb-5">
        <h1 className="disp text-2xl font-bold">Repair / RMA</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Five-stage repair lifecycle, shared across all markets at the TW workshop.</p>
      </div>

      {error && <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</div>}

      {loading ? (
        <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px,1fr))", gap: 14 }}>
          {STAGES.map((stage) => {
            const stageItems = byStage[stage];
            return (
              <Card key={stage} style={{ padding: 14, background: "var(--paper)" }}>
                <div className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 10 }}>
                  {stage} · {stageItems.length}
                </div>
                {stageItems.length === 0 && <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Empty</div>}
                {stageItems.map((i) => (
                  <Card key={i.imeiSerial} style={{ padding: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{i.modelName}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--text-faint)", margin: "4px 0 8px" }}>{i.imeiSerial}</div>
                    <button
                      onClick={() => advance(i.imeiSerial)}
                      disabled={busy === i.imeiSerial}
                      style={{ ...btnGhost, width: "100%", textAlign: "center", opacity: busy === i.imeiSerial ? 0.5 : 1 }}
                    >
                      {busy === i.imeiSerial ? "…" : stage === "SENT_OUT" ? "✓ Complete → IN_STOCK" : "Advance stage →"}
                    </button>
                  </Card>
                ))}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
