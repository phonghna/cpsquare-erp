"use client";

import { useState, useEffect } from "react";
import { StatusPill, Card, Field, ModalShell, inputStyle, btnPrimary, btnGhost, tableStyle, th, td } from "@/components/ui";

type User = {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  teamAllocation: string | null;
  requirePasswordChange: boolean;
  isActive: boolean;
  markets: string[];
};

const ROLES = ["ADMIN", "MANAGER", "CS", "STREAMER", "PACKING", "TECH"];
const MARKETS = [
  { code: "VN", name: "Vietnam" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
  { code: "PH", name: "Philippines" },
];
const TEAMS = ["DZ", "DZG", "DZV", "DZT", "Repair", "CS"];
const ROLE_SCOPE: Record<string, "ALL" | "MULTI" | "SINGLE"> = {
  ADMIN: "ALL", PACKING: "ALL", TECH: "ALL", MANAGER: "MULTI", CS: "SINGLE", STREAMER: "SINGLE",
};

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const ACTIVE_META = {
  ACTIVE: { label: "Active", color: "var(--ok)", bg: "var(--ok-bg)" },
  DEACTIVATED: { label: "Deactivated", color: "var(--danger)", bg: "var(--danger-bg)" },
};

export default function UserMgmtPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/usermgmt");
    const data = await res.json();
    setUsers(data.users || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(userId: string) {
    setBusyId(userId);
    setError("");
    try {
      const res = await fetch(`/api/usermgmt/${userId}/toggle-active`, { method: "POST" });
      let data: any = {};
      try { data = await res.json(); } catch { /* ignore non-JSON error body */ }
      if (!res.ok) { setError(data.error || `Failed (HTTP ${res.status}).`); return; }
      load();
    } catch (err: any) {
      setError(err?.message || "Network error — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-5 flex-wrap gap-3">
        <div>
          <h1 className="disp text-2xl font-bold">User Management Console</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Admin-only. Create accounts, reset passwords, assign roles, markets and teams.</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={btnPrimary}>+ Create User</button>
      </div>

      {error && <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</div>}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Username</th><th style={th}>Name</th><th style={th}>Role</th><th style={th}>Markets</th>
                  <th style={th}>Team</th><th style={th}>Status</th><th style={th}>Password Policy</th><th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.userId}>
                    <td style={td} className="mono">{u.username}</td>
                    <td style={td}>{u.displayName}</td>
                    <td style={td}><span style={{ fontWeight: 700 }}>{u.role}</span></td>
                    <td style={td}>{u.role === "ADMIN" ? "Global" : u.markets.length === 4 ? "All" : u.markets.join(", ") || "—"}</td>
                    <td style={td}>{u.teamAllocation || "—"}</td>
                    <td style={td}><StatusPill status={u.isActive ? "ACTIVE" : "DEACTIVATED"} meta={ACTIVE_META} /></td>
                    <td style={td}>
                      {u.requirePasswordChange
                        ? <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--warn)" }}>Change on next login</span>
                        : <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>Standing password</span>}
                    </td>
                    <td style={td}>
                      <button onClick={() => setEditing(u)} style={{ ...btnGhost, marginRight: 6 }}>Edit</button>
                      <button onClick={() => setResetting(u)} style={{ ...btnGhost, marginRight: 6 }}>Reset password</button>
                      <button
                        onClick={() => toggleActive(u.userId)}
                        disabled={busyId === u.userId}
                        style={{ ...btnGhost, color: u.isActive ? "var(--danger)" : "var(--ok)", opacity: busyId === u.userId ? 0.5 : 1 }}
                      >
                        {busyId === u.userId ? "…" : u.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showCreate && (
        <UserFormModal mode="create" onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />
      )}
      {editing && (
        <UserFormModal mode="edit" user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {resetting && (
        <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} onDone={() => { setResetting(null); load(); }} />
      )}
    </div>
  );
}

function UserFormModal({
  mode, user, onClose, onSaved,
}: { mode: "create" | "edit"; user?: User; onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState(user?.username || "");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [role, setRole] = useState(user?.role || "CS");
  const [team, setTeam] = useState(user?.teamAllocation || "");
  const [markets, setMarkets] = useState<string[]>(user?.markets || []);
  const [password, setPassword] = useState(genPassword());
  const [requirePasswordChange, setRequirePasswordChange] = useState(user?.requirePasswordChange ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const scope = ROLE_SCOPE[role] || "SINGLE";

  function toggleMarket(m: string) {
    if (scope === "SINGLE") { setMarkets([m]); return; }
    setMarkets((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    const url = mode === "create" ? "/api/usermgmt" : `/api/usermgmt/${user!.userId}/edit`;
    const body: any = { displayName, role, team: role === "ADMIN" ? "Global" : (team || null), markets, requirePasswordChange };
    if (mode === "create") { body.username = username; body.password = password; }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* non-JSON error body — fall through with generic message */ }
      if (!res.ok) {
        const diag = data._diagnostic ? ` — ${JSON.stringify(data._diagnostic)}` : "";
        setError((data.error || `Failed to save (HTTP ${res.status}).`) + diag);
        return;
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message || "Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    displayName.trim() &&
    role &&
    (scope === "ALL" || markets.length > 0) &&
    (mode === "edit" || (username.trim() && password.trim()));

  return (
    <ModalShell onClose={onClose} title={mode === "create" ? "Create User" : `Edit ${user?.displayName}`}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {mode === "create" && (
          <Field label="Username" full><input value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} /></Field>
        )}
        <Field label="Display name" full><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} /></Field>
        <Field label="Role" full>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
      </div>

      {scope === "SINGLE" && (
        <div style={{ marginTop: 12 }}>
          <Field label="Assigned market">
            <select value={markets[0] || "VN"} onChange={(e) => setMarkets([e.target.value])} style={inputStyle}>
              {MARKETS.map((m) => <option key={m.code} value={m.code}>{m.name} ({m.code})</option>)}
            </select>
          </Field>
        </div>
      )}
      {scope === "MULTI" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6 }}>Assigned markets</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MARKETS.map((m) => (
              <label key={m.code} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5, background: markets.includes(m.code) ? "var(--accent-bg)" : "#fff" }}>
                <input type="checkbox" checked={markets.includes(m.code)} onChange={() => toggleMarket(m.code)} /> {m.name}
              </label>
            ))}
          </div>
        </div>
      )}
      {scope === "ALL" && <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--text-faint)" }}>This role always sees all 4 markets (shared TW queue).</div>}

      {role === "ADMIN" ? (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--text-faint)" }}>Team is always <strong style={{ color: "var(--text-dim)" }}>Global</strong> for Admin accounts.</div>
      ) : role !== "PACKING" && role !== "TECH" && (
        <div style={{ marginTop: 12 }}>
          <Field label="Team allocation">
            <select value={team} onChange={(e) => setTeam(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
      )}

      {mode === "create" && (
        <div style={{ marginTop: 12 }}>
          <Field label="Password">
            <div style={{ display: "flex", gap: 8 }}>
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Type a company-issued password..." style={inputStyle} />
              <button onClick={() => setPassword(genPassword())} style={{ ...btnGhost, whiteSpace: "nowrap" }}>🎲 Auto-generate</button>
            </div>
          </Field>
        </div>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginTop: 10 }}>
        <input type="checkbox" checked={requirePasswordChange} onChange={(e) => setRequirePasswordChange(e.target.checked)} /> Require user to change password on first login
      </label>

      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={submit} disabled={submitting || !canSubmit} style={{ ...btnPrimary, opacity: submitting || !canSubmit ? 0.6 : 1 }}>
          {submitting ? "Saving…" : mode === "create" ? "Create user" : "Save changes"}
        </button>
      </div>
    </ModalShell>
  );
}

function ResetPasswordModal({
  user, onClose, onDone,
}: { user: User; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState(genPassword());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/usermgmt/${user.userId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* ignore non-JSON error body */ }
      if (!res.ok) { setError(data.error || `Failed (HTTP ${res.status}).`); return; }
      onDone();
    } catch (err: any) {
      setError(err?.message || "Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title="Reset Password">
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>{user.displayName} ({user.username})</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        <button onClick={() => setPassword(genPassword())} style={{ ...btnGhost, whiteSpace: "nowrap" }}>🎲 Auto-generate</button>
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={submit} disabled={submitting || password.length < 6} style={{ ...btnPrimary, opacity: submitting || password.length < 6 ? 0.6 : 1 }}>
          {submitting ? "Saving…" : "Reset"}
        </button>
      </div>
    </ModalShell>
  );
}
