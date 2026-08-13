import { redirect } from "next/navigation";
import { getSession, ROLE_PAGES } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { messageRecipients } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

const NAV_DEFS: { id: string; label: string; href: string; icon: string }[] = [
  { id: "dashboard", label: "Executive Dashboard", href: "/dashboard", icon: "◧" },
  { id: "orders", label: "Multi-channel Orders", href: "/orders", icon: "⌘" },
  { id: "inventory", label: "IMEI Inventory (TW)", href: "/inventory", icon: "▤" },
  { id: "accessories", label: "Accessories Warehouse", href: "/accessories", icon: "◨" },
  { id: "live", label: "Livestream Rotation", href: "/live", icon: "◎" },
  { id: "packing", label: "Fulfillment Packing", href: "/packing", icon: "▣" },
  { id: "tracking", label: "Shipment Tracking", href: "/tracking", icon: "➤" },
  { id: "installments", label: "Installment Debt Board", href: "/installments", icon: "⏱" },
  { id: "returns", label: "1-Click Returns", href: "/returns", icon: "↺" },
  { id: "rma", label: "Repair / RMA", href: "/rma", icon: "⚙" },
  { id: "pricebook", label: "Price Book", href: "/pricebook", icon: "$" },
  { id: "announcements", label: "Announcements", href: "/announcements", icon: "📣" },
  { id: "mailbox", label: "Internal Mailbox", href: "/mailbox", icon: "✉" },
  { id: "auditlogs", label: "Audit Trail Logs", href: "/auditlogs", icon: "▥" },
  { id: "usermgmt", label: "User Management", href: "/usermgmt", icon: "◍" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const allowed = ROLE_PAGES[session.role] || [];
  const items = NAV_DEFS.filter((n) => allowed.includes(n.id));

  const db = getDb();
  const unread = await db
    .select({ messageId: messageRecipients.messageId })
    .from(messageRecipients)
    .where(and(eq(messageRecipients.receiverUserId, session.userId), eq(messageRecipients.isRead, false)));

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar
        items={items}
        displayName={session.displayName}
        role={session.role}
        markets={session.markets}
        unreadMailCount={unread.length}
      />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar role={session.role} markets={session.markets} />
        <div style={{ padding: "22px 26px 60px", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
