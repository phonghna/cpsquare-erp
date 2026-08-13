"use client";

import { useEffect, useMemo, useState } from "react";

type InboxMsg = { messageId: string; subject: string; body: string; senderId: string; senderName: string; createdAt: string; isRead: boolean };
type SentMsg = { messageId: string; subject: string; body: string; createdAt: string; recipientCount: number };
type Recipient = { kind: "user" | "team"; id: string; label: string };

export default function MailboxPage() {
  const [inbox, setInbox] = useState<InboxMsg[]>([]);
  const [sent, setSent] = useState<SentMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"INBOX" | "SENT">("INBOX");
  const [selected, setSelected] = useState<InboxMsg | SentMsg | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [replyTo, setReplyTo] = useState<InboxMsg | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/mailbox");
    const data = await res.json();
    setInbox(data.inbox || []);
    setSent(data.sent || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function openMessage(m: InboxMsg | SentMsg) {
    setSelected(m);
    if (tab === "INBOX" && !(m as InboxMsg).isRead) {
      await fetch(`/api/mailbox/${m.messageId}/read`, { method: "POST" });
      load();
    }
  }

  const unreadCount = useMemo(() => inbox.filter((m) => !m.isRead).length, [inbox]);
  const list = tab === "INBOX" ? inbox : sent;

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="font-disp text-2xl font-bold">Internal Mailbox</h1>
          <p className="text-sm text-slate-500 mt-1">Messages between staff and teams.</p>
        </div>
        <button onClick={() => { setReplyTo(null); setShowCompose(true); }} className="px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm">
          + Compose
        </button>
      </div>

      {error && <div className="text-sm text-danger mb-3">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-[30%_70%] gap-4 bg-white border border-slate-200 rounded-lg overflow-hidden min-h-[420px]">
        <div className="border-r border-slate-200">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => { setTab("INBOX"); setSelected(null); }}
              className={`flex-1 py-2.5 text-xs font-semibold ${tab === "INBOX" ? "bg-paper" : ""}`}
            >
              Inbox {unreadCount > 0 && <span className="ml-1 text-danger">({unreadCount})</span>}
            </button>
            <button
              onClick={() => { setTab("SENT"); setSelected(null); }}
              className={`flex-1 py-2.5 text-xs font-semibold ${tab === "SENT" ? "bg-paper" : ""}`}
            >
              Sent
            </button>
          </div>
          <div className="overflow-y-auto max-h-[500px]">
            {loading ? (
              <div className="p-6 text-center text-slate-400 text-xs">Loading…</div>
            ) : list.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">Nothing here.</div>
            ) : (
              list.map((m) => (
                <button
                  key={m.messageId}
                  onClick={() => openMessage(m)}
                  className={`w-full text-left p-3 border-b border-slate-100 hover:bg-paper ${selected?.messageId === m.messageId ? "bg-paper" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    {tab === "INBOX" && !(m as InboxMsg).isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />}
                    <div className="text-xs font-semibold truncate">{m.subject}</div>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    {tab === "INBOX" ? `From ${(m as InboxMsg).senderName}` : `${(m as SentMsg).recipientCount} recipient(s)`}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="p-5">
          {!selected ? (
            <div className="text-sm text-slate-400 text-center pt-16">Select a message to read it.</div>
          ) : (
            <div>
              <div className="font-disp font-bold text-lg mb-1">{selected.subject}</div>
              <div className="text-xs text-slate-500 mb-4">
                {tab === "INBOX" ? `From ${(selected as InboxMsg).senderName}` : `${(selected as SentMsg).recipientCount} recipient(s)`}
                {" · "}{new Date(selected.createdAt).toLocaleString()}
              </div>
              <div className="text-sm whitespace-pre-wrap mb-5">{selected.body}</div>
              {tab === "INBOX" && (
                <button
                  onClick={() => { setReplyTo(selected as InboxMsg); setShowCompose(true); }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold"
                >
                  Quick reply
                </button>
              )}
            </div>
          )}
        </div>
      </div>

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
  const [suggestions, setSuggestions] = useState<{ users: { userId: string; username: string; displayName: string }[]; teams: string[] }>({ users: [], teams: [] });
  const [recipients, setRecipients] = useState<Recipient[]>(
    replyTo ? [{ kind: "user", id: replyTo.senderId, label: replyTo.senderName }] : []
  );
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : "");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/mailbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        body,
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="font-disp font-bold text-lg mb-4">{replyTo ? "Quick Reply" : "Compose"}</div>

        <div className="mb-3">
          <div className="text-xs font-semibold text-slate-500 mb-1.5">Recipients</div>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {recipients.map((r) => (
              <span key={`${r.kind}-${r.id}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-paper text-xs">
                {r.kind === "team" ? `Team: ${r.label}` : r.label}
                <button onClick={() => removeRecipient(r.kind, r.id)} className="text-slate-400 hover:text-danger">×</button>
              </span>
            ))}
          </div>
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input"
              placeholder="Search people or teams…"
            />
            {(suggestions.users.length > 0 || suggestions.teams.length > 0) && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border border-slate-200 rounded-lg mt-1 max-h-48 overflow-y-auto shadow-lg">
                {suggestions.teams.map((t) => (
                  <button
                    key={`team-${t}`}
                    onClick={() => addRecipient({ kind: "team", id: t, label: t })}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-paper"
                  >
                    Team: {t}
                  </button>
                ))}
                {suggestions.users.map((u) => (
                  <button
                    key={u.userId}
                    onClick={() => addRecipient({ kind: "user", id: u.userId, label: u.displayName })}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-paper"
                  >
                    {u.displayName} <span className="text-slate-400">@{u.username}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mb-3">
          <div className="text-xs font-semibold text-slate-500 mb-1.5">Subject</div>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" />
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1.5">Message</div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="input" />
        </div>

        {error && <div className="text-sm text-danger mt-3">{error}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting || !subject || !body || recipients.length === 0}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
      <style jsx global>{`.input { width:100%; padding:9px 11px; border-radius:8px; border:1px solid #E2E5EA; font-size:13.5px; }`}</style>
    </div>
  );
}
