import { redirect } from "next/navigation";
import { getSession, ROLE_PAGES } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

const NAV_DEFS: { id: string; label: string; href: string }[] = [
  { id: "dashboard", label: "Executive Dashboard", href: "/dashboard" },
  { id: "orders", label: "Multi-channel Orders", href: "/orders" },
  { id: "inventory", label: "IMEI Inventory (TW)", href: "/inventory" },
  { id: "accessories", label: "Accessories Warehouse", href: "/accessories" },
  { id: "live", label: "Livestream Rotation", href: "/live" },
  { id: "packing", label: "Fulfillment Packing", href: "/packing" },
  { id: "tracking", label: "Shipment Tracking", href: "/tracking" },
  { id: "installments", label: "Installment Debt Board", href: "/installments" },
  { id: "returns", label: "1-Click Returns", href: "/returns" },
  { id: "rma", label: "Repair / RMA", href: "/rma" },
  { id: "pricebook", label: "Price Book", href: "/pricebook" },
  { id: "announcements", label: "Announcements", href: "/announcements" },
  { id: "mailbox", label: "Internal Mailbox", href: "/mailbox" },
  { id: "auditlogs", label: "Audit Trail Logs", href: "/auditlogs" },
  { id: "usermgmt", label: "User Management", href: "/usermgmt" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const allowed = ROLE_PAGES[session.role] || [];
  const items = NAV_DEFS.filter((n) => allowed.includes(n.id));

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-ink text-white flex-shrink-0 flex flex-col p-5">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="font-disp font-bold text-ink text-sm">CP</span>
          </div>
          <div>
            <div className="font-disp text-sm font-bold">CPSquare ERP</div>
            <div className="text-[10px] text-slate-400 tracking-wide">TAIWAN CENTRAL WAREHOUSE</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {items.map((it) => (
            <a
              key={it.id}
              href={it.href}
              className="px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition"
            >
              {it.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-white/10">
          <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
            <div>
              <div className="text-xs font-semibold">{session.displayName}</div>
              <div className="text-[10px] text-slate-400">
                {session.role} · {session.markets.length === 4 ? "All markets" : session.markets.join("+")}
              </div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  );
}
