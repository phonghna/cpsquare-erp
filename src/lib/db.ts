import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Constructed lazily on first real use — NOT at module-import time — so that
// Next.js's build-time route "collection" step (which imports every API
// route module just to read its exports) never fails just because
// DATABASE_URL isn't visible during that step. The error still surfaces
// clearly the moment a request actually tries to query without it set.
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add it in your Vercel project's Environment Variables (copy the connection string from your Neon project), then redeploy."
    );
  }
  const sql = neon(process.env.DATABASE_URL);
  _db = drizzle(sql, { schema });
  return _db;
}
