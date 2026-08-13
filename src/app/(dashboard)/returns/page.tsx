"use client";

import { useEffect, useState } from "react";
import { StatusPill, SHIPMENT_META, Card, Field, inputStyle, btnPrimary } from "@/components/ui";

type Item = { imeiSerial: string; status: string; currentLocation: string; variantId: string; modelName: string };
type Order = { orderId: string; orderCode: string; customerName: string; shippingAddress: string; shipmentStatus: string; marketCode: string };

export default function ReturnsPage() {
  const [imei, setImei] = useState("");
  const [item, setItem] = useState<Item | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [samples, setSamples] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    fetch("/api/returns/samples").then((r) => r.json()).then((d) => setSamples(d.imeis || []));
  }, []);

  async function search(imeiValue?: string) {
    const q = (imeiValue ?? imei).trim();
    if (!q) return;
    setSearching(true);
    setError("");
    setDone("");
    setItem(null);
    setOrder(null);
    const res = await fetch(`/api/returns/lookup?imei=${encodeURIComponent(q)}`);
    const data = await res.json();
    setSearching(false);
    if (!res.ok) { setError(data.error || "No device found with this IMEI."); return; }
    setItem({
      imeiSerial: data.item.imei_serial,
      status: data.item.status,
      currentLocation: data.item.current_location,
      variantId: data.item.variant_id,
      modelName: data.item.model_name,
    });
    setOrder(
      data.order
        ? {
            orderId: data.order.order_id,
            orderCode: data.order.order_code,
            customerName: data.order.customer_name,
            shippingAddress: data.order.shipping_address,
            shipmentStatus: data.order.shipment_status,
            marketCode: data.order.market_code,
          }
        : null
    );
  }

  async function act(action: "RESTOCK" | "REPAIR") {
    if (!item) return;
    setActing(true);
    setError("");
    const res = await fetch(`/api/returns/${item.imeiSerial}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setActing(false);
    if (!res.ok) { setError(data.error || "Failed."); return; }
    setDone(action === "RESTOCK" ? `IMEI ${item.imeiSerial} re-entered stock.` : `IMEI ${item.imeiSerial} moved to REPAIRING.`);
    setItem(null);
    setOrder(null);
    setImei("");
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="disp text-2xl font-bold">1-Click Returns</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Scan the returned IMEI — the system auto-traces the original order. Resolve with a single click.</p>
      </div>

      <Card style={{ padding: 20, maxWidth: 640 }}>
        <Field label="Scan / enter the returned device's IMEI">
          <input
            value={imei}
            onChange={(e) => setImei(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Enter 15-digit IMEI..."
            style={inputStyle}
          />
        </Field>

        {samples.length > 0 && !item && (
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>
            Try a demo IMEI:{" "}
            {samples.map((im) => (
              <span
                key={im}
                className="mono"
                onClick={() => { setImei(im); search(im); }}
                style={{ cursor: "pointer", color: "var(--accent-dark, var(--accent))", fontWeight: 600, marginRight: 8 }}
              >
                {im}
              </span>
            ))}
          </div>
        )}

        {error && <div style={{ marginTop: 16, fontSize: 13, color: "var(--danger)" }}>{error}</div>}
        {done && <div style={{ marginTop: 16, fontSize: 13, color: "var(--ok)" }}>{done}</div>}

        {item && (
          <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 4 }}>Original order traced</div>
            <div className="disp" style={{ fontWeight: 700, fontSize: 16 }}>
              {order ? order.orderCode : "—"}
              {order && order.shipmentStatus === "DELIVERY_FAILED" && (
                <span style={{ marginLeft: 8 }}><StatusPill status="DELIVERY_FAILED" meta={SHIPMENT_META} /></span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>
              {order ? `${order.customerName} · ${item.modelName}` : item.modelName}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button onClick={() => act("RESTOCK")} disabled={acting} style={{ ...btnPrimary, background: "var(--ok)", opacity: acting ? 0.6 : 1 }}>
                {acting ? "…" : "✓ Re-stock — IN STOCK"}
              </button>
              <button onClick={() => act("REPAIR")} disabled={acting} style={{ ...btnPrimary, background: "var(--danger)", opacity: acting ? 0.6 : 1 }}>
                {acting ? "…" : "⚠ Queue for repair — REPAIRING"}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
