"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusPill, SHIPMENT_META, Card, Empty, ModalShell, Field, inputStyle, btnPrimary, btnGhost, tableStyle, th, td } from "@/components/ui";
import SearchCombobox from "@/components/SearchCombobox";

const MARKETS = ["VN", "ID", "TH", "PH"];
const CHANNELS = ["TikTok", "Facebook", "Line"];
const CARRIERS = [{ code: "711", name: "7-Eleven" }, { code: "FAMILY", name: "FamilyMart" }, { code: "TCAT", name: "T-Cat" }];
const PAYMENT_TYPES = [
  { code: "COD", label: "Full Cash-on-Delivery" },
  { code: "DOWNPAYMENT_COD", label: "Downpayment + COD balance" },
  { code: "INSTALLMENT", label: "Installment plan" },
];
const INSTALLMENT_TERMS = [3, 6, 9, 12];
const CANCEL_REASONS = ["Customer changed mind", "Customer wants a different model", "Downpayment deadline expired", "Suspected fake / test order"];
const NOT_CANCELLABLE = ["CANCELLED", "DELIVERY_FAILED", "RETURNED", "DELIVERED"];

type OrderItem = { itemId: string; variantId: string; imeiSerial: string; itemPriceNtd: string };
type OrderAccessory = { accessoryRowId: string; variantId: string; accessoryName: string };
type Order = {
  orderId: string; orderCode: string; marketCode: string; salesChannel: string; customerName: string;
  customerSocialHandle: string | null; customerPhone: string | null; postalCode: string | null; shippingAddress: string;
  carrierService: string; paymentType: string; totalInvoiceAmountNtd: string; downpaymentReceivedNtd: string;
  installmentTermMonths: number | null; shipmentStatus: string; items: OrderItem[]; accessories: OrderAccessory[];
};
type Variant = { variantId: string; brand: string | null; modelGroup: string; modelName: string; color: string | null; sellingPriceNtd: string };
type AccessoryOpt = { variantId: string; modelName: string; compatibleModel: string | null; stockQuantity: number };

const fmt = (n: string | number) => "$" + Math.round(Number(n)).toLocaleString("en-US") + " NTD";

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<null | { mode: "create" } | { mode: "edit"; order: Order }>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [confirmReturn, setConfirmReturn] = useState<Order | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/orders");
    const data = await res.json();
    setOrders(data.orders || []);
    setRole(data.role || "");
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const canCreate = ["ADMIN", "MANAGER", "CS", "STREAMER"].includes(role);
  const canEdit = canCreate;

  async function clickEdit(order: Order) {
    if (order.shipmentStatus === "PACKED") { setConfirmReturn(order); return; }
    setFormMode({ mode: "edit", order });
  }

  async function confirmReturnToInspection(order: Order) {
    await fetch(`/api/orders/${order.orderId}/return-to-inspection`, { method: "POST" });
    setConfirmReturn(null);
    setFormMode({ mode: "edit", order: { ...order, shipmentStatus: "PENDING_PACK" } });
    load();
  }

  async function confirmCancel(order: Order, reason: string) {
    const res = await fetch(`/api/orders/${order.orderId}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Failed to cancel."); setCancelling(null); return; }
    setCancelling(null);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="disp text-2xl font-bold">Multi-channel Orders</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Searchable phone picker, edit guard rules by status, full audit trail on every change.</p>
        </div>
        {canCreate && <button onClick={() => setFormMode({ mode: "create" })} style={btnPrimary}>+ New Order</button>}
      </div>

      {error && <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</div>}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
        ) : orders.length === 0 ? (
          <Empty title="No orders yet" sub="Create the first order to see the workflow in action." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Order Code</th><th style={th}>Channel</th><th style={th}>Items</th>
                  <th style={th}>Customer</th><th style={th}>Carrier</th><th style={th}>Payment</th>
                  <th style={th}>Total</th><th style={th}>Status</th><th style={th}>Tasks</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const editable = canEdit && ["PENDING_PACK", "PACKED"].includes(o.shipmentStatus);
                  const cancellable = canEdit && !NOT_CANCELLABLE.includes(o.shipmentStatus);
                  return (
                    <tr key={o.orderId}>
                      <td style={{ ...td, fontWeight: 700 }} className="mono">{o.orderCode}</td>
                      <td style={td}>{o.salesChannel}</td>
                      <td style={td}>{o.items.length} phone{o.items.length > 1 ? "s" : ""}{o.accessories.length ? ` + ${o.accessories.length} acc.` : ""}</td>
                      <td style={td}>{o.customerName}</td>
                      <td style={td}>{CARRIERS.find((c) => c.code === o.carrierService)?.name}</td>
                      <td style={td}>{PAYMENT_TYPES.find((p) => p.code === o.paymentType)?.label.split(" ")[0]}</td>
                      <td style={{ ...td, fontWeight: 600 }} className="mono">{fmt(o.totalInvoiceAmountNtd)}</td>
                      <td style={td}><StatusPill status={o.shipmentStatus} meta={SHIPMENT_META} /></td>
                      <td style={td}>
                        {editable && <button onClick={() => clickEdit(o)} style={{ ...btnGhost, marginRight: 6 }}>✎ Edit</button>}
                        {cancellable && <button onClick={() => setCancelling(o)} style={{ ...btnGhost, color: "var(--danger)" }}>Cancel</button>}
                        {!editable && !cancellable && <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>Locked</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {formMode && (
        <OrderFormModal
          mode={formMode.mode}
          order={formMode.mode === "edit" ? formMode.order : undefined}
          role={role}
          onClose={() => setFormMode(null)}
          onSaved={() => { setFormMode(null); load(); }}
        />
      )}
      {cancelling && <CancelOrderModal order={cancelling} onClose={() => setCancelling(null)} onConfirm={confirmCancel} />}
      {confirmReturn && (
        <ModalShell onClose={() => setConfirmReturn(null)} title={`Return parcel to inspection — ${confirmReturn.orderCode}`}>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
            This order is already <strong>Packed</strong>. Editing it (swapping a phone/IMEI or changing accessories) requires pulling the parcel back to Pending Pack for re-inspection. Continue?
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setConfirmReturn(null)} style={btnGhost}>Cancel</button>
            <button onClick={() => confirmReturnToInspection(confirmReturn)} style={btnPrimary}>Yes, pull back &amp; edit</button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function CancelOrderModal({ order, onClose, onConfirm }: { order: Order; onClose: () => void; onConfirm: (o: Order, reason: string) => void }) {
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const willFail = order.shipmentStatus === "SHIPPED";
  return (
    <ModalShell onClose={onClose} title={`Cancel order ${order.orderCode}`}>
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 14 }}>
        {willFail ? "This order has already shipped. Cancelling now records it as a refused/failed delivery." : "The reserved IMEI will return to IN_STOCK immediately and any reserved accessories will be restocked."}
      </div>
      <Field label="Cancellation reason (required)">
        <select value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle}>
          {CANCEL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>Keep order</button>
        <button onClick={() => onConfirm(order, reason)} style={{ ...btnPrimary, background: "var(--danger)" }}>
          {willFail ? "Mark as delivery failed" : "Confirm cancellation"}
        </button>
      </div>
    </ModalShell>
  );
}

type Row = { rid: string; variantId: string; price: number; mode: "keep" | "auto" | "manual"; keepImei?: string; manualImei?: string; overridden: boolean };

function OrderFormModal({
  mode, order, role, onClose, onSaved,
}: { mode: "create" | "edit"; order?: Order; role: string; onClose: () => void; onSaved: () => void }) {
  const isEdit = mode === "edit";
  const [variants, setVariants] = useState<Variant[]>([]);
  const [accessories, setAccessories] = useState<AccessoryOpt[]>([]);
  const [unitsByVariant, setUnitsByVariant] = useState<Record<string, { imeiSerial: string; batteryHealth: number | null; cosmeticCondition: string | null }[]>>({});
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  const [marketCode, setMarketCode] = useState(order?.marketCode || "VN");
  const [salesChannel, setSalesChannel] = useState(order?.salesChannel || CHANNELS[0]);
  const [customerName, setCustomerName] = useState(order?.customerName || "");
  const [customerSocialHandle, setHandle] = useState(order?.customerSocialHandle || "");
  const [customerPhone, setPhone] = useState(order?.customerPhone || "");
  const [shippingAddress, setAddress] = useState(order?.shippingAddress || "");
  const [carrierService, setCarrier] = useState(order?.carrierService || CARRIERS[0].code);
  const [paymentType, setPaymentType] = useState(order?.paymentType || "COD");
  const [downpayment, setDownpayment] = useState(Number(order?.downpaymentReceivedNtd) || 0);
  const [installmentTerm, setInstallmentTerm] = useState(order?.installmentTermMonths || 3);

  const [rows, setRows] = useState<Row[]>([]);
  const [checkedAcc, setCheckedAcc] = useState<Record<string, boolean>>({});
  const [approvedByUserId, setApprovedByUserId] = useState<string | null>(null);
  const [approvedByName, setApprovedByName] = useState<string | null>(null);
  const [approvalTargetRid, setApprovalTargetRid] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canEditPriceDirectly = role === "ADMIN" || role === "MANAGER";

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/orders/catalog");
      const data = await res.json();
      const vs: Variant[] = data.variants || [];
      setVariants(vs);
      setAccessories(data.accessories || []);
      if (isEdit && order) {
        setRows(order.items.map((it) => ({ rid: it.itemId, variantId: it.variantId, price: Number(it.itemPriceNtd), mode: "keep", keepImei: it.imeiSerial, overridden: false })));
        const acc: Record<string, boolean> = {};
        order.accessories.forEach((a) => { acc[a.variantId] = true; });
        setCheckedAcc(acc);
      } else if (vs[0]) {
        setRows([{ rid: crypto.randomUUID(), variantId: vs[0].variantId, price: Number(vs[0].sellingPriceNtd), mode: "auto", overridden: false }]);
      }
      setCatalogLoaded(true);
    })();
  }, []);

  async function loadUnits(variantId: string) {
    if (unitsByVariant[variantId]) return;
    const res = await fetch(`/api/orders/available-units?variantId=${encodeURIComponent(variantId)}`);
    const data = await res.json();
    setUnitsByVariant((s) => ({ ...s, [variantId]: data.units || [] }));
  }

  function variantOf(id: string) { return variants.find((v) => v.variantId === id); }

  function addRow() {
    if (!variants[0]) return;
    setRows((r) => [...r, { rid: crypto.randomUUID(), variantId: variants[0].variantId, price: Number(variants[0].sellingPriceNtd), mode: "auto", overridden: false }]);
  }
  function removeRow(rid: string) { setRows((r) => r.filter((x) => x.rid !== rid)); }
  function updateRow(rid: string, patch: Partial<Row>) { setRows((r) => r.map((x) => (x.rid === rid ? { ...x, ...patch } : x))); }
  function onVariantChange(rid: string, variantId: string) {
    const v = variantOf(variantId);
    updateRow(rid, { variantId, price: v ? Number(v.sellingPriceNtd) : 0, overridden: false, manualImei: undefined, keepImei: undefined, mode: "auto" });
    loadUnits(variantId);
  }
  function requestOverride(rid: string) {
    if (canEditPriceDirectly) updateRow(rid, { overridden: true });
    else setApprovalTargetRid(rid);
  }
  function swapImei(rid: string) { updateRow(rid, { mode: "auto", keepImei: undefined, manualImei: undefined }); }

  const total = rows.reduce((s, r) => s + Number(r.price || 0), 0);
  const modelGroups = [...new Set(rows.map((r) => variantOf(r.variantId)?.modelGroup).filter(Boolean))];
  const compatibleAccessories = accessories.filter((a) => a.compatibleModel === null || modelGroups.includes(a.compatibleModel));

  async function submit() {
    setSubmitting(true);
    setError("");
    const payload = {
      marketCode, salesChannel, customerName, customerSocialHandle: customerSocialHandle || null,
      customerPhone: customerPhone || null, shippingAddress, carrierService, paymentType,
      downpayment, installmentTerm: paymentType === "INSTALLMENT" ? installmentTerm : null,
      items: rows.map((r) => ({ variantId: r.variantId, price: r.price, mode: r.mode, keepImei: r.keepImei, manualImei: r.manualImei, imeiMode: r.mode === "manual" ? "manual" : "auto" })),
      accessoryVariantIds: Object.keys(checkedAcc).filter((k) => checkedAcc[k]),
      priceOverridden: rows.some((r) => r.overridden),
      approvedByUserId,
    };
    const url = isEdit ? `/api/orders/${order!.orderId}/edit` : "/api/orders";
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to save order."); return; }
    onSaved();
  }

  const allRowsReady = rows.every((r) => r.mode === "keep" || (r.mode === "manual" ? !!r.manualImei : true));

  return (
    <ModalShell onClose={onClose} title={isEdit ? `Edit order ${order?.orderCode}` : "New Order Intake — Multi-item"} wide>
      {!catalogLoaded ? (
        <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading catalog…</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <Field label="Market">
              <select value={marketCode} onChange={(e) => setMarketCode(e.target.value)} style={inputStyle}>
                {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Sales channel">
              <select value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)} style={inputStyle}>
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Customer name"><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={inputStyle} /></Field>
            <Field label="FB / Line / TikTok handle"><input value={customerSocialHandle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} /></Field>
            <Field label="Phone number"><input value={customerPhone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /></Field>
            <Field label="Carrier service"><select value={carrierService} onChange={(e) => setCarrier(e.target.value)} style={inputStyle}>{CARRIERS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
            <Field label="Shipping address" full><input value={shippingAddress} onChange={(e) => setAddress(e.target.value)} style={inputStyle} /></Field>
            <Field label="Payment type"><select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} style={inputStyle}>{PAYMENT_TYPES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</select></Field>
            {paymentType === "DOWNPAYMENT_COD" && <Field label="Downpayment received (NTD)"><input type="number" value={downpayment} onChange={(e) => setDownpayment(Number(e.target.value))} style={inputStyle} /></Field>}
            {paymentType === "INSTALLMENT" && (
              <>
                <Field label="Upfront downpayment (NTD)"><input type="number" value={downpayment} onChange={(e) => setDownpayment(Number(e.target.value))} style={inputStyle} /></Field>
                <Field label="Remaining balance term"><select value={installmentTerm} onChange={(e) => setInstallmentTerm(Number(e.target.value))} style={inputStyle}>{INSTALLMENT_TERMS.map((t) => <option key={t} value={t}>{t} months</option>)}</select></Field>
              </>
            )}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", justifyContent: "space-between" }}>
            <span>Phones on this order ({rows.length})</span>
            <button onClick={addRow} style={btnGhost}>+ Add phone to order</button>
          </div>

          {rows.map((row, idx) => {
            const v = variantOf(row.variantId);
            const units = unitsByVariant[row.variantId] || [];
            return (
              <Card key={row.rid} className="mb-2.5" style={{ padding: 12, background: "var(--paper)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    Phone #{idx + 1}{row.mode === "keep" && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--ok)" }}>· keeping current IMEI</span>}
                  </span>
                  {rows.length > 1 && <button onClick={() => removeRow(row.rid)} style={{ border: "none", background: "none", color: "var(--danger)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Remove ✕</button>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Model / Color (type to search)">
                    <SearchCombobox
                      options={variants.map((p) => ({ ...p, __key: p.variantId }))}
                      value={row.variantId}
                      onSelect={(v) => onVariantChange(row.rid, v)}
                      placeholder="e.g. 14 Pro Black, S23 Green..."
                      searchText={(p) => `${p.modelName} ${p.color} ${p.sellingPriceNtd}`}
                      renderLabel={(p) => `${p.modelName} — ${p.color || "—"} (${fmt(p.sellingPriceNtd)})`}
                    />
                  </Field>
                  <Field label="IMEI assignment">
                    {row.mode === "keep" ? (
                      <button onClick={() => swapImei(row.rid)} style={{ ...btnGhost, width: "100%" }}>🔄 Swap this device</button>
                    ) : (
                      <select value={row.mode} onChange={(e) => { const m = e.target.value as Row["mode"]; updateRow(row.rid, { mode: m, manualImei: undefined }); if (m === "manual") loadUnits(row.variantId); }} style={inputStyle}>
                        <option value="auto">Auto — first IN_STOCK unit</option>
                        <option value="manual">Manual — search IMEI</option>
                      </select>
                    )}
                  </Field>
                </div>
                {row.mode === "manual" && (
                  <div style={{ marginTop: 10 }}>
                    <Field label={`Type last digits of IMEI (${units.length} available)`}>
                      <SearchCombobox
                        options={units.map((u) => ({ ...u, __key: u.imeiSerial }))}
                        value={row.manualImei || ""}
                        onSelect={(v) => updateRow(row.rid, { manualImei: v })}
                        placeholder="e.g. 8842 or 0042"
                        searchText={(u) => u.imeiSerial}
                        renderLabel={(u) => `${u.imeiSerial} · Battery ${u.batteryHealth ?? "—"}% · ${u.cosmeticCondition || "—"}`}
                      />
                    </Field>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, padding: 10, borderRadius: 8, background: "#fff", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)" }}>PRICE</span>
                  <input
                    type="number" value={row.price} disabled={!row.overridden && !canEditPriceDirectly}
                    onChange={(e) => updateRow(row.rid, { price: Number(e.target.value) })}
                    style={{ ...inputStyle, maxWidth: 160, fontWeight: 700, background: row.overridden || canEditPriceDirectly ? "#fff" : "var(--gray-bg)" }}
                  />
                  <span className="mono" style={{ color: "var(--text-faint)", fontSize: 12 }}>Base: {v ? fmt(v.sellingPriceNtd) : "—"}</span>
                  {!row.overridden && !canEditPriceDirectly && <button onClick={() => requestOverride(row.rid)} style={btnGhost}>Override…</button>}
                  {row.overridden && approvedByName && !canEditPriceDirectly && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ok)" }}>✓ {approvedByName}</span>}
                </div>
                {row.mode === "auto" && units.length === 0 && unitsByVariant[row.variantId] && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>No IN_STOCK unit available for this SKU.</div>
                )}
              </Card>
            );
          })}

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", margin: "16px 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Accessory checklist</div>
          <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginBottom: 8 }}>Auto-filtered to fit {modelGroups.join(" + ") || "selected phones"}.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {compatibleAccessories.map((a) => (
              <label key={a.variantId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", opacity: a.stockQuantity <= 0 && !checkedAcc[a.variantId] ? 0.5 : 1 }}>
                <input type="checkbox" disabled={a.stockQuantity <= 0 && !checkedAcc[a.variantId]} checked={!!checkedAcc[a.variantId]} onChange={(e) => setCheckedAcc((c) => ({ ...c, [a.variantId]: e.target.checked }))} />
                {a.modelName} <span className="mono" style={{ color: "var(--text-faint)", fontSize: 11 }}>({a.stockQuantity} in stock)</span>
              </label>
            ))}
          </div>

          <div style={{ padding: 14, borderRadius: 8, background: "var(--accent-bg)", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-dark)" }}>Order total (locked)</span>
            <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-dark)" }}>{fmt(total)}</span>
          </div>

          {error && <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button disabled={!allRowsReady || submitting} onClick={submit} style={{ ...btnPrimary, opacity: allRowsReady ? 1 : 0.5 }}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Confirm & Lock Price"}
            </button>
          </div>

          {approvalTargetRid && (
            <AdminApprovalModal
              onClose={() => setApprovalTargetRid(null)}
              onApprove={(userId, name) => { updateRow(approvalTargetRid, { overridden: true }); setApprovedByUserId(userId); setApprovedByName(name); setApprovalTargetRid(null); }}
            />
          )}
        </>
      )}
    </ModalShell>
  );
}

function AdminApprovalModal({ onClose, onApprove }: { onClose: () => void; onApprove: (userId: string, name: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function approve() {
    setSubmitting(true);
    setErr("");
    const res = await fetch("/api/orders/approve-override", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setErr(data.error || "Invalid credentials."); return; }
    onApprove(data.approverUserId, data.approverName);
  }

  return (
    <ModalShell onClose={onClose} title="Admin / Manager Approval Required">
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 14 }}>
        Changing the retail price requires Admin or Manager credentials. This action is written to the price change log and order log.
      </div>
      <Field label="Username"><input value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} /></Field>
      <div style={{ height: 10 }} />
      <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} /></Field>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={approve} disabled={submitting || !username || !password} style={btnPrimary}>{submitting ? "Checking…" : "Approve override"}</button>
      </div>
    </ModalShell>
  );
}
