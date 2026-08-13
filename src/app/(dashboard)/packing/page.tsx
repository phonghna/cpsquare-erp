"use client";

import { useEffect, useMemo, useState } from "react";

type OrderItem = { itemId: string; imeiSerial: string; variantId: string; itemPriceNtd: string };
type OrderAccessory = { accessoryRowId: string; variantId: string; accessoryName: string; isVerified: boolean };
type PackingOrder = {
  orderId: string;
  orderCode: string;
  marketCode: string;
  customerName: string;
  shippingAddress: string;
  carrierService: string;
  codCollectAmountNtd: string;
  totalInvoiceAmountNtd: string;
  items: OrderItem[];
  accessories: OrderAccessory[];
};

const CARRIERS = [
  { code: "711", name: "7-Eleven" },
  { code: "FAMILY", name: "FamilyMart" },
  { code: "TCAT", name: "T-Cat" },
];

export default function PackingPage() {
  const [orders, setOrders] = useState<PackingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PackingOrder | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/packing");
    const data = await res.json();
    setOrders(data.orders || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const buckets = useMemo(() => {
    const map: Record<string, PackingOrder[]> = { "711": [], FAMILY: [], TCAT: [] };
    for (const o of orders) {
      if (map[o.carrierService]) map[o.carrierService].push(o);
    }
    return map;
  }, [orders]);

  function exportCsv(carrier: string, list: PackingOrder[]) {
    const header = ["order_code", "recipient", "address", "cod_amount", "carrier"];
    const rows = list.map((o) => [
      o.orderCode,
      o.customerName,
      o.shippingAddress,
      o.codCollectAmountNtd,
      o.carrierService,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `packing_${carrier}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-disp text-2xl font-bold">Fulfillment Packing</h1>
        <p className="text-sm text-slate-500 mt-1">
          Orders awaiting pack, grouped by carrier. Scan & Pack requires every IMEI confirmed and every accessory checked off.
        </p>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {CARRIERS.map((c) => (
            <div key={c.code} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-disp font-bold text-sm">{c.name}</div>
                  <div className="text-[11px] text-slate-500">{buckets[c.code].length} order(s)</div>
                </div>
                <button
                  onClick={() => exportCsv(c.code, buckets[c.code])}
                  disabled={buckets[c.code].length === 0}
                  className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold disabled:opacity-40"
                >
                  Bulk Excel export
                </button>
              </div>
              <div>
                {buckets[c.code].length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs">Nothing awaiting pack.</div>
                ) : (
                  buckets[c.code].map((o) => (
                    <div key={o.orderId} className="p-3 border-b border-slate-100 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-sm truncate">{o.orderCode}</div>
                        <div className="text-xs text-slate-500 truncate">{o.customerName}</div>
                      </div>
                      <button
                        onClick={() => setActive(o)}
                        className="px-2.5 py-1.5 rounded-md bg-accent text-white text-xs font-semibold flex-shrink-0"
                      >
                        Scan & Pack
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {active && (
        <ScanPackModal
          order={active}
          onClose={() => setActive(null)}
          onCompleted={() => { setActive(null); load(); }}
        />
      )}
    </div>
  );
}

function ScanPackModal({
  order, onClose, onCompleted,
}: { order: PackingOrder; onClose: () => void; onCompleted: () => void }) {
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const allScanned = order.items.every((i) => scanned.has(i.imeiSerial));
  const allChecked = order.accessories.every((a) => checked.has(a.accessoryRowId));
  const ready = allScanned && allChecked;

  async function complete() {
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/packing/${order.orderId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmedImeis: Array.from(scanned),
        confirmedAccessoryIds: Array.from(checked),
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to complete."); return; }
    onCompleted();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="font-disp font-bold text-lg mb-1">Scan & Pack — {order.orderCode}</div>
        <p className="text-xs text-slate-500 mb-4">{order.customerName} · {order.shippingAddress}</p>

        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Devices ({order.items.length})</div>
        <div className="space-y-2 mb-4">
          {order.items.length === 0 ? (
            <div className="text-xs text-slate-400">No devices on this order.</div>
          ) : (
            order.items.map((i) => (
              <div key={i.itemId} className="flex items-center justify-between border border-slate-200 rounded-lg p-2.5">
                <div>
                  <div className="font-mono text-sm">{i.imeiSerial}</div>
                  <div className="text-[11px] text-slate-500">{i.variantId}</div>
                </div>
                <button
                  onClick={() => setScanned((s) => new Set(s).add(i.imeiSerial))}
                  disabled={scanned.has(i.imeiSerial)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                    scanned.has(i.imeiSerial) ? "bg-ok/10 text-ok" : "border border-slate-200"
                  }`}
                >
                  {scanned.has(i.imeiSerial) ? "✓ Scanned" : "Confirm scan"}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Accessories ({order.accessories.length})</div>
        <div className="space-y-2 mb-2">
          {order.accessories.length === 0 ? (
            <div className="text-xs text-slate-400">No accessories on this order.</div>
          ) : (
            order.accessories.map((a) => (
              <label key={a.accessoryRowId} className="flex items-center gap-2.5 border border-slate-200 rounded-lg p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked.has(a.accessoryRowId)}
                  onChange={(e) => {
                    setChecked((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(a.accessoryRowId); else next.delete(a.accessoryRowId);
                      return next;
                    });
                  }}
                />
                <div className="text-sm">{a.accessoryName}</div>
              </label>
            ))
          )}
        </div>

        {error && <div className="text-sm text-danger mt-3">{error}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">Cancel</button>
          <button
            onClick={complete}
            disabled={!ready || submitting}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? "Completing…" : "Print label & complete"}
          </button>
        </div>
      </div>
    </div>
  );
}
