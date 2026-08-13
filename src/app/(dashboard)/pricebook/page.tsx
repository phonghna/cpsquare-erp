"use client";

import { useEffect, useState } from "react";
import { Card, Empty, ModalShell, inputStyle, btnPrimary, btnGhost, tableStyle, th, td, VariantDraftFields, VariantDraft } from "@/components/ui";

type Variant = {
  variantId: string;
  brand: string | null;
  modelGroup: string;
  modelName: string;
  storage: string | null;
  color: string | null;
  category: string | null;
  sellingPriceNtd: string;
};

type PriceLog = { logId: string; variantId: string; orderCode: string | null; approvedBy: string; note: string; createdAt: string };

const fmt = (n: string) => "$" + Math.round(Number(n)).toLocaleString("en-US") + " NTD";

export default function PriceBookPage() {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [priceLogs, setPriceLogs] = useState<PriceLog[]>([]);
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
    setPriceLogs(data.priceLogs || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

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
      <div className="flex justify-between items-end mb-5 flex-wrap gap-3">
        <div>
          <h1 className="disp text-2xl font-bold">Price Book</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
            {canEdit ? "Base retail price for every IMEI-tracked SKU, stored globally in NTD." : "Read-only — only Admin can edit base prices or add new product variants."}
          </p>
        </div>
        {canEdit && <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Add New Product Variant</button>}
      </div>

      {error && <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</div>}

      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        {loading ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
        ) : variants.length === 0 ? (
          <Empty title="No variants yet" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr><th style={th}>SKU</th><th style={th}>Model</th><th style={th}>Category</th><th style={th}>Color</th><th style={th}>Base Price (NTD)</th><th style={th}></th></tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.variantId}>
                    <td style={td} className="mono">{v.variantId}</td>
                    <td style={td}>{v.modelName}{v.brand ? ` (${v.brand})` : ""}</td>
                    <td style={td}>{v.modelGroup}</td>
                    <td style={td}>{v.color || "—"}</td>
                    <td style={td}>
                      {editingId === v.variantId ? (
                        <input autoFocus type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} style={{ ...inputStyle, maxWidth: 130 }} />
                      ) : (
                        <span className="mono" style={{ fontWeight: 700 }}>{fmt(v.sellingPriceNtd)}</span>
                      )}
                    </td>
                    <td style={td}>
                      {!canEdit ? (
                        <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>View only</span>
                      ) : editingId === v.variantId ? (
                        <button onClick={() => savePrice(v.variantId)} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? "…" : "Save"}</button>
                      ) : (
                        <button onClick={() => startEdit(v)} style={btnGhost}>Edit price</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="disp" style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Price_Change_Logs</div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {priceLogs.length === 0 ? (
          <Empty title="No price changes recorded yet" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr><th style={th}>Time</th><th style={th}>SKU</th><th style={th}>Order</th><th style={th}>Approved by</th><th style={th}>Note</th></tr>
              </thead>
              <tbody>
                {priceLogs.map((l) => (
                  <tr key={l.logId}>
                    <td style={td} className="mono">{new Date(l.createdAt).toLocaleString("en-US")}</td>
                    <td style={td} className="mono">{l.variantId}</td>
                    <td style={td} className="mono">{l.orderCode || "—"}</td>
                    <td style={td}>{l.approvedBy}</td>
                    <td style={td}>{l.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showAdd && canEdit && (
        <AddVariantModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(); }} />
      )}
    </div>
  );
}

function AddVariantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [draft, setDraft] = useState<VariantDraft>({ brand: "Apple", modelName: "", storage: "", color: "", price: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!draft.modelName.trim() || !draft.storage.trim() || !draft.color.trim()) return;
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/pricebook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: draft.brand || null, modelGroup: draft.modelName, storage: draft.storage || null, color: draft.color || null, price: draft.price }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to create variant."); return; }
    onCreated();
  }

  return (
    <ModalShell onClose={onClose} title="Add New Product Variant">
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>Saved variants appear immediately in the Add Single Device combobox and the CS order-intake search.</div>
      <VariantDraftFields draft={draft} setDraft={setDraft} />
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={submit} disabled={submitting || !draft.modelName.trim() || !draft.storage.trim() || !draft.color.trim()} style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Adding…" : "Save new model"}
        </button>
      </div>
    </ModalShell>
  );
}
