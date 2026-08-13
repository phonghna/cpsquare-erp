"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusPill, SHIPMENT_META, Card, Empty, inputStyle, btnPrimary, btnGhost, tableStyle, th, td } from "@/components/ui";

type Order = {
  orderId: string;
  orderCode: string;
  marketCode: string;
  customerName: string;
  customerSocialHandle: string | null;
  carrierService: string;
  trackingNumber: string | null;
  shipmentStatus: string;
  paymentType: string;
  shippedAt: string | null;
  createdAt: string;
};

type DateRangeKey = "ALL" | "TODAY" | "7D" | "MONTH" | "CUSTOM";

const CARRIERS = [
  { code: "711", name: "7-Eleven" },
  { code: "FAMILY", name: "FamilyMart" },
  { code: "TCAT", name: "T-Cat" },
];

export default function TrackingPage() {
  const [awaiting, setAwaiting] = useState<Order[]>([]);
  const [shipped, setShipped] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRangeKey>("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const res = await fetch("/api/tracking");
    const data = await res.json();
    setAwaiting(data.awaitingTracking || []);
    setShipped(data.shippedOrDelivered || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function matchesSearch(o: Order) {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      o.orderCode.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      (o.customerSocialHandle || "").toLowerCase().includes(q) ||
      (o.trackingNumber || "").toLowerCase().includes(q)
    );
  }
  function matchesCarrier(o: Order) {
    return carrierFilter === "ALL" || o.carrierService === carrierFilter;
  }
  function matchesStatus(o: Order) {
    return statusFilter === "ALL" || o.shipmentStatus === statusFilter;
  }

  function inDateRange(o: Order) {
    if (range === "ALL") return true;
    const ref = o.shippedAt || o.createdAt;
    if (!ref) return false;
    const d = new Date(ref);
    const now = new Date();
    if (range === "TODAY") return d.toDateString() === now.toDateString();
    if (range === "7D") {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
      return d >= cutoff && d <= now;
    }
    if (range === "MONTH") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (range === "CUSTOM") {
      if (!customFrom && !customTo) return true;
      const from = customFrom ? new Date(customFrom) : null;
      const to = customTo ? new Date(customTo + "T23:59:59") : null;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }
    return true;
  }

  const filteredAwaiting = useMemo(
    () => awaiting.filter((o) => matchesSearch(o) && matchesCarrier(o) && matchesStatus(o)),
    [awaiting, search, carrierFilter, statusFilter]
  );
  const filteredShipped = useMemo(
    () => shipped.filter((o) => matchesSearch(o) && matchesCarrier(o) && matchesStatus(o) && inDateRange(o)).slice(0, 20),
    [shipped, search, range, customFrom, customTo, carrierFilter, statusFilter]
  );

  async function saveTracking(orderId: string) {
    const trackingNumber = (trackingInputs[orderId] || "").trim();
    if (!trackingNumber) return;
    setRowBusy(orderId);
    setError("");
    const res = await fetch(`/api/tracking/${orderId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumber }),
    });
    const data = await res.json();
    setRowBusy(null);
    if (!res.ok) { setError(data.error || "Failed to save."); return; }
    load();
  }

  async function markDelivered(orderId: string) {
    setRowBusy(orderId);
    setError("");
    const res = await fetch(`/api/tracking/${orderId}/deliver`, { method: "POST" });
    const data = await res.json();
    setRowBusy(null);
    if (!res.ok) { setError(data.error || "Failed to mark delivered."); return; }
    load();
  }

  async function bulkAssign() {
    setBulkBusy(true);
    setError("");
    const res = await fetch("/api/tracking/bulk-assign", { method: "POST" });
    const data = await res.json();
    setBulkBusy(false);
    if (!res.ok) { setError(data.error || "Bulk assign failed."); return; }
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-5 flex-wrap gap-3">
        <div>
          <h1 className="disp text-2xl font-bold">Shipment Tracking</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Universal search, date-range filters, and bulk or manual tracking-number updates.</p>
        </div>
        <button onClick={bulkAssign} disabled={bulkBusy} style={{ ...btnPrimary, opacity: bulkBusy ? 0.6 : 1 }}>
          {bulkBusy ? "Importing…" : "⭱ Simulate bulk tracking import"}
        </button>
      </div>

      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="Search tracking #, order code, or customer/handle..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, maxWidth: 320 }} />
          <select value={range} onChange={(e) => setRange(e.target.value as DateRangeKey)} style={{ ...inputStyle, maxWidth: 160 }}>
            <option value="ALL">All time</option>
            <option value="TODAY">Today</option>
            <option value="7D">Last 7 days</option>
            <option value="MONTH">This month</option>
            <option value="CUSTOM">Custom range</option>
          </select>
          {range === "CUSTOM" && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ ...inputStyle, maxWidth: 150 }} />
              <span style={{ color: "var(--text-faint)" }}>→</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ ...inputStyle, maxWidth: 150 }} />
            </>
          )}
          <select value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)} style={{ ...inputStyle, maxWidth: 160 }}>
            <option value="ALL">All carriers</option>
            {CARRIERS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, maxWidth: 180 }}>
            <option value="ALL">All statuses</option>
            {Object.keys(SHIPMENT_META).map((s) => <option key={s} value={s}>{SHIPMENT_META[s].label}</option>)}
          </select>
        </div>
      </Card>

      {error && <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</div>}

      {loading ? (
        <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
      ) : (
        <>
          <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
            <div style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid var(--border)" }}>
              Awaiting tracking number ({filteredAwaiting.length})
            </div>
            {filteredAwaiting.length === 0 ? (
              <Empty title="Nothing to track yet" />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr><th style={th}>Order</th><th style={th}>Customer</th><th style={th}>Carrier</th><th style={th}>Tracking number</th><th style={th}></th></tr>
                  </thead>
                  <tbody>
                    {filteredAwaiting.map((o) => (
                      <tr key={o.orderId}>
                        <td style={td} className="mono">{o.orderCode}</td>
                        <td style={td}>{o.customerName}</td>
                        <td style={td}>{CARRIERS.find((c) => c.code === o.carrierService)?.name || o.carrierService}</td>
                        <td style={td}>
                          <input
                            placeholder="Scan or type..."
                            value={trackingInputs[o.orderId] ?? ""}
                            onChange={(e) => setTrackingInputs((s) => ({ ...s, [o.orderId]: e.target.value }))}
                            style={{ ...inputStyle, maxWidth: 180 }}
                          />
                        </td>
                        <td style={td}>
                          <button onClick={() => saveTracking(o.orderId)} disabled={rowBusy === o.orderId || !(trackingInputs[o.orderId] || "").trim()} style={{ ...btnGhost, opacity: rowBusy === o.orderId ? 0.5 : 1 }}>
                            {rowBusy === o.orderId ? "…" : "Save → SHIPPED"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid var(--border)" }}>
              Shipped / Delivered / Other ({filteredShipped.length})
            </div>
            {filteredShipped.length === 0 ? (
              <Empty title="No matching orders" />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr><th style={th}>Order</th><th style={th}>Customer</th><th style={th}>Tracking #</th><th style={th}>Status</th><th style={th}></th></tr>
                  </thead>
                  <tbody>
                    {filteredShipped.map((o) => (
                      <tr key={o.orderId}>
                        <td style={td} className="mono">{o.orderCode}</td>
                        <td style={td}>{o.customerName} <span style={{ color: "var(--text-faint)" }}>({o.customerSocialHandle})</span></td>
                        <td style={td} className="mono">{o.trackingNumber || "—"}</td>
                        <td style={td}><StatusPill status={o.shipmentStatus} meta={SHIPMENT_META} /></td>
                        <td style={td}>
                          {o.shipmentStatus === "SHIPPED" && (
                            <button onClick={() => markDelivered(o.orderId)} disabled={rowBusy === o.orderId} style={{ ...btnGhost, opacity: rowBusy === o.orderId ? 0.5 : 1 }}>
                              {rowBusy === o.orderId ? "…" : "Mark delivered"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
