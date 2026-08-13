"use client";

import { useEffect, useState } from "react";
import { Card, Empty, ModalShell, Field, inputStyle, btnPrimary, btnGhost, tableStyle, th, td } from "@/components/ui";

type Accessory = {
  variantId: string; modelGroup: string; modelName: string; sellingPriceNtd: string;
  stockQuantity: number; reservedQuantity: number; compatibleModel: string | null;
};

const fmt = (n: string) => "$" + Math.round(Number(n)).toLocaleString("en-US") + " NTD";

export default function AccessoriesPage() {
  const [items, setItems] = useState<Accessory[]>([]);
  const [modelGroups, setModelGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const [accRes, varRes] = await Promise.all([fetch("/api/accessories"), fetch("/api/inventory/variants")]);
    const accData = await accRes.json();
    const varData = await varRes.json();
    setItems(accData.accessories || []);
    setCanManage(!!accData.canManage);
    setModelGroups(Array.from(new Set((varData.variants || []).map((v: any) => v.modelGroup))) as string[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function adjust(variantId: string, delta: number) {
    setBusy(variantId);
    await fetch(`/api/accessories/${encodeURIComponent(variantId)}/adjust`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delta }),
    });
    setBusy(null);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-5 flex-wrap gap-3">
        <div>
          <h1 className="disp text-2xl font-bold">Accessories Warehouse</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Quantity-based SKUs. Model-specific items show their compatible phone; universal items fit everything.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(true)} style={btnGhost}>+ Add New Accessory</button>
            <button onClick={() => setShowBulk(true)} style={btnGhost}>⬆ Bulk Import Excel</button>
          </div>
        )}
      </div>

      {error && <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</div>}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
        ) : items.length === 0 ? (
          <Empty title="No accessories yet" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr><th style={th}>SKU</th><th style={th}>Name</th><th style={th}>Compatible with</th><th style={th}>Price</th><th style={th}>In Stock</th><th style={th}>Reserved</th><th style={th}></th></tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.variantId}>
                    <td style={td} className="mono">{a.variantId}</td>
                    <td style={td}>{a.modelName}</td>
                    <td style={td}>
                      {a.compatibleModel ? <span style={{ fontSize: 12, fontWeight: 600, color: "var(--info)" }}>{a.compatibleModel}</span> : <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Universal</span>}
                    </td>
                    <td style={td} className="mono">{fmt(a.sellingPriceNtd)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{a.stockQuantity}</td>
                    <td style={td}>{a.reservedQuantity}</td>
                    <td style={td}>
                      <button onClick={() => adjust(a.variantId, 10)} disabled={busy === a.variantId} style={{ ...btnGhost, marginRight: 6, opacity: busy === a.variantId ? 0.4 : 1 }}>+ Add 10</button>
                      <button onClick={() => adjust(a.variantId, -1)} disabled={busy === a.variantId || a.stockQuantity <= 0} style={{ ...btnGhost, opacity: busy === a.variantId || a.stockQuantity <= 0 ? 0.4 : 1 }}>− Deduct 1</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showAdd && (
        <AddAccessoryModal modelGroups={modelGroups} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(); }} />
      )}
      {showBulk && <BulkImportModal onClose={() => setShowBulk(false)} onImported={() => { setShowBulk(false); load(); }} />}
    </div>
  );
}

function AddAccessoryModal({ modelGroups, onClose, onCreated }: { modelGroups: string[]; onClose: () => void; onCreated: () => void }) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState(20);
  const [price, setPrice] = useState(190);
  const [compat, setCompat] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!sku.trim() || !name.trim()) return;
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/accessories", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: sku.trim(), name: name.trim(), quantity: qty, price, compatibleModel: compat || null }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to add accessory."); return; }
    onCreated();
  }

  return (
    <ModalShell onClose={onClose} title="Add New Accessory">
      <Field label="SKU"><input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-CASE-XXXX" style={inputStyle} /></Field>
      <div style={{ height: 10 }} />
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <Field label="Quantity to add"><input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} style={inputStyle} /></Field>
        <Field label="Retail price (NTD)"><input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} style={inputStyle} /></Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <Field label="Compatible With (blank = universal fit)">
          <select value={compat} onChange={(e) => setCompat(e.target.value)} style={inputStyle}>
            <option value="">Universal (fits all models)</option>
            {modelGroups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={submit} disabled={submitting} style={btnPrimary}>{submitting ? "Adding…" : "Add accessory"}</button>
      </div>
    </ModalShell>
  );
}

function BulkImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState("SKU-CASE-PXL8, Jelly Case (Pixel 8), 30, 190, Pixel 8");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);

  async function submit() {
    setSubmitting(true);
    setError("");
    setResult(null);
    const res = await fetch("/api/accessories/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: text }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Bulk import failed."); return; }
    setResult({ imported: data.imported, errors: data.errors || [] });
  }

  return (
    <ModalShell onClose={onClose} title="Bulk Import Accessories">
      <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 10 }}>One accessory per line: SKU, Name, Quantity, Price(NTD), CompatibleModel(blank=universal) — paste one row per line.</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} style={{ ...inputStyle, resize: "vertical", fontFamily: "IBM Plex Mono, monospace", fontSize: 12.5 }} />
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      {result && (
        <div style={{ fontSize: 13, marginTop: 10 }}>
          <div style={{ color: "var(--ok)", fontWeight: 600 }}>Imported {result.imported} row(s).</div>
          {result.errors.length > 0 && (
            <ul style={{ color: "var(--danger)", fontSize: 12, marginTop: 4, paddingLeft: 18 }}>
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>{result ? "Close" : "Cancel"}</button>
        {!result && <button onClick={submit} disabled={submitting} style={btnPrimary}>{submitting ? "Importing…" : "Import rows"}</button>}
        {result && <button onClick={onImported} style={btnPrimary}>Done</button>}
      </div>
    </ModalShell>
  );
}
