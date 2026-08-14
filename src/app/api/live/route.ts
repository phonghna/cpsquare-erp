import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { productItems, productVariants } from "@/lib/schema";
import { getSession, canAccessPage } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const MARKET_NAMES: Record<string, string> = { VN: "Vietnam", ID: "Indonesia", TH: "Thailand", PH: "Philippines" };
const MARKETS = ["VN", "ID", "TH", "PH"];

// Manager/CS/Streamer accounts are routed to a livestream room by their team
// allocation, not by their raw market list — this gives every account a
// single, unambiguous room regardless of how many markets they can see.
export const TEAM_MARKET: Record<string, string> = { DZ: "ID", DZV: "VN", DZG: "PH", DZT: "TH" };

// Resolves which room (key + display label) an account's check-outs belong
// in. Admins always get their own dedicated room. Everyone else is routed by
// team_allocation via TEAM_MARKET. Returns null if the account's team
// doesn't map to any known room (e.g. Packing/Tech, or no team set).
export function roomFor(role: string, team: string | null): { key: string; label: string } | null {
  if (role === "ADMIN") return { key: "ADMIN", label: "Admin" };
  const marketCode = team ? TEAM_MARKET[team] : undefined;
  if (marketCode) return { key: marketCode, label: MARKET_NAMES[marketCode] };
  return null;
}

const ROOM_KEYS = ["ADMIN", "VN", "ID", "TH", "PH"];
const ROOM_LABELS: Record<string, string> = { ADMIN: "Admin", ...MARKET_NAMES };

// All devices currently checked out to a live room, grouped by room.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessPage(session.role, "live")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = await db.select().from(productItems).where(eq(productItems.status, "CHECKED_OUT_LIVE"));
  const variants = await db.select({ variantId: productVariants.variantId, modelName: productVariants.modelName }).from(productVariants);
  const variantById = new Map(variants.map((v) => [v.variantId, v]));

  const byRoom: Record<string, any[]> = { ADMIN: [], VN: [], ID: [], TH: [], PH: [] };
  for (const row of rows) {
    const key = ROOM_KEYS.find((k) => row.currentLocation === ROOM_LABELS[k]);
    if (key) byRoom[key].push({ ...row, variant: variantById.get(row.variantId) || null });
  }

  const myRoom = roomFor(session.role, session.team)?.key || null;
  return NextResponse.json({ byRoom, myRoom, role: session.role, team: session.team });
}
