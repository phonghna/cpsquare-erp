"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Tabs, Empty, Field, ModalShell, inputStyle, btnPrimary, btnGhost } from "@/components/ui";

type InboxMsg = { messageId: string; subject: string; body: string; senderId: string; senderName: string; createdAt: string; isRead: boolean };
type SentMsg = { messageId: string; subject: string; body: string; createdAt: string; recipientCount: number };
type Recipient = { kind: "user" | "team"; id: string; label: string };

export default function MailboxPage() {
  const [inbox, setInbox] = useState<InboxMsg[]>([]);
  const [sent, setSent] = useState<SentMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [selected, setSelected] = useState<InboxMsg | SentMsg | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [replyTo, setReplyTo] = useState<InboxMsg | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/mailbox");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setLoadError(data.error || `Failed to load mailbox (HTTP ${res.status}).`); return; }
      setInbox(data.inbox || []);
      setSent(data.sent || []);
    } catch (err: any) {
      setLoadError(err?.message || "Network error — failed to load mailbox.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function openMessage(m: InboxMsg | SentMsg) {
    setSelected(m);
    setReplyText("");
    if (tab === "inbox" && !(m as InboxMsg).isRead) {
      await fetch(`/api/mailbox/${m.messageId}/read`, { method: "POST" });
      load();
    }
  }

  async function sendReply() {
    if (!selected || !replyText.trim()) return;
    setReplying(true);
    const recipientUserIds = tab === "inbox" ? [(selected as InboxMsg).senderId] : [];
    const res = await fetch("/api/mailbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: `Re: ${selected.subject}`, body: replyText.trim(), recipientUserIds, recipientTeams: [], parentId: selected.messageId }),
    });
    setReplying(false);
    if (res.ok) { setReplyText(""); load(); }
  }

  const unreadCount = useMemo(() => inbox.filter((m) => !m.isRead).length, [inbox]);
  const list = tab === "inbox" ? inbox : sent;

  return (
    <div>
      <div className="flex justify-between items-end mb-5 flex-wrap gap-3">
        <div>
          <h1 className="disp text-2xl font-bold">Internal Mailbox</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Send to one or more individuals at once, or broadcast to an entire team.</p>
        </div>
        <button onClick={() => { setReplyTo(null); setShowCompose(true); }} style={btnPrimary}>✎ Compose</button>
      </div>

      {loadError && <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>{loadError}</div>}

      <Card style={{ padding: 0, overflow: "hidden", display: "flex", minHeight: 440 }}>
        <div style={{ width: "30%", minWidth: 220, borderRight: "1px solid var(--border)" }}>
          <Tabs
            tabs={[{ id: "inbox", label: `Inbox (${unreadCount})` }, { id: "sent", label: "Sent" }]}
            active={tab}
            onChange={(t) => { setTab(t as "inbox" | "sent"); setSelected(null); }}
          />
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 16, fontSize: 12.5, color: "var(--text-faint)" }}>Loading…</div>
            ) : list.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12.5, color: "var(--text-faint)" }}>No messages.</div>
            ) : (
              list.map((m) => {
                const isSelected = selected?.messageId === m.messageId;
                const unread = tab === "inbox" && !(m as InboxMsg).isRead;
                return (
                  <div
                    key={m.messageId}
                    onClick={() => openMessage(m)}
                    style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: isSelected ? "var(--accent-bg)" : "#fff" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                        {tab === "inbox" ? (m as InboxMsg).senderName : `${(m as SentMsg).recipientCount} recipient(s)`}
                      </span>
                      {unread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--info)", flexShrink: 0 }} />}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.subject}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>{new Date(m.createdAt).toLocaleString("en-US")}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ width: "70%", padding: 20 }}>
          {!selected ? (
            <Empty title="Select a message" sub="Choose a message from the list to read it." />
          ) : (
            <>
              <div className="disp" style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{selected.subject}</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 16 }}>
                {tab === "inbox" ? `From ${(selected as InboxMsg).senderName}` : `${(selected as SentMsg).recipientCount} recipient(s)`} · {new Date(selected.createdAt).toLocaleString("en-US")}
              </div>
              <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>{selected.body}</div>
              {tab === "inbox" && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginBottom: 8 }}>Quick reply</div>
                  <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Type a reply..." style={{ ...inputStyle, resize: "vertical" }} />
                  <button onClick={sendReply} disabled={replying || !replyText.trim()} style={{ ...btnPrimary, marginTop: 10, opacity: replying ? 0.6 : 1 }}>
                    {replying ? "Sending…" : "Send reply"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </Card>

      {showCompose && (
        <ComposeModal
          replyTo={replyTo}
          onClose={() => setShowCompose(false)}
          onSent={() => { setShowCompose(false); load(); }}
        />
      )}
    </div>
  );
}

function ComposeModal({
  replyTo, onClose, onSent,
}: { replyTo: InboxMsg | null; onClose: () => void; onSent: () => void }) {
  const [query, setQuery] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestions, setSuggestions] = useState<{ users: { userId: string; username: string; displayName: string }[]; teams: string[] }>({ users: [], teams: [] });
  const [recipients, setRecipients] = useState<Recipient[]>(
    replyTo ? [{ kind: "user", id: replyTo.senderId, label: replyTo.senderName }] : []
  );
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : "");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const acRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (acRef.current && !acRef.current.contains(e.target as Node)) setShowSuggest(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setSuggestions({ users: [], teams: [] }); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/mailbox/recipients?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setSuggestions(data);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  function addRecipient(r: Recipient) {
    if (recipients.some((x) => x.kind === r.kind && x.id === r.id)) return;
    setRecipients((s) => [...s, r]);
    setQuery("");
    setSuggestions({ users: [], teams: [] });
  }
  function removeRecipient(kind: string, id: string) {
    setRecipients((s) => s.filter((r) => !(r.kind === kind && r.id === id)));
  }

  async function submit() {
    if (!subject.trim() || !body.trim() || recipients.length === 0) return;
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/mailbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: subject.trim(),
        body: body.trim(),
        recipientUserIds: recipients.filter((r) => r.kind === "user").map((r) => r.id),
        recipientTeams: recipients.filter((r) => r.kind === "team").map((r) => r.id),
        parentId: replyTo?.messageId || null,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to send."); return; }
    onSent();
  }

  return (
    <ModalShell onClose={onClose} title={replyTo ? "Quick Reply" : "Compose message"} wide>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>To</div>
      <div ref={acRef} style={{ position: "relative", marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowSuggest(true); }}
          onFocus={() => setShowSuggest(true)}
          placeholder="Type a name, username, or team name..."
          style={inputStyle}
        />
        {showSuggest && (suggestions.users.length > 0 || suggestions.teams.length > 0) && (
          <div className="combo-list">
            {suggestions.teams.map((t) => (
              <div key={`team-${t}`} className="combo-item" onMouseDown={() => addRecipient({ kind: "team", id: t, label: t })}>👥 Team {t}</div>
            ))}
            {suggestions.users.map((u) => (
              <div key={u.userId} className="combo-item" onMouseDown={() => addRecipient({ kind: "user", id: u.userId, label: u.displayName })}>
                <span className="mono" style={{ color: "var(--text-faint)", marginRight: 8 }}>{u.userId}</span>{u.displayName} <span style={{ color: "var(--text-faint)" }}>@{u.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {recipients.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {recipients.map((r) => (
            <span
              key={`${r.kind}-${r.id}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: r.kind === "team" ? "var(--violet-bg)" : "var(--accent-bg)", color: r.kind === "team" ? "var(--violet)" : "var(--accent-dark, var(--accent))",
              }}
            >
              {r.kind === "team" ? `Team ${r.label}` : r.label}
              <button onClick={() => removeRecipient(r.kind, r.id)} style={{ border: "none", background: "none", fontWeight: 700, cursor: "pointer", padding: 0, color: "inherit" }}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginBottom: 16 }}>{recipients.length} recipient group(s) selected.</div>

      <Field label="Subject"><input value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} /></Field>
      <div style={{ height: 10 }} />
      <Field label="Message"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} style={{ ...inputStyle, resize: "vertical" }} /></Field>

      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={submit} disabled={submitting || !subject.trim() || !body.trim() || recipients.length === 0} style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Sending…" : "Send"}
        </button>
      </div>
    </ModalShell>
  );
}
