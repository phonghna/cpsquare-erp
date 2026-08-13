"use client";

import { useEffect, useState } from "react";

type Item = {
  imeiSerial: string;
  variantId: string;
  status: string;
  currentLocation: string;
  batteryHealth: number | null;
  cosmeticCondition: string | null;
};

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [canOperate, setCanOperate] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/inventory");
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function act(imei: string, action: string) {
    setBusy(imei);
    const res = await fetch(`/api/inventory/${imei}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.status === 403) setCanOperate(false);
    setBusy(null);
    load();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-disp text-2xl font-bold">IMEI Inventory</h1>
        <p className="text-sm text-slate-500 mt-1">
          Centralized at CPSquare Warehouse (TW) — every serialized device serves all 4 markets from one pool.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="p-3">IMEI</th><th className="p-3">SKU</th><th className="p-3">Battery</th>
                <th className="p-3">Location</th><th className="p-3">Status</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.imeiSerial} className="border-b border-slate-100">
                  <td className="p-3 font-mono">{i.imeiSerial}</td>
                  <td className="p-3">{i.variantId}</td>
                  <td className="p-3">{i.batteryHealth ?? "—"}%</td>
                  <td className="p-3 text-slate-500">{i.currentLocation}</td>
                  <td className="p-3">{i.status}</td>
                  <td className="p-3 space-x-2">
                    {canOperate && i.status === "IN_STOCK" && (
                      <>
                        <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "CHECKOUT_LIVE")}>Check-out live</ActionBtn>
                        <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "MEDIA_HOLD")}>Media hold</ActionBtn>
                      </>
                    )}
                    {canOperate && i.status === "CHECKED_OUT_LIVE" && (
                      <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "CHECKIN")}>Check-in shelf</ActionBtn>
                    )}
                    {canOperate && i.status === "MEDIA_HOLD" && (
                      <ActionBtn busy={busy === i.imeiSerial} onClick={() => act(i.imeiSerial, "RELEASE_HOLD")}>Release hold</ActionBtn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold disabled:opacity-40">
      {busy ? "…" : children}
    </button>
  );
}
