import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { orders, productItems } from "@/lib/schema";
import { sql, inArray, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

function visibleMarkets(session: { role: string; markets: string[] }) {
  if (session.role === "ADMIN" || session.role === "PACKING" || session.role === "TECH") {
    return ["VN", "ID", "TH", "PH"];
  }
  return session.markets;
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN" && session.role !== "MANAGER") redirect("/orders");

  const markets = visibleMarkets(session);
  const db = getDb();

  const [{ grossRevenue, orderCount }] = await db
    .select({
      grossRevenue: sql<string>`coalesce(sum(${orders.totalInvoiceAmountNtd}), 0)`,
      orderCount: sql<number>`count(*)`,
    })
    .from(orders)
    .where(
      sql`${inArray(orders.marketCode, markets)} AND ${ne(orders.shipmentStatus, "CANCELLED")}`
    );

  const byMarket = await db
    .select({
      marketCode: orders.marketCode,
      count: sql<number>`count(*)`,
      revenue: sql<string>`coalesce(sum(${orders.totalInvoiceAmountNtd}), 0)`,
    })
    .from(orders)
    .groupBy(orders.marketCode);

  const byStatus = await db
    .select({ status: productItems.status, count: sql<number>`count(*)` })
    .from(productItems)
    .groupBy(productItems.status);

  const fmt = (n: string | number) => "$" + Math.round(Number(n)).toLocaleString("en-US") + " NTD";

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-disp text-2xl font-bold">Executive Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Real-time health metrics, unified into NTD. Physical assets pooled at CPSquare Warehouse (TW).
        </p>
      </div>

      <div className="flex gap-4 flex-wrap mb-6">
        <Kpi label="Gross Revenue" value={fmt(grossRevenue)} sub={`${orderCount} orders in scope`} />
        <Kpi label="Order Volume" value={String(orderCount)} sub="in current market scope" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Order volume by market">
          {byMarket.map((b) => (
            <Bar key={b.marketCode} label={b.marketCode} value={Number(b.count)} max={Math.max(1, ...byMarket.map((x) => Number(x.count)))} />
          ))}
        </Card>
        <Card title="Real asset location (TW central pool)">
          {byStatus.map((s) => (
            <Bar key={s.status} label={s.status} value={Number(s.count)} max={Math.max(1, ...byStatus.map((x) => Number(x.count)))} />
          ))}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-5 py-4 flex-1 min-w-[180px]">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="font-disp text-2xl font-bold mt-2">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="font-disp font-bold mb-3">{title}</div>
      {children}
    </div>
  );
}
function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="font-semibold">{label}</span>
        <span className="font-mono text-slate-500">{value}</span>
      </div>
      <div className="h-2 bg-paper rounded overflow-hidden">
        <div className="h-full bg-accent rounded" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
