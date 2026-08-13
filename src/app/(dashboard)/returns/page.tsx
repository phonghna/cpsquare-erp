"use client";

import { useState } from "react";

type Item = { imei_serial: string; status: string; current_location: string; variant_id: string };
type Order = { order_id: string; order_code: string; customer_name: string; shipping_address: string; shipment_status: string; market_code: string };

export default function ReturnsPage() {
  const [imei, setImei] = useState("");
  const [item, setItem] = useState<Item | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [searching, setSearching] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function search() {
    if (!imei.trim()) return;
    setSearching(true);
    setError("");
    setDone("");
    setItem(null);
    setOrder(null);
    const res = await fetch(`/api/returns/lookup?imei=${encodeURIComponent(imei.trim())}`);
    const data = await res.json();
    setSearching(false);
    if (!res.ok) { setError(data.error || "Not found."); return; }
    setItem(data.item);
    setOrder(data.order);
  }

  async function act(action: "RESTOCK" | "REPAIR") {
    if (!item) return;
    setActing(true);
    setError("");
    const res = await fetch(`/api/returns/${item.imei_serial}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setActing(false);
    if (!res.ok) { setError(data.error || "Failed."); return; }
    setDone(action === "RESTOCK" ? "Re-stocked — device is back IN STOCK." : "Queued for repair — device sent to RMA inspection.");
    setItem(null);
    setOrder(null);
    setImei("");
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-disp text-2xl font-bold">1-Click Returns</h1>
        <p className="text-sm text-slate-500 mt-1">Scan or type an IMEI to trace its order and process the return.</p>
      </div>

      <div className="flex gap-2 mb-5 max-w-lg">
        <input
          value={imei}
          onChange={(e) => setImei(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Scan or type IMEI…"
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
        />
        <button
          onClick={search}
          disabled={searching || !imei.trim()}
          className="px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm disabled:opacity-50"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {error && <div className="text-sm text-danger mb-4">{error}</div>}
      {done && <div className="text-sm text-ok mb-4">{done}</div>}

      {item && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-lg">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="font-mono font-bold text-lg">{item.imei_serial}</div>
              <div className="text-sm text-slate-500">{item.variant_id}</div>
            </div>
            <div className="text-xs px-2 py-1 rounded-md bg-slate-100 font-semibold">{item.status}</div>
          </div>

          {order ? (
            <div className="text-sm border-t border-slate-100 pt-4 mb-4">
              <div className="font-semibold font-mono">{order.order_code}</div>
              <div className="text-slate-500">{order.customer_name} · {order.market_code}</div>
              <div className="text-slate-500">{order.shipping_address}</div>
              <div className="text-slate-500 mt-1">Current status: {order.shipment_status}</div>
            </div>
          ) : (
            <div className="text-sm text-slate-400 border-t border-slate-100 pt-4 mb-4">
              No order found for this IMEI — it may never have shipped.
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => act("RESTOCK")}
              disabled={acting}
              className="flex-1 px-4 py-2 rounded-lg bg-ok text-white text-sm font-semibold disabled:opacity-50"
            >
              {acting ? "…" : "Re-stock — IN STOCK"}
            </button>
            <button
              onClick={() => act("REPAIR")}
              disabled={acting}
              className="flex-1 px-4 py-2 rounded-lg bg-warn text-white text-sm font-semibold disabled:opacity-50"
            >
              {acting ? "…" : "Queue for repair — REPAIRING"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
