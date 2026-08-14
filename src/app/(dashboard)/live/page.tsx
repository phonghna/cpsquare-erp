"use client";

import { useEffect, useState } from "react";
import { Card, btnPrimary, btnGhost } from "@/components/ui";

type Item = { imeiSerial: string; variant: { modelName: string } | null };
type ByRoom = Record<string, Item[]>;

const ROOMS = [
  { code: "ADMIN", name: "Admin" },
  { code: "VN", name: "Vietnam" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
  { code: "PH", name: "Philippines" },
];

const EMPTY_ROOMS: ByRoom = { ADMIN: [], VN: [], ID: [], TH: [], PH: [] };

export default function LivePage() {
  const [byRoom, setByRoom] = useState<ByRoom>(EMPTY_ROOMS);
  const [myRoom, setMyRoom] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [busyImei, setBusyImei] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/live");
    const data = await res.json();
    setByRoom(data.byRoom || EMPTY_ROOMS);
    setMyRoom(data.myRoom || null);
    setRole(data.role || "");
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

  const canZeroClick = role === "CS" || role === "STREAMER" || role === "MANAGER" || role === "ADMIN";

  return (
    <div>
      <div className="flex justify-between items-end mb-5 flex-wrap gap-3">
        <div>
          <h1 className="disp text-2xl font-bold">Livestream Rotation</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Admin room plus four market rooms, fed from one central TW pool.</p>
        </div>
        {canZeroClick && (
          <button onClick={checkout} disabled={checkingOut} style={{ ...btnPrimary, opacity: checkingOut ? 0.6 : 1 }}>
            {checkingOut ? "Checking out…" : "📷 Check-out device (zero-click)"}
          </button>
        )}
      </div>

      {error && <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</div>}

      {loading ? (
        <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 16 }}>
          {ROOMS.map((m) => {
            const items = byRoom[m.code] || [];
            const isMine = m.code === myRoom;
            return (
              <Card key={m.code} style={{ padding: 16, border: isMine ? "2px solid var(--accent)" : "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div className="disp" style={{ fontWeight: 700, fontSize: 14 }}>{m.code === "ADMIN" ? "Admin" : `${m.name} Market`}</div>
                  <span className="live-dot" style={{ fontSize: 11, fontWeight: 700, color: "var(--info)" }}>● LIVE {items.length}</span>
                </div>
                {items.length === 0 && <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No devices checked out.</div>}
                {items.map((i) => (
                  <div key={i.imeiSerial} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{i.variant?.modelName || i.imeiSerial}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{i.imeiSerial}</div>
                    </div>
                    <button onClick={() => checkin(i.imeiSerial)} disabled={busyImei === i.imeiSerial} style={{ ...btnGhost, opacity: busyImei === i.imeiSerial ? 0.4 : 1 }}>
                      {busyImei === i.imeiSerial ? "…" : "Check-in"}
                    </button>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
