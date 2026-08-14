"use client";

import { useEffect, useState } from "react";
import { Card, Empty, ModalShell, ConfirmModal, inputStyle, btnPrimary, btnGhost, tableStyle, th, td, VariantDraftFields, VariantDraft } from "@/components/ui";

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
  const [showBulk, setShowBulk] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Variant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/pricebook");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || `Failed to load Price Book (HTTP ${res.status}).`); return; }
      setVariants(data.variants || []);
      setCanEdit(!!data.canEdit);
      setPriceLogs(data.priceLogs || []);
    } catch (err: any) {
      setError(err?.message || "Network error — failed to load Price Book.");
    } finally {
      setLoading(false);
    }
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

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    const res = await fetch(`/api/pricebook/${deleteTarget.variantId}/delete`, { method: "POST" });
    const data = await res.json();
    setDeleting(false);
    if (!res.ok) { setDeleteError(data.error || "Failed to delete variant."); return; }
    setDeleteTarget(null);
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
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setShowBulk(true)} style={btnGhost}>⬆ Bulk Add Variants</button>
            <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Add New Product Variant</button>
          </div>
        )}
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
                        <>
                          <button onClick={() => startEdit(v)} style={btnGhost}>Edit price</button>
                          <button onClick={() => { setDeleteError(""); setDeleteTarget(v); }} style={{ ...btnGhost, color: "var(--danger)", marginLeft: 6 }}>🗑 Delete</button>
                        </>
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
      {showBulk && canEdit && (
        <BulkAddModal onClose={() => setShowBulk(false)} onImported={() => { setShowBulk(false); load(); }} />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Delete this product variant?"
          message={
            <>
              This will permanently remove <strong>{deleteTarget.modelName}{deleteTarget.color ? ` · ${deleteTarget.color}` : ""}</strong> (<span className="mono">{deleteTarget.variantId}</span>) from the Price Book. This cannot be undone.
              {deleteError && <div style={{ color: "var(--danger)", marginTop: 10 }}>{deleteError}</div>}
            </>
          }
          confirmLabel="Delete variant"
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function BulkAddModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState("IP15PRO-256-BLU, Apple, iPhone 15 Pro, 256GB, Titanium Blue, 41900\nSGS24-128-BLK, Samsung, Galaxy S24, 128GB, Black, 26900");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);

  async function submit() {
    setSubmitting(true);
    setError("");
    setResult(null);
    const res = await fetch("/api/pricebook/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: text }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Bulk add failed."); return; }
    setResult({ imported: data.imported, errors: data.errors || [] });
  }

  return (
    <ModalShell onClose={onClose} title="Bulk Add Product Variants">
      <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 10 }}>
        One variant per line: SKU, Brand, Model, Storage, Color, Price — SKU is always set by you, for consistent naming (paste one row per line, simulating an Excel upload).
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} style={{ ...inputStyle, resize: "vertical", fontFamily: "IBM Plex Mono, monospace", fontSize: 12.5 }} />
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      {result && (
        <div style={{ fontSize: 13, marginTop: 10 }}>
          <div style={{ color: "var(--ok)", fontWeight: 600 }}>Added {result.imported} variant(s).</div>
          {result.errors.length > 0 && (
            <ul style={{ color: "var(--danger)", fontSize: 12, marginTop: 4, paddingLeft: 18 }}>
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>{result ? "Close" : "Cancel"}</button>
        {!result && <button onClick={submit} disabled={submitting} style={btnPrimary}>{submitting ? "Adding…" : "Add rows"}</button>}
        {result && <button onClick={onImported} style={btnPrimary}>Done</button>}
      </div>
    </ModalShell>
  );
}

function AddVariantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [draft, setDraft] = useState<VariantDraft>({ sku: "", brand: "Apple", modelName: "", storage: "", color: "", price: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = draft.sku.trim() && draft.modelName.trim() && draft.storage.trim() && draft.color.trim();

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/pricebook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: draft.sku, brand: draft.brand || null, modelGroup: draft.modelName, storage: draft.storage || null, color: draft.color || null, price: draft.price }),
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
        <button onClick={submit} disabled={submitting || !canSubmit} style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Adding…" : "Save new model"}
        </button>
      </div>
    </ModalShell>
  );
}
