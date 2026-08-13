"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusPill, SHIPMENT_META } from "@/components/ui";

type Order = {
  orderId: string;
  orderCode: string;
  marketCode: string;
  customerName: string;
  carrierService: string;
  trackingNumber: string | null;
  shipmentStatus: string;
  paymentType: string;
  shippedAt: string | null;
  createdAt: string;
};

type DateRangeKey = "ALL" | "TODAY" | "7D" | "MONTH" | "CUSTOM";

export default function TrackingPage() {
  const [awaiting, setAwaiting] = useState<Order[]>([]);
  const [shipped, setShipped] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRangeKey>("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
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
      (o.trackingNumber || "").toLowerCase().includes(q)
    );
  }

  function inDateRange(o: Order) {
    if (range === "ALL") return true;
    const ref = o.shippedAt || o.createdAt;
    if (!ref) return false;
    const d = new Date(ref);
    const now = new Date();
    if (range === "TODAY") {
      return d.toDateString() === now.toDateString();
    }
    if (range === "7D") {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
      return d >= cutoff && d <= now;
    }
    if (range === "MONTH") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
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

  const filteredAwaiting = useMemo(() => awaiting.filter(matchesSearch), [awaiting, search]);
  const filteredShipped = useMemo(
    () => shipped.filter((o) => matchesSearch(o) && inDateRange(o)),
    [shipped, search, range, customFrom, customTo]
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

  const RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "TODAY", label: "Today" },
    { key: "7D", label: "7 days" },
    { key: "MONTH", label: "This month" },
    { key: "CUSTOM", label: "Custom" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-disp text-2xl font-bold">Shipment Tracking</h1>
        <p className="text-sm text-slate-500 mt-1">Assign tracking numbers and confirm deliveries.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order code, tracking #, or customer…"
          className="flex-1 min-w-[240px] px-3 py-2 rounded-lg border border-slate-200 text-sm"
        />
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border ${
                range === r.key ? "bg-accent text-white border-accent" : "border-slate-200 text-slate-600"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === "CUSTOM" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-2 py-1.5 rounded-md border border-slate-200 text-xs" />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-2 py-1.5 rounded-md border border-slate-200 text-xs" />
          </div>
        )}
      </div>

      {error && <div className="text-sm text-danger mb-3">{error}</div>}

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-8">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-disp font-bold text-sm">Awaiting Tracking Number ({filteredAwaiting.length})</h2>
              <button
                onClick={bulkAssign}
                disabled={bulkBusy || filteredAwaiting.length === 0}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-40"
              >
                {bulkBusy ? "Importing…" : "Bulk import tracking numbers"}
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              {filteredAwaiting.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">Nothing awaiting a tracking number.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="p-3">Order Code</th><th className="p-3">Market</th><th className="p-3">Customer</th>
                      <th className="p-3">Carrier</th><th className="p-3">Tracking #</th><th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAwaiting.map((o) => (
                      <tr key={o.orderId} className="border-b border-slate-100">
                        <td className="p-3 font-mono font-bold">{o.orderCode}</td>
                        <td className="p-3">{o.marketCode}</td>
                        <td className="p-3">{o.customerName}</td>
                        <td className="p-3">{o.carrierService}</td>
                        <td className="p-3">
                          <input
                            value={trackingInputs[o.orderId] ?? ""}
                            onChange={(e) => setTrackingInputs((s) => ({ ...s, [o.orderId]: e.target.value }))}
                            placeholder="TRK123456"
                            className="px-2 py-1 rounded-md border border-slate-200 text-xs font-mono w-32"
                          />
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => saveTracking(o.orderId)}
                            disabled={rowBusy === o.orderId || !(trackingInputs[o.orderId] || "").trim()}
                            className="px-2.5 py-1 rounded-md bg-accent text-white text-xs font-semibold disabled:opacity-40"
                          >
                            {rowBusy === o.orderId ? "…" : "Save"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section>
            <h2 className="font-disp font-bold text-sm mb-2">Shipped / Delivered ({filteredShipped.length})</h2>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              {filteredShipped.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No results.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="p-3">Order Code</th><th className="p-3">Customer</th><th className="p-3">Tracking #</th>
                      <th className="p-3">Shipped</th><th className="p-3">Status</th><th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShipped.map((o) => (
                      <tr key={o.orderId} className="border-b border-slate-100">
                        <td className="p-3 font-mono font-bold">{o.orderCode}</td>
                        <td className="p-3">{o.customerName}</td>
                        <td className="p-3 font-mono">{o.trackingNumber || "—"}</td>
                        <td className="p-3 text-slate-500">{o.shippedAt ? new Date(o.shippedAt).toLocaleDateString() : "—"}</td>
                        <td className="p-3"><StatusPill status={o.shipmentStatus} meta={SHIPMENT_META} /></td>
                        <td className="p-3">
                          {o.shipmentStatus === "SHIPPED" && (
                            <button
                              onClick={() => markDelivered(o.orderId)}
                              disabled={rowBusy === o.orderId}
                              className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold disabled:opacity-40"
                            >
                              {rowBusy === o.orderId ? "…" : "Mark delivered"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
