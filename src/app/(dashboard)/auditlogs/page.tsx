"use client";

import { useEffect, useMemo, useState } from "react";

type OrderLog = {
  logId: string; orderId: string; actionType: string; note: string | null; createdAt: string;
  orderCode: string; marketCode: string; performedByName: string | null;
};
type ImeiLog = {
  logId: string; imeiSerial: string; statusFrom: string | null; statusTo: string; relatedOrderId: string | null;
  createdAt: string; performedByName: string | null;
};

export default function AuditLogsPage() {
  const [orderLogs, setOrderLogs] = useState<OrderLog[]>([]);
  const [imeiLogs, setImeiLogs] = useState<ImeiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"ORDER" | "IMEI">("ORDER");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auditlogs");
      const data = await res.json();
      setOrderLogs((data.orderLogs || []).map(camelizeOrderLog));
      setImeiLogs((data.imeiLogs || []).map(camelizeImeiLog));
      setLoading(false);
    })();
  }, []);

  const filteredOrderLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orderLogs;
    return orderLogs.filter(
      (l) => l.orderCode.toLowerCase().includes(q) || l.actionType.toLowerCase().includes(q) || (l.performedByName || "").toLowerCase().includes(q)
    );
  }, [orderLogs, search]);

  const filteredImeiLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return imeiLogs;
    return imeiLogs.filter(
      (l) => l.imeiSerial.toLowerCase().includes(q) || l.statusTo.toLowerCase().includes(q) || (l.performedByName || "").toLowerCase().includes(q)
    );
  }, [imeiLogs, search]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-disp text-2xl font-bold">Audit Trail Logs</h1>
        <p className="text-sm text-slate-500 mt-1">Read-only history of order and IMEI status changes.</p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1">
          <button
            onClick={() => setTab("ORDER")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${tab === "ORDER" ? "bg-accent text-white border-accent" : "border-slate-200 text-slate-600"}`}
          >
            Order Logs ({orderLogs.length})
          </button>
          <button
            onClick={() => setTab("IMEI")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${tab === "IMEI" ? "bg-accent text-white border-accent" : "border-slate-200 text-slate-600"}`}
          >
            IMEI Logs ({imeiLogs.length})
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : tab === "ORDER" ? (
          filteredOrderLogs.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No results.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="p-3">Order Code</th><th className="p-3">Market</th><th className="p-3">Action</th>
                  <th className="p-3">Note</th><th className="p-3">By</th><th className="p-3">When</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrderLogs.map((l) => (
                  <tr key={l.logId} className="border-b border-slate-100">
                    <td className="p-3 font-mono font-bold">{l.orderCode}</td>
                    <td className="p-3">{l.marketCode}</td>
                    <td className="p-3">{l.actionType}</td>
                    <td className="p-3 text-slate-500">{l.note || "—"}</td>
                    <td className="p-3">{l.performedByName || "—"}</td>
                    <td className="p-3 text-slate-500 text-xs">{new Date(l.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : filteredImeiLogs.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No results.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="p-3">IMEI</th><th className="p-3">From</th><th className="p-3">To</th>
                <th className="p-3">By</th><th className="p-3">When</th>
              </tr>
            </thead>
            <tbody>
              {filteredImeiLogs.map((l) => (
                <tr key={l.logId} className="border-b border-slate-100">
                  <td className="p-3 font-mono">{l.imeiSerial}</td>
                  <td className="p-3 text-slate-500">{l.statusFrom || "—"}</td>
                  <td className="p-3">{l.statusTo}</td>
                  <td className="p-3">{l.performedByName || "—"}</td>
                  <td className="p-3 text-slate-500 text-xs">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function camelizeOrderLog(r: any): OrderLog {
  return {
    logId: r.log_id, orderId: r.order_id, actionType: r.action_type, note: r.note, createdAt: r.created_at,
    orderCode: r.order_code, marketCode: r.market_code, performedByName: r.performed_by_name,
  };
}
function camelizeImeiLog(r: any): ImeiLog {
  return {
    logId: r.log_id, imeiSerial: r.imei_serial, statusFrom: r.status_from, statusTo: r.status_to,
    relatedOrderId: r.related_order_id, createdAt: r.created_at, performedByName: r.performed_by_name,
  };
}
