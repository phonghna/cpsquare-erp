// Two physical Taiwan warehouses. Fixed 2-value code on product_items —
// see IMEI_Inventory_Two_Warehouses_Spec.md for the design rationale.

export const WAREHOUSE_CODES = ["XINSHENG", "TONGHUA"] as const;
export type WarehouseCode = (typeof WAREHOUSE_CODES)[number];

export const WAREHOUSE_LABELS: Record<string, string> = {
  XINSHENG: "CPSquare Warehouse — Xinsheng N Rd",
  TONGHUA: "CPSquare Warehouse — Tonghua St",
};

export const WAREHOUSE_SHORT_LABELS: Record<string, string> = {
  XINSHENG: "Xinsheng N Rd",
  TONGHUA: "Tonghua St",
};

export function warehouseLocationLabel(code: string | null | undefined): string {
  return WAREHOUSE_LABELS[code || "XINSHENG"] || WAREHOUSE_LABELS.XINSHENG;
}

export function otherWarehouse(code: string): WarehouseCode {
  return code === "XINSHENG" ? "TONGHUA" : "XINSHENG";
}

// Statuses where a device is physically sitting in a warehouse. For these,
// `currentLocation` is DERIVED from `warehouseCode` at read time rather than
// hand-set by whichever route last changed status — the two concepts are
// kept independent so they never drift out of sync. SHIPPED also shows the
// warehouse label (its "last known" warehouse, since warehouseCode is never
// reset when a device ships out).
export const WAREHOUSE_SITTING_STATUSES = ["IN_STOCK", "RESERVED", "MEDIA_HOLD", "PACKING"];

export function deriveDisplayLocation(status: string, warehouseCode: string | null | undefined, currentLocation: string): string {
  if (WAREHOUSE_SITTING_STATUSES.includes(status) || status === "SHIPPED") {
    return warehouseLocationLabel(warehouseCode);
  }
  return currentLocation;
}
