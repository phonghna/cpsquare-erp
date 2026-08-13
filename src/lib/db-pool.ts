import { Pool } from "@neondatabase/serverless";

// The lightweight `db` in db.ts (neon-http) is great for reads but cannot run
// multi-statement transactions. Anything that must lock a row (e.g. claiming
// an IMEI so two staff can't grab the same phone at once) goes through this
// pooled connection instead, using real BEGIN/COMMIT + SELECT ... FOR UPDATE.
//
// The connection is created lazily on first use (not at module-import time)
// so builds don't fail just because DATABASE_URL isn't visible yet.
let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add it in your Vercel project's Environment Variables, then redeploy."
    );
  }
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}
