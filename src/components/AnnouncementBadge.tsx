"use client";

import { useEffect, useState } from "react";

type Announcement = { announcementId: string; title: string; content: string; priority: string };

export default function AnnouncementBadge() {
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

  if (items.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-7 h-7 rounded-full bg-danger/20 flex items-center justify-center text-danger animate-pulse"
        title={`${items.length} active announcement(s)`}
      >
        <span className="text-xs font-bold">{items.length}</span>
      </button>
      {open && (
        <div className="absolute bottom-9 left-0 w-64 bg-white text-ink rounded-lg shadow-xl border border-slate-200 p-2 z-50">
          {items.map((a) => (
            <div key={a.announcementId} className="p-2 border-b border-slate-100 last:border-0">
              <div className="text-xs font-bold flex items-center gap-1.5">
                {a.title}
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{a.priority}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{a.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
