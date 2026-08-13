"use client";

import { useEffect, useState } from "react";
import { PRIORITY_META } from "@/components/ui";

type Announcement = { announcementId: string; title: string; content: string; priority: string };

export default function TopBar({ role, markets }: { role: string; markets: string[] }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/announcements/active");
      if (!res.ok) return;
      const data = await res.json();
      if (!cancelled) setItems(data.announcements || []);
    }
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 24px", background: "var(--panel)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5, color: "var(--text-dim)", fontWeight: 600 }}>Market scope:</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 8, background: "var(--gray-bg)", color: "var(--text)" }}>
        {markets.length === 4 ? "All markets (VN, ID, TH, PH)" : markets.join(", ")}
      </span>

      <div style={{ position: "relative", marginLeft: "auto" }}>
        <button
          onClick={() => setOpen((o) => !o)}
          className={items.length ? "ann-blink" : ""}
          style={{
            display: "flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer",
            padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "#fff",
            background: items.length ? "var(--danger)" : "var(--gray)",
          }}
        >
          📣 {items.length}
        </button>
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, maxHeight: 400, overflowY: "auto", background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 14px 34px rgba(0,0,0,0.16)", zIndex: 60 }}>
            <div style={{ padding: "10px 14px", fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", borderBottom: "1px solid var(--border)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Active announcements ({items.length})
            </div>
            {items.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: "var(--text-faint)" }}>Nothing active right now.</div>}
            {items.map((a) => {
              const pr = PRIORITY_META[a.priority] || PRIORITY_META.NORMAL;
              return (
                <div key={a.announcementId} style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{a.title}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: pr.color, background: pr.bg, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{pr.label}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a.content}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
