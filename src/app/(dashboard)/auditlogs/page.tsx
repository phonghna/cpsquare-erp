"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusPill, STATUS_META, Card, Empty, Tabs, inputStyle, tableStyle, th, td } from "@/components/ui";

type OrderLog = {
  logId: string; orderId: string; actionType: string; note: string | null; createdAt: string;
  orderCode: string; marketCode: string; performedByName: string | null; performedByRole: string | null;
};
type ImeiLog = {
  logId: string; imeiSerial: string; statusFrom: string | null; statusTo: string; relatedOrderId: string | null; relatedOrderCode: string | null;
  createdAt: string; performedByName: string | null; performedByRole: string | null;
};

export default function AuditLogsPage() {
  const [orderLogs, setOrderLogs] = useState<OrderLog[]>([]);
  const [imeiLogs, setImeiLogs] = useState<ImeiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("order");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setError("");
      try {
        const res = await fetch("/api/auditlogs");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setError(data.error || `Failed to load audit logs (HTTP ${res.status}).`); return; }
        setOrderLogs((data.orderLogs || []).map(camelizeOrderLog));
        setImeiLogs((data.imeiLogs || []).map(camelizeImeiLog));
      } catch (err: any) {
        setError(err?.message || "Network error — failed to load audit logs.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredOrderLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orderLogs;
    return orderLogs.filter((l) => l.orderCode.toLowerCase().includes(q) || l.actionType.toLowerCase().includes(q));
  }, [orderLogs, search]);

  const filteredImeiLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return imeiLogs;
    return imeiLogs.filter((l) => l.imeiSerial.includes(q) || (l.relatedOrderCode || "").toLowerCase().includes(q));
  }, [imeiLogs, search]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="disp text-2xl font-bold">Audit Trail Logs</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Full history of order actions (including edits) and IMEI lifecycle transitions.</p>
      </div>

      <Tabs
        tabs={[{ id: "order", label: `Order_Logs (${filteredOrderLogs.length})` }, { id: "imei", label: `IMEI_Logs (${filteredImeiLogs.length})` }]}
        active={tab}
        onChange={setTab}
      />
      <input placeholder="Search order code, IMEI, or action..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, maxWidth: 320, marginBottom: 16 }} />

      {error && <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</div>}

      {loading ? (
        <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
      ) : tab === "order" ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {filteredOrderLogs.length === 0 ? (
            <Empty title="No order log entries yet" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr><th style={th}>Time</th><th style={th}>Order</th><th style={th}>Action</th><th style={th}>Performed by</th><th style={th}>Note</th></tr>
                </thead>
                <tbody>
                  {filteredOrderLogs.map((l) => (
                    <tr key={l.logId}>
                      <td style={td} className="mono">{new Date(l.createdAt).toLocaleString("en-US")}</td>
                      <td style={td} className="mono">{l.orderCode}</td>
                      <td style={td}><span style={{ fontWeight: 700, fontSize: 12 }}>{l.actionType}</span></td>
                      <td style={td}>{l.performedByName || "—"} {l.performedByRole && <span style={{ color: "var(--text-faint)" }}>({l.performedByRole})</span>}</td>
                      <td style={td}>{l.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {filteredImeiLogs.length === 0 ? (
            <Empty title="No IMEI log entries yet" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr><th style={th}>Time</th><th style={th}>IMEI</th><th style={th}>From</th><th style={th}>To</th><th style={th}>Related order</th><th style={th}>Performed by</th></tr>
                </thead>
                <tbody>
                  {filteredImeiLogs.map((l) => (
                    <tr key={l.logId}>
                      <td style={td} className="mono">{new Date(l.createdAt).toLocaleString("en-US")}</td>
                      <td style={td} className="mono">{l.imeiSerial}</td>
                      <td style={td}>{l.statusFrom ? <StatusPill status={l.statusFrom} meta={STATUS_META} /> : <span style={{ color: "var(--text-faint)" }}>NEW</span>}</td>
                      <td style={td}><StatusPill status={l.statusTo} meta={STATUS_META} /></td>
                      <td style={td} className="mono">{l.relatedOrderCode || "—"}</td>
                      <td style={td}>{l.performedByName || "—"} {l.performedByRole && <span style={{ color: "var(--text-faint)" }}>({l.performedByRole})</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function camelizeOrderLog(r: any): OrderLog {
  return {
    logId: r.log_id, orderId: r.order_id, actionType: r.action_type, note: r.note, createdAt: r.created_at,
    orderCode: r.order_code, marketCode: r.market_code, performedByName: r.performed_by_name, performedByRole: r.performed_by_role,
  };
}
function camelizeImeiLog(r: any): ImeiLog {
  return {
    logId: r.log_id, imeiSerial: r.imei_serial, statusFrom: r.status_from, statusTo: r.status_to,
    relatedOrderId: r.related_order_id, relatedOrderCode: r.related_order_code, createdAt: r.created_at,
    performedByName: r.performed_by_name, performedByRole: r.performed_by_role,
  };
}
