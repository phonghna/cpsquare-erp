"use client";

import { useEffect, useMemo, useState } from "react";

type Variant = {
  variantId: string;
  brand: string | null;
  modelGroup: string;
  modelName: string;
  storage: string | null;
  color: string | null;
  sellingPriceNtd: string;
};

export default function PriceBookPage() {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/pricebook");
    const data = await res.json();
    setVariants(data.variants || []);
    setCanEdit(!!data.canEdit);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const fmt = (n: string) => "$" + Math.round(Number(n)).toLocaleString("en-US") + " NTD";

  function startEdit(v: Variant) {
    setEditingId(v.variantId);
    setEditPrice(v.sellingPriceNtd);
  }

  async function savePrice(variantId: string) {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/pricebook/${variantId}/price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: editPrice }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || "Failed to save price."); return; }
    setEditingId(null);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="font-disp text-2xl font-bold">Price Book</h1>
          <p className="text-sm text-slate-500 mt-1">Serialized (IMEI-tracked) product catalog.</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm">
            + Add New Product Variant
          </button>
        )}
      </div>

      {error && <div className="text-sm text-danger mb-3">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : variants.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No variants yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="p-3">SKU</th><th className="p-3">Model</th><th className="p-3">Storage</th>
                <th className="p-3">Color</th><th className="p-3">Price</th>{canEdit && <th className="p-3"></th>}
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.variantId} className="border-b border-slate-100">
                  <td className="p-3 font-mono font-bold">{v.variantId}</td>
                  <td className="p-3">{v.modelName}{v.brand ? ` (${v.brand})` : ""}</td>
                  <td className="p-3 text-slate-500">{v.storage || "—"}</td>
                  <td className="p-3 text-slate-500">{v.color || "—"}</td>
                  <td className="p-3 font-mono">
                    {editingId === v.variantId ? (
                      <input
                        type="number"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-28 px-2 py-1 rounded-md border border-slate-200 text-xs font-mono"
                        autoFocus
                      />
                    ) : (
                      fmt(v.sellingPriceNtd)
                    )}
                  </td>
                  {canEdit && (
                    <td className="p-3 space-x-2 whitespace-nowrap">
                      {editingId === v.variantId ? (
                        <>
                          <button
                            onClick={() => savePrice(v.variantId)}
                            disabled={saving}
                            className="px-2.5 py-1 rounded-md bg-accent text-white text-xs font-semibold disabled:opacity-40"
                          >
                            {saving ? "…" : "Save"}
                          </button>
                          <button onClick={() => setEditingId(null)} className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(v)} className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold">
                          Edit price
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <AddVariantModal
          existingModels={Array.from(new Set(variants.map((v) => v.modelGroup)))}
          existingBrands={Array.from(new Set(variants.map((v) => v.brand).filter(Boolean) as string[]))}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load(); }}
        />
      )}
    </div>
  );
}

function AddVariantModal({
  existingModels, existingBrands, onClose, onCreated,
}: { existingModels: string[]; existingBrands: string[]; onClose: () => void; onCreated: () => void }) {
  const [sku, setSku] = useState("");
  const [brand, setBrand] = useState("");
  const [modelGroup, setModelGroup] = useState("");
  const [storage, setStorage] = useState("");
  const [color, setColor] = useState("");
  const [price, setPrice] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isNewModel = useMemo(
    () => modelGroup.trim().length > 0 && !existingModels.some((m) => m.toLowerCase() === modelGroup.trim().toLowerCase()),
    [modelGroup, existingModels]
  );

  async function submit() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/pricebook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, brand: brand || null, modelGroup, storage: storage || null, color: color || null, price }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to create variant."); return; }
    onCreated();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="font-disp font-bold text-lg mb-4">Add New Product Variant</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU" full>
            <input value={sku} onChange={(e) => setSku(e.target.value)} className="input" placeholder="IP16PM-256-BLK" />
          </Field>
          <Field label="Model" full>
            <input value={modelGroup} onChange={(e) => setModelGroup(e.target.value)} className="input" list="model-options" placeholder="Type or pick a model…" />
            <datalist id="model-options">
              {existingModels.map((m) => <option key={m} value={m} />)}
            </datalist>
            {modelGroup.trim() && (
              <div className={`text-[11px] mt-1 ${isNewModel ? "text-accent font-semibold" : "text-slate-400"}`}>
                {isNewModel ? "+ Create new variant for this model" : "Matches an existing model."}
              </div>
            )}
          </Field>
          <Field label="Brand">
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className="input" list="brand-options" />
            <datalist id="brand-options">
              {existingBrands.map((b) => <option key={b} value={b} />)}
            </datalist>
          </Field>
          <Field label="Storage">
            <input value={storage} onChange={(e) => setStorage(e.target.value)} className="input" placeholder="256GB" />
          </Field>
          <Field label="Color">
            <input value={color} onChange={(e) => setColor(e.target.value)} className="input" placeholder="Black" />
          </Field>
          <Field label="Price (NTD)">
            <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} className="input" />
          </Field>
        </div>
        {error && <div className="text-sm text-danger mt-3">{error}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">Cancel</button>
          <button onClick={submit} disabled={submitting || !sku || !modelGroup} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Adding…" : "Add Variant"}
          </button>
        </div>
      </div>
      <style jsx global>{`.input { width:100%; padding:9px 11px; border-radius:8px; border:1px solid #E2E5EA; font-size:13.5px; }`}</style>
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
