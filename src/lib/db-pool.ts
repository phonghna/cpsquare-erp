import { Pool } from "@neondatabase/serverless";

// The lightweight `db` in db.ts (neon-http) is great for reads but cannot run
// multi-statement transactions. Anything that must lock a row (e.g. claiming
// an IMEI so two staff can't grab the same phone at once) goes through this
// pooled connection instead, using real BEGIN/COMMIT + SELECT ... FOR UPDATE.
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}
