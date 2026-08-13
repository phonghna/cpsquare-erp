import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { appUsers } from "@/lib/schema";
import { getSession } from "@/lib/auth";
import { and, eq, ilike, ne, or } from "drizzle-orm";

export const TEAMS = ["DZ", "DZG", "DZV", "DZT", "Repair", "CS"];

// Autocomplete source for the compose recipient picker — matches individual
// users (by user_id / username / display_name) and the hard-coded team list.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) {
    return NextResponse.json({ users: [], teams: [] });
  }

  const db = getDb();
  const users = await db
    .select({ userId: appUsers.userId, username: appUsers.username, displayName: appUsers.displayName })
    .from(appUsers)
    .where(
      and(
        eq(appUsers.isActive, true),
        ne(appUsers.userId, session.userId),
        or(
          ilike(appUsers.userId, `%${q}%`),
          ilike(appUsers.username, `%${q}%`),
          ilike(appUsers.displayName, `%${q}%`)
        )
      )
    )
    .limit(8);

  const teams = TEAMS.filter((t) => t.toLowerCase().includes(q.toLowerCase()));

  return NextResponse.json({ users, teams });
}
