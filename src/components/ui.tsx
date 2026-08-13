"use client";

// Shared UI primitives ported from the CPSquare ERP v8.6 MVP design reference,
// so every module page shares the same look: colored status pills, cards,
// KPI tiles, progress bars, tabs, and modal shell.

export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  IN_STOCK: { label: "In Stock", color: "var(--ok)", bg: "var(--ok-bg)" },
  CHECKED_OUT_LIVE: { label: "Checked-out Live", color: "var(--info)", bg: "var(--info-bg)" },
  RESERVED: { label: "Reserved", color: "var(--warn)", bg: "var(--warn-bg)" },
  PACKING: { label: "In Packing", color: "var(--violet)", bg: "var(--violet-bg)" },
  SHIPPED: { label: "Shipped", color: "var(--teal2)", bg: "var(--teal2-bg)" },
  REPAIRING: { label: "Repairing", color: "var(--danger)", bg: "var(--danger-bg)" },
  MEDIA_HOLD: { label: "Media Hold", color: "#B45309", bg: "#FDF0DD" },
};

export const SHIPMENT_META: Record<string, { label: string; color: string; bg: string }> = {
  PENDING_PACK: { label: "Pending Pack", color: "var(--text-dim)", bg: "var(--gray-bg)" },
  PACKED: { label: "Packed", color: "var(--violet)", bg: "var(--violet-bg)" },
  SHIPPED: { label: "Shipped", color: "var(--info)", bg: "var(--info-bg)" },
  DELIVERED: { label: "Delivered", color: "var(--ok)", bg: "var(--ok-bg)" },
  RETURNED: { label: "Returned", color: "var(--gray)", bg: "var(--gray-bg)" },
  CANCELLED: { label: "Cancelled", color: "var(--text-faint)", bg: "var(--gray-bg)" },
  DELIVERY_FAILED: { label: "Delivery Failed / Refused", color: "var(--danger)", bg: "var(--danger-bg)" },
};

export const RMA_STAGE_META: Record<string, { label: string; color: string; bg: string }> = {
  RECEIVE: { label: "Receive", color: "var(--text-dim)", bg: "var(--gray-bg)" },
  INSPECTION: { label: "Inspection", color: "var(--warn)", bg: "var(--warn-bg)" },
  REPAIRING: { label: "Repairing", color: "var(--danger)", bg: "var(--danger-bg)" },
  REPAIR_DONE: { label: "Repair Done", color: "var(--info)", bg: "var(--info-bg)" },
  SENT_OUT: { label: "Sent Out", color: "var(--ok)", bg: "var(--ok-bg)" },
};

export const INSTALLMENT_META: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: "Pending", color: "var(--warn)", bg: "var(--warn-bg)" },
  PAID: { label: "Paid", color: "var(--ok)", bg: "var(--ok-bg)" },
  OVERDUE: { label: "Overdue", color: "var(--danger)", bg: "var(--danger-bg)" },
};

export const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  NORMAL: { label: "Normal", color: "var(--info)", bg: "var(--info-bg)" },
  IMPORTANT: { label: "Important", color: "var(--warn)", bg: "var(--warn-bg)" },
  URGENT: { label: "Urgent", color: "var(--danger)", bg: "var(--danger-bg)" },
};

export function StatusPill({ status, meta }: { status: string; meta?: Record<string, { label: string; color: string; bg: string }> }) {
  const m = (meta || {})[status] || { label: status, color: "var(--text-dim)", bg: "var(--gray-bg)" };
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
        padding: "3px 10px", borderRadius: 999, color: m.color, background: m.bg, whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color }} />
      {m.label}
    </span>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
      {children}
    </div>
  );
}

export function KPI({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card className="flex-1 min-w-[180px]">
      <div style={{ padding: "18px 20px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
        <div className="disp" style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: accent || "var(--text)" }}>{value}</div>
        {sub && <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 4 }}>{sub}</div>}
      </div>
    </Card>
  );
}

export function Bar({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, color: "var(--text)" }}>{label}</span>
        <span className="mono" style={{ color: "var(--text-dim)" }}>{value}</span>
      </div>
      <div style={{ height: 8, background: "var(--paper)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: pct + "%", background: color || "var(--accent)", borderRadius: 4, transition: "width .5s ease" }} />
      </div>
    </div>
  );
}

export function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-faint)" }}>
      <div className="disp" style={{ fontSize: 15, fontWeight: 600, color: "var(--text-dim)" }}>{title}</div>
      {sub && <div style={{ fontSize: 13, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: "10px 16px", border: "none", background: "none", fontSize: 13.5, fontWeight: 600,
            color: active === t.id ? "var(--accent-dark)" : "var(--text-dim)",
            borderBottom: active === t.id ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1,
            cursor: "pointer",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", marginBottom: 5 }}>{label}</div>}
      {children}
    </div>
  );
}

export function ModalShell({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,18,23,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150, padding: 16 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: wide ? 680 : 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div className="disp" style={{ fontWeight: 700, fontSize: 17 }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 18, color: "var(--text-faint)", cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13.5, background: "#fff", color: "var(--text)" };
export const btnPrimary: React.CSSProperties = { padding: "9px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" };
export const btnGhost: React.CSSProperties = { padding: "7px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "#fff", color: "var(--text)", fontWeight: 600, fontSize: 12.5, cursor: "pointer" };
export const btnDanger: React.CSSProperties = { padding: "7px 12px", borderRadius: 7, border: "1px solid var(--danger)", background: "var(--danger-bg)", color: "var(--danger)", fontWeight: 600, fontSize: 12.5, cursor: "pointer" };

export const th: React.CSSProperties = { textAlign: "left", padding: "11px 16px", fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.03em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
export const td: React.CSSProperties = { padding: "11px 16px", borderBottom: "1px solid var(--border)" };
export const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
