"use client";

import { useEffect, useState } from "react";

type Announcement = {
  announcementId: string;
  title: string;
  content: string;
  priority: string;
  targetMarkets: string;
  startDatetime: string;
  expirationDatetime: string;
  isActive: boolean;
  createdAt: string;
};

const MARKETS = ["VN", "ID", "TH", "PH"];
const PRIORITIES = ["NORMAL", "IMPORTANT", "URGENT"];

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/announcements");
    const data = await res.json();
    setItems(data.announcements || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    setBusyId(id);
    await fetch(`/api/announcements/${id}/delete`, { method: "POST" });
    setBusyId(null);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="font-disp text-2xl font-bold">Announcements</h1>
          <p className="text-sm text-slate-500 mt-1">Sent to the header badge for staff in the target market(s).</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm">
          + New Announcement
        </button>
      </div>

      {error && <div className="text-sm text-danger mb-3">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No announcements yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="p-3">Title</th><th className="p-3">Priority</th><th className="p-3">Markets</th>
                <th className="p-3">Window</th><th className="p-3">Status</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.announcementId} className="border-b border-slate-100">
                  <td className="p-3 font-semibold">{a.title}</td>
                  <td className="p-3">{a.priority}</td>
                  <td className="p-3">{a.targetMarkets}</td>
                  <td className="p-3 text-slate-500 text-xs">
                    {new Date(a.startDatetime).toLocaleString()} → {new Date(a.expirationDatetime).toLocaleString()}
                  </td>
                  <td className="p-3">{a.isActive ? "Active" : "Deleted"}</td>
                  <td className="p-3">
                    {a.isActive && (
                      <button
                        onClick={() => remove(a.announcementId)}
                        disabled={busyId === a.announcementId}
                        className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold text-danger disabled:opacity-40"
                      >
                        {busyId === a.announcementId ? "…" : "Delete"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <NewAnnouncementModal
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); load(); }}
          error={error}
          setError={setError}
        />
      )}
    </div>
  );
}

function NewAnnouncementModal({
  onClose, onCreated, error, setError,
}: { onClose: () => void; onCreated: () => void; error: string; setError: (s: string) => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState("URGENT");
  const [allMarkets, setAllMarkets] = useState(true);
  const [markets, setMarkets] = useState<string[]>([]);
  const [startDatetime, setStartDatetime] = useState("");
  const [expirationDatetime, setExpirationDatetime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggleMarket(m: string) {
    setMarkets((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    const targetMarkets = allMarkets ? "ALL" : markets.join(",");
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, priority, targetMarkets, startDatetime, expirationDatetime }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to create announcement."); return; }
    onCreated();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="font-disp font-bold text-lg mb-4">New Announcement</div>
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Message</div>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} className="input" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Priority</div>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Target markets</div>
            <label className="flex items-center gap-2 text-sm mb-1.5">
              <input type="checkbox" checked={allMarkets} onChange={(e) => setAllMarkets(e.target.checked)} /> All markets
            </label>
            {!allMarkets && (
              <div className="flex gap-3">
                {MARKETS.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={markets.includes(m)} onChange={() => toggleMarket(m)} /> {m}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1.5">Start</div>
              <input type="datetime-local" value={startDatetime} onChange={(e) => setStartDatetime(e.target.value)} className="input" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1.5">Expires</div>
              <input type="datetime-local" value={expirationDatetime} onChange={(e) => setExpirationDatetime(e.target.value)} className="input" />
            </div>
          </div>
        </div>
        {error && <div className="text-sm text-danger mt-3">{error}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting || !title || !content || !startDatetime || !expirationDatetime || (!allMarkets && markets.length === 0)}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send Announcement"}
          </button>
        </div>
      </div>
      <style jsx global>{`.input { width:100%; padding:9px 11px; border-radius:8px; border:1px solid #E2E5EA; font-size:13.5px; }`}</style>
    </div>
  );
}
