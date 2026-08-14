"use client";

import { useEffect, useMemo, useState } from "react";
import {
  StatusPill, STATUS_META, Card, Empty, Tabs, ModalShell, ConfirmModal, Field, inputStyle, btnPrimary, btnGhost,
  tableStyle, th, td, VariantDraftFields, VariantDraft, BRANDS,
} from "@/components/ui";
import SearchCombobox from "@/components/SearchCombobox";

type Item = {
  imeiSerial: string; variantId: string; status: string; currentLocation: string;
  batteryHealth: number | null; cosmeticCondition: string | null; orderId: string | null;
  remark: string | null; statusUpdatedAt: string;
  variant: { variantId: string; modelName: string; color: string | null } | null;
  order: { orderCode: string; customerName: string; customerSocialHandle: string | null; marketCode: string } | null;
};
type Variant = { variantId: string; modelName: string; color: string | null; sellingPriceNtd: string };

const fmt = (n: string | number) => "$" + Math.round(Number(n)).toLocaleString("en-US") + " NTD";

const AVAILABLE_STATUSES = ["IN_STOCK", "CHECKED_OUT_LIVE", "MEDIA_HOLD"];
const RESERVED_STATUSES = ["RESERVED", "PACKING", "SHIPPED", "MISSING", "WHOLESALE"];
const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "IN_STOCK", label: "In Stock" },
  { value: "CHECKED_OUT_LIVE", label: "Checked-out Live" },
  { value: "MEDIA_HOLD", label: "Media Hold" },
  { value: "RESERVED", label: "Reserved" },
  { value: "PACKING", label: "In Packing" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "MISSING", label: "Missing" },
  { value: "WHOLESALE", label: "Wholesale" },
];
const SET_STATUS_OPTIONS = [
  { value: "IN_STOCK", label: "In Stock" },
  { value: "CHECKED_OUT_LIVE", label: "Checked-out Live" },
  { value: "MEDIA_HOLD", label: "Media Hold" },
  { value: "MISSING", label: "Missing" },
  { value: "WHOLESALE", label: "Wholesale" },
];

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [canOperate, setCanOperate] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [canSetStatus, setCanSetStatus] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState("available");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [statusTarget, setStatusTarget] = useState<Item | null>(null);

  async function load() {
    setLoading(true);
    const [invRes, varRes] = await Promise.all([fetch("/api/inventory"), fetch("/api/inventory/variants")]);
    const invData = await invRes.json();
    const varData = await varRes.json();
    setItems(invData.items || []);
    setCanManage(!!invData.canManage);
    setCanSetStatus(!!invData.canSetStatus);
    setVariants(varData.variants || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function pickStatusFilter(v: string) {
    setStatusFilter(v);
    if (v) setTab(AVAILABLE_STATUSES.includes(v) ? "available" : "reserved");
  }

  async function act(imei: string, action: string) {
    setBusy(imei);
    const res = await fetch(`/api/inventory/${imei}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    if (res.status === 403) setCanOperate(false);
    setBusy(null);
    load();
  }

  async function confirmDeleteDevice() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    const res = await fetch(`/api/inventory/${deleteTarget.imeiSerial}/delete`, { method: "POST" });
    const data = await res.json();
    setDeleting(false);
    if (!res.ok) { setDeleteError(data.error || "Failed to delete device."); return; }
    setDeleteTarget(null);
    load();
  }

  const available = useMemo(
    () => items.filter((i) => AVAILABLE_STATUSES.includes(i.status) && (!statusFilter || i.status === statusFilter) && matches(i, q)),
    [items, q, statusFilter]
  );
  const reserved = useMemo(
    () => items
      .filter((i) => RESERVED_STATUSES.includes(i.status) && (!statusFilter || i.status === statusFilter) && matches(i, q))
      .sort((a, b) => new Date(b.statusUpdatedAt).getTime() - new Date(a.statusUpdatedAt).getTime()),
    [items, q, statusFilter]
  );

  function matches(i: Item, query: string) {
    if (!query) return true;
    const q = query.toLowerCase();
    return i.imeiSerial.includes(query) || (i.variant?.modelName || "").toLowerCase().includes(q);
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-5 flex-wrap gap-3">
        <div>
          <h1 className="disp text-2xl font-bold">IMEI Inventory</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
            Centralized at CPSquare Warehouse (TW) — every serialized device serves all 4 markets from one pool.{!canOperate && " Search-only for your role."}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(true)} style={btnGhost}>+ Add Single Device</button>
            <button onClick={() => setShowBulk(true)} style={btnGhost}>⬆ Bulk Import Excel</button>
          </div>
        )}
      </div>

      <Tabs
        tabs={[{ id: "available", label: `Available Stock (${available.length})` }, { id: "reserved", label: `Reserved Items Board (${reserved.length})` }]}
        active={tab}
        onChange={setTab}
      />
      <div className="mb-4 flex gap-2 flex-wrap">
        <input placeholder="Search by IMEI or product name..." value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, maxWidth: 300 }} />
        <select value={statusFilter} onChange={(e) => pickStatusFilter(e.target.value)} style={{ ...inputStyle, maxWidth: 190 }}>
          {STATUS_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
      ) : tab === "available" ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {available.length === 0 ? <Empty title="No devices match" /> : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>IMEI</th><th style={th}>Product</th><th style={th}>Battery</th><th style={th}>Cosmetic</th><th style={th}>Location</th><th style={th}>Status</th><th style={th}></th></tr></thead>
                <tbody>
                  {available.map((i) => (
                    <tr key={i.imeiSerial}>
                      <td style={td} className="mono">{i.imeiSerial}</td>
                      <td style={td}>{i.variant?.modelName} <span style={{ color: "var(--text-faint)" }}>· {i.variant?.color}</span></td>
                      <td style={td}>{i.batteryHealth ?? "—"}%</td>
                      <td style={td}>{i.cosmeticCondition || "—"}</td>
                      <td style={{ ...td, color: "var(--text-dim)" }}>{i.currentLocation}</td>
                      <td style={td}><StatusPill status={i.status} meta={STATUS_META} /></td>
                      <td style={td}>
                        {canOperate && i.status === "IN_STOCK" && (
                          <>
                            <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "CHECKOUT_LIVE")}>Check-out live</ActionBtn>
                            <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "MEDIA_HOLD")}>Media hold</ActionBtn>
                          </>
                        )}
                        {canOperate && i.status === "CHECKED_OUT_LIVE" && <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "CHECKIN")}>Check-in shelf</ActionBtn>}
                        {canOperate && i.status === "MEDIA_HOLD" && <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "RELEASE_HOLD")}>Release hold</ActionBtn>}
                        {!canOperate && <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>—</span>}
                        {canSetStatus && (
                          <button onClick={() => setStatusTarget(i)} style={{ ...btnGhost, marginLeft: 6 }}>Set status</button>
                        )}
                        {canManage && i.status === "IN_STOCK" && (
                          <button onClick={() => { setDeleteError(""); setDeleteTarget(i); }} disabled={busy === i.imeiSerial} style={{ ...btnGhost, color: "var(--danger)", marginLeft: 6 }}>🗑 Delete</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {reserved.length === 0 ? <Empty title="No IMEIs reserved for orders" /> : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>IMEI</th><th style={th}>Product / Color</th><th style={th}>Order Code</th><th style={th}>Customer</th><th style={th}>Market</th><th style={th}>Progress</th><th style={th}></th></tr></thead>
                <tbody>
                  {reserved.map((i) => (
                    <tr key={i.imeiSerial}>
                      <td style={td}>
                        <div className="mono">{i.imeiSerial}</div>
                        {i.remark && (
                          <div title={i.remark} style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {i.remark}
                          </div>
                        )}
                      </td>
                      <td style={td}>{i.variant?.modelName} · {i.variant?.color}</td>
                      <td style={{ ...td, fontWeight: 700 }} className="mono">{i.order?.orderCode || "—"}</td>
                      <td style={td}>{i.order ? `${i.order.customerName}${i.order.customerSocialHandle ? ` (${i.order.customerSocialHandle})` : ""}` : "—"}</td>
                      <td style={td}>{i.order?.marketCode || "—"}</td>
                      <td style={td}><StatusPill status={i.status} meta={STATUS_META} /></td>
                      <td style={td}>
                        {canOperate && i.status === "RESERVED" && <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "UNASSIGN")}>Unassign / Return to shelf</ActionBtn>}
                        {canSetStatus && <button onClick={() => setStatusTarget(i)} style={{ ...btnGhost, marginLeft: 6 }}>Set status</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {showAdd && <AddDeviceModal variants={variants} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(); }} />}
      {showBulk && <BulkImportModal onClose={() => setShowBulk(false)} onImported={() => { setShowBulk(false); load(); }} />}
      {deleteTarget && (
        <ConfirmModal
          title="Delete this device?"
          message={
            <>
              This will permanently remove <strong>{deleteTarget.variant?.modelName || deleteTarget.imeiSerial}</strong> (<span className="mono">{deleteTarget.imeiSerial}</span>) from Inventory. This cannot be undone.
              {deleteError && <div style={{ color: "var(--danger)", marginTop: 10 }}>{deleteError}</div>}
            </>
          }
          confirmLabel="Delete device"
          busy={deleting}
          onConfirm={confirmDeleteDevice}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {statusTarget && (
        <SetStatusModal item={statusTarget} onClose={() => setStatusTarget(null)} onSaved={() => { setStatusTarget(null); load(); }} />
      )}
    </div>
  );
}

function SetStatusModal({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(item.status && SET_STATUS_OPTIONS.some((o) => o.value === item.status) ? item.status : "IN_STOCK");
  const [remark, setRemark] = useState(item.remark || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const remarkRequired = status === "MISSING" || status === "WHOLESALE";

  async function submit() {
    if (remarkRequired && !remark.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/inventory/${item.imeiSerial}/set-status`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, remark }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* non-JSON error response */ }
      if (!res.ok) { setError(data.error || `Failed to update status (HTTP ${res.status}).`); return; }
      onSaved();
    } catch (err: any) {
      setError(err?.message || "Network error — failed to update status.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title="Set Status">
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
        <span className="mono">{item.imeiSerial}</span> — {item.variant?.modelName || "Unknown model"}
      </div>
      <Field label="Status">
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
          {SET_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <div style={{ height: 10 }} />
      <Field label={`Remark${remarkRequired ? " (required)" : " (optional)"}`}>
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          rows={3}
          placeholder={remarkRequired ? "e.g. Last seen at Live Room #2, unaccounted for after Aug 20 stocktake" : "Optional note"}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </Field>
      {remarkRequired && !remark.trim() && (
        <div style={{ fontSize: 12, color: "var(--warn)", marginTop: 8 }}>A remark is required before you can save this status.</div>
      )}
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button
          onClick={submit}
          disabled={submitting || (remarkRequired && !remark.trim())}
          style={{ ...btnPrimary, opacity: submitting || (remarkRequired && !remark.trim()) ? 0.5 : 1, cursor: submitting || (remarkRequired && !remark.trim()) ? "not-allowed" : "pointer" }}
        >
          {submitting ? "Saving…" : "Save status"}
        </button>
      </div>
    </ModalShell>
  );
}

function ActionBtn({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} style={{ ...btnGhost, marginRight: 6, opacity: busy ? 0.4 : 1 }}>
      {busy ? "…" : children}
    </button>
  );
}

function AddDeviceModal({ variants, onClose, onCreated }: { variants: Variant[]; onClose: () => void; onCreated: () => void }) {
  const [variantId, setVariantId] = useState(variants[0]?.variantId || "");
  const [imeiSerial, setImei] = useState("");
  const [battery, setBattery] = useState(98);
  const [cosmetic, setCosmetic] = useState("99%");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<VariantDraft>({ sku: "", brand: BRANDS[0], modelName: "", storage: "", color: "", price: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleCreate(query: string) {
    setDraft({ sku: "", brand: BRANDS[0], modelName: query, storage: "", color: "", price: 0 });
    setCreating(true);
  }

  async function saveNewVariant() {
    if (!draft.sku.trim() || !draft.modelName.trim() || !draft.storage.trim() || !draft.color.trim()) return;
    const res = await fetch("/api/pricebook", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: draft.sku, brand: draft.brand, modelGroup: draft.modelName, storage: draft.storage, color: draft.color, price: draft.price }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Failed to create model."); return; }
    setVariantId(data.sku);
    setCreating(false);
    // refresh local variant list so the combobox shows the new SKU
    variants.unshift({ variantId: data.sku, modelName: `${draft.modelName} ${draft.storage}`.trim(), color: draft.color, sellingPriceNtd: String(draft.price) });
  }

  async function submit() {
    if (!imeiSerial.trim()) return;
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/inventory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imeiSerial: imeiSerial.trim(), variantId, batteryHealth: battery, cosmeticCondition: cosmetic }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to add device."); return; }
    onCreated();
  }

  return (
    <ModalShell onClose={onClose} title="Add Single Device">
      <Field label="Model / Color (type to search, or create a brand-new model)">
        <SearchCombobox
          options={variants.map((p) => ({ ...p, __key: p.variantId }))}
          value={variantId}
          onSelect={(v) => { setVariantId(v); setCreating(false); }}
          placeholder="e.g. iPhone 15 Pro 128GB Blue"
          searchText={(p) => `${p.modelName} ${p.color}`}
          renderLabel={(p) => `${p.modelName} — ${p.color || "—"} (${fmt(p.sellingPriceNtd)})`}
          allowCreate
          onCreate={handleCreate}
        />
      </Field>
      {creating && (
        <>
          <VariantDraftFields draft={draft} setDraft={setDraft} />
          <button onClick={saveNewVariant} style={{ ...btnPrimary, width: "100%", marginTop: 10 }}>✓ Save new model to Price Book</button>
        </>
      )}
      <div style={{ height: 10 }} />
      <Field label="IMEI"><input value={imeiSerial} onChange={(e) => setImei(e.target.value)} placeholder="15-digit IMEI" style={inputStyle} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <Field label="Battery %"><input type="number" value={battery} onChange={(e) => setBattery(Number(e.target.value))} style={inputStyle} /></Field>
        <Field label="Cosmetic condition"><input value={cosmetic} onChange={(e) => setCosmetic(e.target.value)} style={inputStyle} /></Field>
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button disabled={creating || submitting || !imeiSerial.trim() || !variantId} onClick={submit} style={{ ...btnPrimary, opacity: creating ? 0.5 : 1 }}>
          {submitting ? "Adding…" : "Add device"}
        </button>
      </div>
    </ModalShell>
  );
}

function BulkImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState("356938035643809, IP14PM-256-BLK, 98, Like new");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);

  async function submit() {
    setSubmitting(true);
    setError("");
    setResult(null);
    const res = await fetch("/api/inventory/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: text }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Bulk import failed."); return; }
    setResult({ imported: data.imported, errors: data.errors || [] });
  }

  return (
    <ModalShell onClose={onClose} title="Bulk Import Devices">
      <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 10 }}>One device per line: IMEI, VariantSKU, Battery%, Cosmetic — paste one row per line (simulating an Excel upload).</div>
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
