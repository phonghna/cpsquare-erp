"use client";

import { useEffect, useState } from "react";

type Item = { imeiSerial: string; variantId: string; currentLocation: string };
type ByMarket = Record<string, Item[]>;

const MARKETS = ["VN", "ID", "TH", "PH"];

export default function LivePage() {
  const [byMarket, setByMarket] = useState<ByMarket>({ VN: [], ID: [], TH: [], PH: [] });
  const [myMarket, setMyMarket] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [busyImei, setBusyImei] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/live");
    const data = await res.json();
    setByMarket(data.byMarket || { VN: [], ID: [], TH: [], PH: [] });
    setMyMarket(data.myMarket || null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function checkout() {
    setCheckingOut(true);
    setError("");
    const res = await fetch("/api/live/checkout", { method: "POST" });
    const data = await res.json();
    setCheckingOut(false);
    if (!res.ok) { setError(data.error || "Check-out failed."); return; }
    load();
  }

  async function checkin(imei: string) {
    setBusyImei(imei);
    setError("");
    const res = await fetch(`/api/live/${imei}/checkin`, { method: "POST" });
    const data = await res.json();
    setBusyImei(null);
    if (!res.ok) { setError(data.error || "Check-in failed."); return; }
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="font-disp text-2xl font-bold">Livestream Rotation</h1>
          <p className="text-sm text-slate-500 mt-1">Devices currently on-air per market's live room.</p>
        </div>
        {myMarket && (
          <button
            onClick={checkout}
            disabled={checkingOut}
            className="px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm disabled:opacity-50"
          >
            {checkingOut ? "Checking out…" : `Check-out device (zero-click) — ${myMarket}`}
          </button>
        )}
      </div>

      {error && <div className="text-sm text-danger mb-3">{error}</div>}

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {MARKETS.map((m) => (
            <div key={m} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                <div className="font-disp font-bold text-sm">{m}</div>
                <div className="text-[11px] text-slate-500">{byMarket[m]?.length || 0} live</div>
              </div>
              <div>
                {(byMarket[m] || []).length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs">Nothing on-air.</div>
                ) : (
                  byMarket[m].map((item) => (
                    <div key={item.imeiSerial} className="p-3 border-b border-slate-100">
                      <div className="font-mono text-sm">{item.imeiSerial}</div>
                      <div className="text-[11px] text-slate-500 mb-2">{item.variantId}</div>
                      <button
                        onClick={() => checkin(item.imeiSerial)}
                        disabled={busyImei === item.imeiSerial}
                        className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold disabled:opacity-40"
                      >
                        {busyImei === item.imeiSerial ? "…" : "Check-in"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
