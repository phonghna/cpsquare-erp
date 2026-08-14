"use client";

import { useEffect, useState } from "react";
import { StatusPill, PRIORITY_META, Card, Empty, Field, inputStyle, btnPrimary, btnGhost, tableStyle, th, td } from "@/components/ui";

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
  readCount: number;
};

const MARKETS = [
  { code: "VN", name: "Vietnam" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
  { code: "PH", name: "Philippines" },
];
const PRIORITIES = [
  { code: "URGENT", label: "Urgent" },
  { code: "IMPORTANT", label: "Important" },
  { code: "NORMAL", label: "Normal" },
];

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  Scheduled: { label: "Scheduled", color: "var(--info)", bg: "var(--info-bg)" },
  Active: { label: "Active", color: "var(--ok)", bg: "var(--ok-bg)" },
  Expired: { label: "Expired", color: "var(--text-faint)", bg: "var(--gray-bg)" },
  Deleted: { label: "Deleted", color: "var(--danger)", bg: "var(--danger-bg)" },
};

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusOf(a: Announcement) {
  const now = new Date();
  if (!a.isActive) return "Deleted";
  if (now < new Date(a.startDatetime)) return "Scheduled";
  if (now > new Date(a.expirationDatetime)) return "Expired";
  return "Active";
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("URGENT");
  const [allMarkets, setAllMarkets] = useState(true);
  const [targets, setTargets] = useState<string[]>([]);
  const [startAt, setStartAt] = useState(() => toDatetimeLocal(new Date()));
  const [expireAt, setExpireAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return toDatetimeLocal(d);
  });
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/announcements");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || `Failed to load announcements (HTTP ${res.status}).`); return; }
      setItems(data.announcements || []);
    } catch (err: any) {
      setError(err?.message || "Network error — failed to load announcements.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function toggleTarget(code: string) {
    setTargets((prev) => (prev.includes(code) ? prev.filter((t) => t !== code) : [...prev, code]));
  }

  async function send() {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    setError("");
    const targetMarkets = allMarkets ? "ALL" : (targets.length ? targets.join(",") : "ALL");
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content: message.trim(), priority, targetMarkets, startDatetime: startAt, expirationDatetime: expireAt }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) { setError(data.error || "Failed to create announcement."); return; }
    setTitle(""); setMessage(""); setAllMarkets(true); setTargets([]);
    load();
  }

  async function remove(id: string) {
    setBusyId(id);
    await fetch(`/api/announcements/${id}/delete`, { method: "POST" });
    setBusyId(null);
    load();
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="disp text-2xl font-bold">Announcements</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Admin-only. Active announcements blink on the header next to Order data scope for targeted markets, within the scheduled window.</p>
      </div>

      <Card style={{ padding: 20, maxWidth: 640, marginBottom: 24 }}>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New T-Cat export format live" style={inputStyle} /></Field>
        <div style={{ height: 12 }} />
        <Field label="Message"><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }} /></Field>
        <div style={{ height: 12 }} />
        <Field label="Priority">
          <div style={{ display: "flex", gap: 8 }}>
            {PRIORITIES.map((p) => {
              const meta = PRIORITY_META[p.code];
              const active = priority === p.code;
              return (
                <button
                  key={p.code}
                  onClick={() => setPriority(p.code)}
                  style={{
                    padding: "7px 14px", borderRadius: 8, border: active ? `2px solid ${meta.color}` : "1px solid var(--border)",
                    background: active ? meta.bg : "#fff", color: active ? meta.color : "var(--text-dim)", fontWeight: 700, fontSize: 12.5, cursor: "pointer",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
          <Field label="Start datetime"><input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} style={inputStyle} /></Field>
          <Field label="Expiration datetime"><input type="datetime-local" value={expireAt} onChange={(e) => setExpireAt(e.target.value)} style={inputStyle} /></Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8 }}>
            <input type="checkbox" checked={allMarkets} onChange={(e) => setAllMarkets(e.target.checked)} /> Send to All Markets
          </label>
          {!allMarkets && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {MARKETS.map((m) => (
                <label key={m.code} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5, background: targets.includes(m.code) ? "var(--accent-bg)" : "#fff" }}>
                  <input type="checkbox" checked={targets.includes(m.code)} onChange={() => toggleTarget(m.code)} /> {m.name}
                </label>
              ))}
            </div>
          )}
        </div>
        {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 12 }}>{error}</div>}
        <button onClick={send} disabled={sending || !title.trim() || !message.trim()} style={{ ...btnPrimary, width: "100%", marginTop: 16, opacity: sending ? 0.6 : 1 }}>
          {sending ? "Scheduling…" : "📣 Schedule announcement"}
        </button>
      </Card>

      <div className="disp" style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Sent history</div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
        ) : items.length === 0 ? (
          <Empty title="No announcements sent yet" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr><th style={th}>Title</th><th style={th}>Priority</th><th style={th}>Targets</th><th style={th}>Window</th><th style={th}>Status</th><th style={th}>Acknowledged</th><th style={th}>Actions</th></tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const status = statusOf(a);
                  const targetLabel = a.targetMarkets === "ALL" ? "All markets" : a.targetMarkets.split(",").map((c) => MARKETS.find((m) => m.code === c)?.name || c).join(", ");
                  return (
                    <tr key={a.announcementId}>
                      <td style={td}>{a.title}</td>
                      <td style={td}><StatusPill status={a.priority} meta={PRIORITY_META} /></td>
                      <td style={td}>{targetLabel}</td>
                      <td style={td} className="mono">{new Date(a.startDatetime).toLocaleDateString("en-US")} → {new Date(a.expirationDatetime).toLocaleDateString("en-US")}</td>
                      <td style={td}><StatusPill status={status} meta={STATUS_STYLES} /></td>
                      <td style={td}>{a.readCount} user(s)</td>
                      <td style={td}>
                        {a.isActive && (
                          <button onClick={() => remove(a.announcementId)} disabled={busyId === a.announcementId} style={{ ...btnGhost, color: "var(--danger)", opacity: busyId === a.announcementId ? 0.5 : 1 }}>
                            {busyId === a.announcementId ? "…" : "🗑 Delete"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
