"use client";

import { usePathname } from "next/navigation";
import { useMobileNav } from "@/components/MobileNav";

type NavItem = { id: string; label: string; href: string; icon: string };

const PRIORITY = ["dashboard", "orders", "inventory", "packing", "tracking", "live", "accessories", "rma", "returns"];
const SHORT_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  orders: "Orders",
  inventory: "Inventory",
  packing: "Packing",
  tracking: "Tracking",
  live: "Live",
  accessories: "Accessories",
  rma: "RMA",
  returns: "Returns",
};

export default function BottomTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { toggle } = useMobileNav();

  const byId = new Map(items.map((it) => [it.id, it]));
  const primary: NavItem[] = [];
  for (const id of PRIORITY) {
    const it = byId.get(id);
    if (it) primary.push(it);
    if (primary.length === 4) break;
  }
  if (primary.length < 4) {
    for (const it of items) {
      if (primary.length === 4) break;
      if (!primary.find((p) => p.id === it.id)) primary.push(it);
    }
  }

  return (
    <nav className="bottom-tabbar">
      {primary.map((it) => {
        const active = pathname?.startsWith(it.href);
        return (
          <a key={it.id} href={it.href} className={`bottom-tab-item${active ? " active" : ""}`}>
            <span className="bottom-tab-icon">{it.icon}</span>
            <span>{SHORT_LABEL[it.id] || it.label}</span>
          </a>
        );
      })}
      <button onClick={toggle} className="bottom-tab-item">
        <span className="bottom-tab-icon">☰</span>
        <span>More</span>
      </button>
    </nav>
  );
}
