"use client";

import { useEffect, useState } from "react";

type Accessory = {
  variantId: string;
  modelGroup: string;
  modelName: string;
  sellingPriceNtd: string;
  stockQuantity: number;
  reservedQuantity: number;
  compatibleModel: string | null;
};

export default function AccessoriesPage() {
  const [items, setItems] = useState<Accessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/accessories");
    const data = await res.json();
    setItems(data.accessories || []);
    setCanManage(!!data.canManage);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function adjust(variantId: string, delta: number) {
    setBusy(variantId);
    await fetch(`/api/accessories/${encodeURIComponent(variantId)}/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta }),
    });
    setBusy(null);
    load();
  }

  const fmt = (n: string) => "$" + Math.round(Number(n)).toLocaleString("en-US") + " NTD";

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="font-disp text-2xl font-bold">Accessories Warehouse</h1>
          <p className="text-sm text-slate-500 mt-1">Quantity-based SKUs — cases, chargers, gifts. Not tracked by IMEI.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => setShowBulk(true)} className="px-4 py-2 rounded-lg border border-slate-200 font-semibold text-sm">
              Bulk Import
            </button>
            <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm">
              + Add New Accessory
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No accessories yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="p-3">SKU</th><th className="p-3">Name</th><th className="p-3">Compatible Model</th>
                <th className="p-3">Price</th><th className="p-3">Stock</th><th className="p-3">Reserved</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.variantId} className="border-b border-slate-100">
                  <td className="p-3 font-mono font-bold">{a.variantId}</td>
                  <td className="p-3">{a.modelName}</td>
                  <td className="p-3 text-slate-500">{a.compatibleModel || "Universal"}</td>
                  <td className="p-3 font-mono">{fmt(a.sellingPriceNtd)}</td>
                  <td className="p-3 font-mono font-bold">{a.stockQuantity}</td>
                  <td className="p-3 font-mono text-slate-500">{a.reservedQuantity}</td>
                  <td className="p-3 space-x-2">
                    <button
                      onClick={() => adjust(a.variantId, 10)}
                      disabled={busy === a.variantId}
                      className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold disabled:opacity-40"
                    >
                      {busy === a.variantId ? "…" : "+ Add 10"}
                    </button>
                    <button
                      onClick={() => adjust(a.variantId, -1)}
                      disabled={busy === a.variantId || a.stockQuantity <= 0}
                      className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold disabled:opacity-40"
                    >
                      {busy === a.variantId ? "…" : "− Deduct 1"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <AddAccessoryModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load(); }}
          error={error}
          setError={setError}
        />
      )}
      {showBulk && (
        <BulkImportModal
          onClose={() => setShowBulk(false)}
          onImported={() => { setShowBulk(false); load(); }}
          error={error}
          setError={setError}
        />
      )}
    </div>
  );
}

function AddAccessoryModal({
  onClose, onCreated, error, setError,
}: { onClose: () => void; onCreated: () => void; error: string; setError: (s: string) => void }) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [compatibleModel, setCompatibleModel] = useState("");
  const [price, setPrice] = useState(0);
  const [quantity, setQuantity] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/accessories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, name, compatibleModel: compatibleModel || null, price, quantity }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to add accessory."); return; }
    onCreated();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="font-disp font-bold text-lg mb-4">Add New Accessory</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU" full>
            <input value={sku} onChange={(e) => setSku(e.target.value)} className="input" placeholder="SKU-CASE-IP15" />
          </Field>
          <Field label="Name" full>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Jelly Case (iPhone 15)" />
          </Field>
          <Field label="Compatible model" full>
            <input value={compatibleModel} onChange={(e) => setCompatibleModel(e.target.value)} className="input" placeholder="Leave blank for Universal" />
          </Field>
          <Field label="Price (NTD)">
            <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} className="input" />
          </Field>
          <Field label="Initial stock qty">
            <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="input" />
          </Field>
        </div>
        {error && <div className="text-sm text-danger mt-3">{error}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">Cancel</button>
          <button onClick={submit} disabled={submitting || !sku || !name} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Adding…" : "Add Accessory"}
          </button>
        </div>
      </div>
      <style jsx global>{`.input { width:100%; padding:9px 11px; border-radius:8px; border:1px solid #E2E5EA; font-size:13.5px; }`}</style>
    </div>
  );
}

function BulkImportModal({
  onClose, onImported, error, setError,
}: { onClose: () => void; onImported: () => void; error: string; setError: (s: string) => void }) {
  const [csv, setCsv] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);

  async function submit() {
    setSubmitting(true);
    setError("");
    setResult(null);
    const res = await fetch("/api/accessories/bulk", {
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
        <div className="font-disp font-bold text-lg mb-1">Bulk Import Accessories</div>
        <p className="text-xs text-slate-500 mb-3">
          One row per line: <code className="font-mono">sku,name,qty,price,compatible_model</code> — leave compatible_model blank for Universal. Existing SKUs are updated.
        </p>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={10}
          className="w-full p-3 rounded-lg border border-slate-200 font-mono text-xs"
          placeholder={"SKU-CASE-IP15,Jelly Case (iPhone 15),26,190,iPhone 15\nSKU-POWERBANK,Power Bank,22,690,"}
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
