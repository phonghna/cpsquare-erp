"use client";

import { usePathname } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

type NavItem = { id: string; label: string; href: string; icon: string };

export default function Sidebar({
  items, displayName, role, markets, unreadMailCount,
}: {
  items: NavItem[];
  displayName: string;
  role: string;
  markets: string[];
  unreadMailCount: number;
}) {
  const pathname = usePathname();

  return (
    <aside style={{ width: 256, background: "var(--ink)", color: "#fff", flexShrink: 0, display: "flex", flexDirection: "column", padding: "22px 16px", position: "sticky", top: 0, height: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 22px" }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span className="disp" style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>CP</span>
        </div>
        <div>
          <div className="disp" style={{ fontSize: 15, fontWeight: 700 }}>CPSquare ERP</div>
          <div style={{ fontSize: 10.5, color: "#8891A0", letterSpacing: "0.04em" }}>TAIWAN CENTRAL WAREHOUSE</div>
        </div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6, overflowY: "auto" }}>
        {items.map((it) => {
          const active = pathname?.startsWith(it.href);
          return (
            <a
              key={it.id}
              href={it.href}
              style={{
                display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 8,
                background: active ? "var(--ink-3)" : "transparent", color: active ? "#fff" : "#A7AEBA",
                fontSize: 13.5, fontWeight: active ? 600 : 500, textDecoration: "none",
              }}
            >
              <span style={{ width: 16, textAlign: "center", opacity: 0.9 }}>{it.icon}</span>
              {it.label}
              {it.id === "mailbox" && unreadMailCount > 0 && (
                <span style={{ marginLeft: "auto", background: "var(--danger)", color: "#fff", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "1px 7px" }}>
                  {unreadMailCount}
                </span>
              )}
            </a>
          );
        })}
      </nav>
      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #262E38" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--ink-3)", borderRadius: 8, padding: "8px 10px" }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>{displayName}</div>
            <div style={{ fontSize: 10.5, color: "#8891A0" }}>{role} · {markets.length === 4 ? "All markets" : markets.join("+")}</div>
          </div>
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
