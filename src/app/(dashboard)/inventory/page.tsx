"use client";

import { useEffect, useState } from "react";
import { StatusPill, STATUS_META } from "@/components/ui";

type Item = {
  imeiSerial: string;
  variantId: string;
  status: string;
  currentLocation: string;
  batteryHealth: number | null;
  cosmeticCondition: string | null;
};

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [canOperate, setCanOperate] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/inventory");
    const data = await res.json();
    setItems(data.items || []);
    setCanManage(!!data.canManage);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function act(imei: string, action: string) {
    setBusy(imei);
    const res = await fetch(`/api/inventory/${imei}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.status === 403) setCanOperate(false);
    setBusy(null);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="font-disp text-2xl font-bold">IMEI Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">
            Centralized at CPSquare Warehouse (TW) — every serialized device serves all 4 markets from one pool.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => setShowBulk(true)} className="px-4 py-2 rounded-lg border border-slate-200 font-semibold text-sm">
              Bulk Import
            </button>
            <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm">
              + Add New IMEI
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="p-3">IMEI</th><th className="p-3">SKU</th><th className="p-3">Battery</th>
                <th className="p-3">Location</th><th className="p-3">Status</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.imeiSerial} className="border-b border-slate-100">
                  <td className="p-3 font-mono">{i.imeiSerial}</td>
                  <td className="p-3">{i.variantId}</td>
                  <td className="p-3">{i.batteryHealth ?? "—"}%</td>
                  <td className="p-3 text-slate-500">{i.currentLocation}</td>
                  <td className="p-3"><StatusPill status={i.status} meta={STATUS_META} /></td>
                  <td className="p-3 space-x-2">
                    {canOperate && i.status === "IN_STOCK" && (
                      <>
                        <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "CHECKOUT_LIVE")}>Check-out live</ActionBtn>
                        <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "MEDIA_HOLD")}>Media hold</ActionBtn>
                      </>
                    )}
                    {canOperate && i.status === "CHECKED_OUT_LIVE" && (
                      <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "CHECKIN")}>Check-in shelf</ActionBtn>
                    )}
                    {canOperate && i.status === "MEDIA_HOLD" && (
                      <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "RELEASE_HOLD")}>Release hold</ActionBtn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <AddImeiModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load(); }}
        />
      )}
      {showBulk && (
        <BulkImportModal
          onClose={() => setShowBulk(false)}
          onImported={() => { setShowBulk(false); load(); }}
        />
      )}
    </div>
  );
}

function ActionBtn({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold disabled:opacity-40">
      {busy ? "…" : children}
    </button>
  );
}

function AddImeiModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [variants, setVariants] = useState<{ variantId: string; modelName: string }[]>([]);
  const [imeiSerial, setImeiSerial] = useState("");
  const [variantId, setVariantId] = useState("");
  const [batteryHealth, setBatteryHealth] = useState("");
  const [cosmeticCondition, setCosmeticCondition] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/inventory/variants");
      const data = await res.json();
      setVariants(data.variants || []);
      if (data.variants?.[0]) setVariantId(data.variants[0].variantId);
    })();
  }, []);

  async function submit() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imeiSerial, variantId, batteryHealth: batteryHealth || null, cosmeticCondition: cosmeticCondition || null }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to add IMEI."); return; }
    onCreated();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="font-disp font-bold text-lg mb-4">Add New IMEI</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="IMEI" full>
            <input value={imeiSerial} onChange={(e) => setImeiSerial(e.target.value)} className="input" placeholder="e.g. 356938035643809" />
          </Field>
          <Field label="SKU" full>
            <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className="input">
              {variants.map((v) => <option key={v.variantId} value={v.variantId}>{v.modelName} — {v.variantId}</option>)}
            </select>
          </Field>
          <Field label="Battery health (%)">
            <input type="number" value={batteryHealth} onChange={(e) => setBatteryHealth(e.target.value)} className="input" />
          </Field>
          <Field label="Cosmetic condition">
            <input value={cosmeticCondition} onChange={(e) => setCosmeticCondition(e.target.value)} className="input" placeholder="New / Grade A / Grade B…" />
          </Field>
        </div>
        {error && <div className="text-sm text-danger mt-3">{error}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">Cancel</button>
          <button onClick={submit} disabled={submitting || !imeiSerial || !variantId} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Adding…" : "Add IMEI"}
          </button>
        </div>
      </div>
      <style jsx global>{`.input { width:100%; padding:9px 11px; border-radius:8px; border:1px solid #E2E5EA; font-size:13.5px; }`}</style>
    </div>
  );
}

function BulkImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [csv, setCsv] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);

  async function submit() {
    setSubmitting(true);
    setError("");
    setResult(null);
    const res = await fetch("/api/inventory/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Bulk import failed."); return; }
    setResult({ imported: data.imported, errors: data.errors || [] });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-disp font-bold text-lg mb-1">Bulk Import IMEI Stock</div>
        <p className="text-xs text-slate-500 mb-3">
          One row per line: <code className="font-mono">imei,variant_id,battery_health,cosmetic_condition</code> — battery and condition may be left blank.
        </p>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={10}
          className="w-full p-3 rounded-lg border border-slate-200 font-mono text-xs"
          placeholder={"356938035643809,IP14PM-256-BLK,98,New\n356938035643810,IP14PM-256-BLK,95,"}
        />
        {error && <div className="text-sm text-danger mt-3">{error}</div>}
        {result && (
          <div className="text-sm mt-3">
            <div className="text-ok font-semibold">Imported {result.imported} row(s).</div>
            {result.errors.length > 0 && (
              <ul className="text-danger text-xs mt-1 list-disc pl-4">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button onClick={submit} disabled={submitting || !csv.trim()} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
              {submitting ? "Importing…" : "Import"}
            </button>
          )}
          {result && (
            <button onClick={onImported} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-xs font-semibold text-slate-500 mb-1.5">{label}</div>
      {children}
    </div>
  );
}
