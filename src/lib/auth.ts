import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

const COOKIE_NAME = "cpsquare_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Add it in your Vercel project's Environment Variables (any long random string, e.g. generate with `openssl rand -base64 32`)."
    );
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  team: string | null;
  markets: string[];
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// Role -> which pages/nav items a user may access. Mirrors the RBAC matrix
// from the CPSquare ERP specification (v8.6).
export const ROLE_PAGES: Record<string, string[]> = {
  ADMIN: [
    "dashboard", "orders", "inventory", "accessories", "live", "packing",
    "tracking", "installments", "returns", "rma", "pricebook",
    "announcements", "mailbox", "auditlogs", "usermgmt",
  ],
  MANAGER: [
    "dashboard", "orders", "inventory", "accessories", "live", "packing",
    "tracking", "installments", "returns", "rma", "pricebook", "mailbox", "auditlogs",
  ],
  CS: ["orders", "inventory", "live", "tracking", "installments", "returns", "mailbox"],
  STREAMER: ["orders", "inventory", "live", "tracking", "installments", "returns", "mailbox"],
  PACKING: ["packing", "inventory", "tracking", "accessories", "mailbox"],
  TECH: ["rma", "inventory", "mailbox"],
};

export function canAccessPage(role: string, page: string): boolean {
  return (ROLE_PAGES[role] || []).includes(page);
}

// Inventory operate rights (Media Hold / Live Check-out): everyone except CS.
export function canOperateInventory(role: string): boolean {
  return role !== "CS";
}

// Setting a device to MISSING or WHOLESALE is a loss/sale-reporting action —
// more sensitive than a normal Check-out/Check-in, so it's restricted to
// Admin and Manager only (the "Set status" override on Inventory rows).
export function canSetSensitiveInventoryStatus(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

// Drives the market picker in User Management: ADMIN/PACKING/TECH always
// serve every market so their user_market_access rows are all 4, fixed;
// MANAGER gets a multi-select of an assigned subset; CS/STREAMER get exactly
// one market each.
export const ROLE_SCOPE: Record<string, "ALL" | "MULTI" | "SINGLE"> = {
  ADMIN: "ALL",
  PACKING: "ALL",
  TECH: "ALL",
  MANAGER: "MULTI",
  CS: "SINGLE",
  STREAMER: "SINGLE",
};
