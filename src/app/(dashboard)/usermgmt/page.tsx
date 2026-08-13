"use client";

import { useEffect, useState } from "react";
import { StatusPill } from "@/components/ui";

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
const MARKETS = ["VN", "ID", "TH", "PH"];
const TEAMS = ["DZ", "DZG", "DZV", "DZT", "Repair", "CS"];
const ROLE_SCOPE: Record<string, "ALL" | "MULTI" | "SINGLE"> = {
  ADMIN: "ALL", PACKING: "ALL", TECH: "ALL", MANAGER: "MULTI", CS: "SINGLE", STREAMER: "SINGLE",
};

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

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
    const res = await fetch(`/api/usermgmt/${userId}/toggle-active`, { method: "POST" });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) { setError(data.error || "Failed."); return; }
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="font-disp text-2xl font-bold">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">Accounts, roles, and market access.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm">
          + New User
        </button>
      </div>

      {error && <div className="text-sm text-danger mb-3">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="p-3">Username</th><th className="p-3">Name</th><th className="p-3">Role</th>
                <th className="p-3">Markets</th><th className="p-3">Team</th><th className="p-3">Status</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId} className="border-b border-slate-100">
                  <td className="p-3 font-mono">{u.username}</td>
                  <td className="p-3 font-semibold">{u.displayName}</td>
                  <td className="p-3">{u.role}</td>
                  <td className="p-3 text-slate-500">{u.markets.length === 4 ? "All" : u.markets.join(", ") || "—"}</td>
                  <td className="p-3 text-slate-500">{u.teamAllocation || "—"}</td>
                  <td className="p-3">
                    <StatusPill
                      status={u.isActive ? "ACTIVE" : "DEACTIVATED"}
                      meta={{ ACTIVE: { label: "Active", color: "var(--ok)", bg: "var(--ok-bg)" }, DEACTIVATED: { label: "Deactivated", color: "var(--text-dim)", bg: "var(--gray-bg)" } }}
                    />
                  </td>
                  <td className="p-3 space-x-2 whitespace-nowrap">
                    <button onClick={() => setEditing(u)} className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold">Edit</button>
                    <button onClick={() => setResetting(u)} className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold">Reset password</button>
                    <button
                      onClick={() => toggleActive(u.userId)}
                      disabled={busyId === u.userId}
                      className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold disabled:opacity-40"
                    >
                      {busyId === u.userId ? "…" : u.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <UserFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}
      {editing && (
        <UserFormModal
          mode="edit"
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => { setResetting(null); load(); }}
        />
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
  const [password, setPassword] = useState("");
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
    const body: any = { displayName, role, team: team || null, markets, requirePasswordChange };
    if (mode === "create") { body.username = username; body.password = password; }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to save."); return; }
    onSaved();
  }

  const canSubmit =
    displayName &&
    role &&
    (scope === "ALL" || markets.length > 0) &&
    (mode === "edit" || (username && password));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="font-disp font-bold text-lg mb-4">{mode === "create" ? "New User" : `Edit ${user?.displayName}`}</div>
        <div className="grid grid-cols-2 gap-3">
          {mode === "create" && (
            <Field label="Username" full>
              <input value={username} onChange={(e) => setUsername(e.target.value)} className="input" />
            </Field>
          )}
          <Field label="Display name" full>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)} className="input">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Team">
            <select value={team} onChange={(e) => setTeam(e.target.value)} className="input">
              <option value="">—</option>
              {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Market access" full>
            {scope === "ALL" ? (
              <div className="text-xs text-slate-500">All 4 markets (fixed for this role)</div>
            ) : (
              <div className="flex gap-3">
                {MARKETS.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-sm">
                    <input
                      type={scope === "SINGLE" ? "radio" : "checkbox"}
                      name="market"
                      checked={markets.includes(m)}
                      onChange={() => toggleMarket(m)}
                    /> {m}
                  </label>
                ))}
              </div>
            )}
          </Field>
          {mode === "create" && (
            <Field label="Password" full>
              <div className="flex gap-2">
                <input value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
                <button type="button" onClick={() => setPassword(genPassword())} className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold whitespace-nowrap">
                  Auto-generate
                </button>
              </div>
            </Field>
          )}
          <Field label="" full>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={requirePasswordChange} onChange={(e) => setRequirePasswordChange(e.target.checked)} />
              Require password change on first login
            </label>
          </Field>
        </div>
        {error && <div className="text-sm text-danger mt-3">{error}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">Cancel</button>
          <button onClick={submit} disabled={submitting || !canSubmit} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <style jsx global>{`.input { width:100%; padding:9px 11px; border-radius:8px; border:1px solid #E2E5EA; font-size:13.5px; }`}</style>
    </div>
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
    const res = await fetch(`/api/usermgmt/${user.userId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed."); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="font-disp font-bold text-lg mb-1">Reset Password</div>
        <p className="text-xs text-slate-500 mb-3">{user.displayName} ({user.username})</p>
        <div className="flex gap-2">
          <input value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          <button type="button" onClick={() => setPassword(genPassword())} className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold whitespace-nowrap">
            Auto-generate
          </button>
        </div>
        {error && <div className="text-sm text-danger mt-3">{error}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">Cancel</button>
          <button onClick={submit} disabled={submitting || password.length < 6} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Saving…" : "Reset"}
          </button>
        </div>
      </div>
      <style jsx global>{`.input { width:100%; padding:9px 11px; border-radius:8px; border:1px solid #E2E5EA; font-size:13.5px; }`}</style>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      {label && <div className="text-xs font-semibold text-slate-500 mb-1.5">{label}</div>}
      {children}
    </div>
  );
}
