"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CameraScanModal } from "@/components/ImeiScanner";

// A persistent camera-scan search button available on every dashboard page —
// point it at an IMEI barcode or an order's shipping label and it figures
// out what was scanned and jumps straight to the right screen:
//   - device IMEI            -> Inventory, pre-filled search (stock check / find item)
//   - order awaiting packing -> Packing, auto-opens that order's Scan & Pack modal
//   - any other known order  -> Orders, pre-filled search (confirm / look up order)
export default function GlobalScanButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function handleDetect(raw: string) {
    setOpen(false);
    const code = raw.trim();
    if (!code) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`/api/search?code=${encodeURIComponent(code)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(data.error || "Search failed."); return; }
      if (data.type === "inventory") {
        router.push(`/inventory?q=${encodeURIComponent(data.imeiSerial)}`);
      } else if (data.type === "order") {
        if (data.needsPacking) router.push(`/packing?openOrder=${encodeURIComponent(data.orderId)}`);
        else router.push(`/orders?q=${encodeURIComponent(data.orderCode)}`);
      } else {
        setNotice(`No match found for "${code}".`);
      }
    } catch {
      setNotice("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={busy}
        className="global-scan-btn"
        aria-label="Scan to search"
        title="Scan barcode/IMEI to search"
      >
        {busy ? "…" : "🔍"}
      </button>
      {open && (
        <CameraScanModal
          title="Scan to search (IMEI or order code)"
          onDetect={handleDetect}
          onClose={() => setOpen(false)}
        />
      )}
      {notice && (
        <div className="global-scan-toast" onClick={() => setNotice("")}>
          {notice} <span style={{ opacity: 0.7 }}>(tap to dismiss)</span>
        </div>
      )}
    </>
  );
}
