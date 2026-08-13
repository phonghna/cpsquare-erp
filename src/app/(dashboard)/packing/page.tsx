"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Empty, ModalShell, btnPrimary, btnGhost } from "@/components/ui";
import { ImeiScanField } from "@/components/ImeiScanner";

type OrderItem = { itemId: string; imeiSerial: string; variantId: string; modelName: string; color: string | null; itemPriceNtd: string; basePriceNtd: string };
type OrderAccessory = { accessoryRowId: string; variantId: string; accessoryName: string; isVerified: boolean; priceNtd: string };
type PackingOrder = {
  orderId: string;
  orderCode: string;
  marketCode: string;
  salesChannel: string;
  customerName: string;
  customerSocialHandle: string | null;
  customerPhone: string | null;
  postalCode: string | null;
  shippingAddress: string;
  carrierService: string;
  paymentType: string;
  codCollectAmountNtd: string;
  totalInvoiceAmountNtd: string;
  createdAt: string;
  items: OrderItem[];
  accessories: OrderAccessory[];
};

const CARRIERS = [
  { code: "711", name: "7-Eleven" },
  { code: "FAMILY", name: "FamilyMart" },
  { code: "TCAT", name: "T-Cat" },
];

function csvCell(v: unknown) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}
function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function PackingPage() {
  const [orders, setOrders] = useState<PackingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PackingOrder | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/packing");
    const data = await res.json();
    setOrders(data.orders || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const buckets = useMemo(() => {
    const map: Record<string, PackingOrder[]> = { "711": [], FAMILY: [], TCAT: [] };
    for (const o of orders) {
      if (map[o.carrierService]) map[o.carrierService].push(o);
    }
    return map;
  }, [orders]);

  function exportCarrierCsv(carrierCode: string) {
    const rows = buckets[carrierCode];
    if (rows.length === 0) return;
    const header = ["OrderCode", "RecipientName", "ContactHandle", "Address", "CarrierService", "CODAmountNTD", "ItemCount", "Products", "IMEIs"];
    const lines = rows.map((o) =>
      [
        o.orderCode,
        o.customerName,
        o.customerSocialHandle || "",
        o.shippingAddress,
        CARRIERS.find((c) => c.code === o.carrierService)?.name || o.carrierService,
        o.codCollectAmountNtd,
        o.items.length,
        o.items.map((i) => i.modelName).join(" | "),
        o.items.map((i) => i.imeiSerial).join(" | "),
      ]
        .map(csvCell)
        .join(",")
    );
    downloadCsv(`CPSquare_${carrierCode}_ShipExport_${Date.now()}.csv`, [header.join(","), ...lines].join("\n"));
  }

  // T-Cat 19-column flat line-item export: one row per phone / accessory / price-override line.
  function exportTCat19() {
    const rows = buckets.TCAT;
    if (rows.length === 0) return;
    const header = [
      "OrderCode", "LineType", "ProductName", "IMEI_or_SKU", "Color", "Qty", "UnitPriceNTD", "LineTotalNTD",
      "MarketCode", "SalesChannel", "CarrierService", "PaymentType", "CODCollectAmountNTD",
      "RecipientInfo_NamePostalAddress", "PhoneNumber", "TrackingNumber", "OrderDate", "Notes", "RowIndexOfTotal",
    ];
    const csvRows = [header.join(",")];
    rows.forEach((o) => {
      type Line = { type: string; name: string; code: string; color: string; qty: number; price: number };
      const lineItems: Line[] = [];
      o.items.forEach((it) => {
        const base = Number(it.basePriceNtd);
        const price = Number(it.itemPriceNtd);
        lineItems.push({ type: "PHONE", name: it.modelName, code: it.imeiSerial, color: it.color || "—", qty: 1, price });
        if (price !== base) lineItems.push({ type: "DISCOUNT", name: `Price override on ${it.modelName}`, code: it.imeiSerial, color: "—", qty: 1, price: price - base });
      });
      o.accessories.forEach((a) => {
        lineItems.push({ type: "ACCESSORY", name: a.accessoryName, code: a.variantId, color: "—", qty: 1, price: Number(a.priceNtd) });
      });
      const recipientInfo = `${o.customerName || ""} ${o.postalCode || ""} ${o.shippingAddress || ""}`;
      lineItems.forEach((li, idx) => {
        csvRows.push(
          [
            o.orderCode, li.type, li.name, li.code, li.color, li.qty, li.price, li.price * li.qty,
            o.marketCode, o.salesChannel, o.carrierService, o.paymentType, o.codCollectAmountNtd,
            recipientInfo, o.customerPhone || "", "", new Date(o.createdAt).toLocaleDateString("en-US"), "", `${idx + 1}/${lineItems.length}`,
          ]
            .map(csvCell)
            .join(",")
        );
      });
    });
    downloadCsv(`CPSquare_TCAT_19col_${Date.now()}.csv`, csvRows.join("\n"));
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-5 flex-wrap gap-3">
        <div>
          <h1 className="disp text-2xl font-bold">Fulfillment Packing</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Orders grouped into carrier buckets. Each order shows a dynamic checklist built from exactly what was selected at intake.</p>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
      ) : orders.length === 0 ? (
        <Empty title="No orders pending pack" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px,1fr))", gap: 16 }}>
          {CARRIERS.map((c) => {
            const list = buckets[c.code];
            return (
              <Card key={c.code} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                  <div className="disp" style={{ fontWeight: 700, fontSize: 14 }}>
                    {c.name} <span style={{ color: "var(--text-faint)", fontWeight: 500, fontSize: 12 }}>· Picking list ({list.length})</span>
                  </div>
                  {c.code === "TCAT" ? (
                    <button onClick={exportTCat19} disabled={list.length === 0} style={{ ...btnGhost, opacity: list.length === 0 ? 0.4 : 1 }}>⭳ T-Cat 19-col export</button>
                  ) : (
                    <button onClick={() => exportCarrierCsv(c.code)} disabled={list.length === 0} style={{ ...btnGhost, opacity: list.length === 0 ? 0.4 : 1 }}>⭳ Bulk Excel export</button>
                  )}
                </div>
                {list.length === 0 && <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No orders in this bucket.</div>}
                {list.map((o) => (
                  <div key={o.orderId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                    <div>
                      <div className="mono" style={{ fontSize: 12.5, fontWeight: 700 }}>{o.orderCode}</div>
                      <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{o.items.length} phone(s) → {o.customerName}</div>
                    </div>
                    <button onClick={() => setActive(o)} style={btnPrimary}>Scan &amp; Pack</button>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
      )}

      {active && (
        <PackScanModal
          order={active}
          onClose={() => setActive(null)}
          onCompleted={() => { setActive(null); load(); }}
        />
      )}
    </div>
  );
}

function PackScanModal({
  order, onClose, onCompleted,
}: { order: PackingOrder; onClose: () => void; onCompleted: () => void }) {
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  const [scanErrors, setScanErrors] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const allScanned = order.items.every((i) => scanned.has(i.imeiSerial));
  const allChecked = order.accessories.every((a) => checked.has(a.accessoryRowId));

  // Accepts input from either a hardware scan gun (keyboard emulation, Enter
  // to submit) or the live camera decoder — both funnel through here and get
  // validated against the exact IMEI expected for this line item.
  function handleScan(expectedImei: string, raw: string) {
    const cleaned = raw.trim();
    if (cleaned === expectedImei) {
      setScanned((s) => new Set(s).add(expectedImei));
      setScanErrors((e) => {
        if (!(expectedImei in e)) return e;
        const next = { ...e };
        delete next[expectedImei];
        return next;
      });
    } else {
      setScanErrors((e) => ({ ...e, [expectedImei]: `Mã quét được (${cleaned}) không khớp IMEI của đơn hàng.` }));
    }
  }

  async function complete() {
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/packing/${order.orderId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmedImeis: Array.from(scanned),
        confirmedAccessoryIds: Array.from(checked),
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || "Failed to complete."); return; }
    onCompleted();
  }

  return (
    <ModalShell onClose={onClose} title={`Pack order ${order.orderCode}`} wide>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Scan each device IMEI ({order.items.length})
      </div>
      {order.items.map((it) => {
        const done = scanned.has(it.imeiSerial);
        return (
          <div key={it.imeiSerial} style={{ position: "relative", background: "var(--ink)", color: "#fff", borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: "#8891A0" }}>{it.modelName}{it.color ? ` · ${it.color}` : ""}</div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{it.imeiSerial}</div>
              </div>
              {done ? (
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ok)" }}>✓ Matched</span>
              ) : (
                <div style={{ minWidth: 260, flex: "1 1 260px" }}>
                  <ImeiScanField onScan={(raw) => handleScan(it.imeiSerial, raw)} />
                </div>
              )}
            </div>
            {!done && scanErrors[it.imeiSerial] && (
              <div style={{ fontSize: 11.5, color: "#FCA5A5", marginTop: 8 }}>{scanErrors[it.imeiSerial]}</div>
            )}
          </div>
        );
      })}

      {order.accessories.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Dynamic accessory checklist
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {order.accessories.map((a) => (
              <label key={a.accessoryRowId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff" }}>
                <input
                  type="checkbox"
                  checked={checked.has(a.accessoryRowId)}
                  onChange={(e) => {
                    setChecked((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(a.accessoryRowId); else next.delete(a.accessoryRowId);
                      return next;
                    });
                  }}
                />
                Confirm packed: {a.accessoryName}
              </label>
            ))}
          </div>
        </>
      )}

      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      <button
        disabled={!allScanned || !allChecked || submitting}
        onClick={complete}
        style={{ ...btnPrimary, width: "100%", opacity: !allScanned || !allChecked || submitting ? 0.5 : 1 }}
      >
        {submitting ? "Completing…" : "🖨 Print shipping label & complete packing"}
      </button>
    </ModalShell>
  );
}
