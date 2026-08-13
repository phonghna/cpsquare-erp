"use client";

import { useEffect, useState } from "react";

type Order = {
  orderId: string;
  orderCode: string;
  marketCode: string;
  salesChannel: string;
  customerName: string;
  totalInvoiceAmountNtd: string;
  shipmentStatus: string;
};

const MARKETS = ["VN", "ID", "TH", "PH"];
const CARRIERS = [{ code: "711", name: "7-Eleven" }, { code: "FAMILY", name: "FamilyMart" }, { code: "TCAT", name: "T-Cat" }];
const PAYMENT_TYPES = [
  { code: "COD", label: "Full Cash-on-Delivery" },
  { code: "DOWNPAYMENT_COD", label: "Downpayment + COD balance" },
  { code: "INSTALLMENT", label: "Installment plan" },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/orders");
    const data = await res.json();
    setOrders(data.orders || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const fmt = (n: string) => "$" + Math.round(Number(n)).toLocaleString("en-US") + " NTD";

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="font-disp text-2xl font-bold">Multi-channel Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Live data from Neon — IMEI assignment uses a real transaction lock.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm">
          + New Order
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No orders yet — create the first one.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="p-3">Order Code</th><th className="p-3">Channel</th><th className="p-3">Customer</th>
                <th className="p-3">Total</th><th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.orderId} className="border-b border-slate-100">
                  <td className="p-3 font-mono font-bold">{o.orderCode}</td>
                  <td className="p-3">{o.salesChannel}</td>
                  <td className="p-3">{o.customerName}</td>
                  <td className="p-3 font-mono">{fmt(o.totalInvoiceAmountNtd)}</td>
                  <td className="p-3">{o.shipmentStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <NewOrderModal
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); load(); }}
          error={error}
          setError={setError}
        />
      )}
    </div>
  );
}

function NewOrderModal({
  onClose, onCreated, error, setError,
}: { onClose: () => void; onCreated: () => void; error: string; setError: (s: string) => void }) {
  const [marketCode, setMarketCode] = useState("VN");
  const [salesChannel, setSalesChannel] = useState("TikTok");
  const [variantId, setVariantId] = useState("IP14PM-256-BLK");
  const [price, setPrice] = useState(38900);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [carrierService, setCarrierService] = useState("711");
  const [paymentType, setPaymentType] = useState("COD");
  const [downpayment, setDownpayment] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketCode, salesChannel, variantId, price, customerName, customerPhone,
        postalCode, shippingAddress, carrierService, paymentType, downpayment,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to create order."); return; }
    onCreated();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="font-disp font-bold text-lg mb-4">New Order</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Market">
            <select value={marketCode} onChange={(e) => setMarketCode(e.target.value)} className="input">
              {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Sales channel">
            <select value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)} className="input">
              {["TikTok", "Facebook", "Line"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="SKU (variant_id)" full>
            <input value={variantId} onChange={(e) => setVariantId(e.target.value)} className="input" />
          </Field>
          <Field label="Price (NTD)">
            <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} className="input" />
          </Field>
          <Field label="Carrier">
            <select value={carrierService} onChange={(e) => setCarrierService(e.target.value)} className="input">
              {CARRIERS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Customer name" full>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input" />
          </Field>
          <Field label="Phone">
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="input" />
          </Field>
          <Field label="Postal code">
            <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="input" />
          </Field>
          <Field label="Shipping address" full>
            <input value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} className="input" />
          </Field>
          <Field label="Payment type" full>
            <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} className="input">
              {PAYMENT_TYPES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
          </Field>
          {paymentType !== "COD" && (
            <Field label="Downpayment (NTD)" full>
              <input type="number" value={downpayment} onChange={(e) => setDownpayment(Number(e.target.value))} className="input" />
            </Field>
          )}
        </div>
        {error && <div className="text-sm text-danger mt-3">{error}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Creating…" : "Confirm & Lock Price"}
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
