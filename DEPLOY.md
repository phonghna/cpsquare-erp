# CPSquare ERP — Deploy Guide

## What's real vs. what's a placeholder

**Fully working, backed by a real Neon database, tested end-to-end:**
- Auth (login/logout, bcrypt password hashing, signed session cookies)
- RBAC route protection (middleware/proxy blocks pages your role can't see)
- Executive Dashboard (real aggregate SQL queries)
- Multi-channel Orders (create + list) — **transaction-safe IMEI claiming**:
  tested with sequential *and* was designed against Postgres's standard
  `SELECT ... FOR UPDATE SKIP LOCKED` pattern so two staff can never be
  assigned the same physical phone.
- IMEI Inventory (list + Check-out Live / Check-in / Media Hold)

**Placeholder pages (nav works, no 404, but no data yet):** Accessories,
Livestream Rotation, Fulfillment Packing, Shipment Tracking, Installment Debt
Board, 1-Click Returns, Repair/RMA, Price Book, Announcements, Internal
Mailbox, Audit Trail Logs, User Management. The database tables for all of
these already exist (see `db/01_schema.sql`) — only the page UI + API routes
still need to be built. This is the natural place to continue.

## Why this app manages its own login (not Better Auth)

If you were also building a separate project in v0 with Better Auth, this
codebase is intentionally **standalone** — it has its own `app_users` table
and its own bcrypt + session-cookie auth, because I don't have visibility
into your v0 project's exact Better Auth schema and guessing wrong would
silently break logins. Pick ONE of these two codebases going forward; if you
want, I can adapt this one to call Better Auth's API instead later.

## Step 1 — Create the database

1. In your Neon project's SQL Editor, run `db/01_schema.sql` (creates every
   table, including `app_users`).
2. Run `db/02_seed_test_users.sql` (creates the 11 test accounts —
   `ichibond` / `csvietnam` / `streamer01` / etc. — all password `123456`,
   already correctly bcrypt-hashed, ready to log in immediately).
3. (Optional, to test Orders) insert a few IMEI units, e.g.:
   ```sql
   INSERT INTO product_items (imei_serial, variant_id, battery_health, cosmetic_condition, status)
   VALUES ('356938035643809','IP14PM-256-BLK',98,'Like new','IN_STOCK');
   ```

## Step 2 — Push this code to GitHub

```bash
cd cpsquare-app
git init
git add .
git commit -m "CPSquare ERP starter — auth, dashboard, orders, inventory"
git branch -M main
git remote add origin https://github.com/<your-username>/cpsquare-erp.git
git push -u origin main
```

## Step 3 — Import into Vercel

1. vercel.com → **Add New Project** → import the GitHub repo you just pushed.
2. In **Environment Variables**, add:
   - `DATABASE_URL` — your Neon connection string (use the **pooled**
     connection string from Neon's dashboard, not the direct one)
   - `AUTH_SECRET` — any long random string (`openssl rand -base64 32`)
3. Click **Deploy**.

## Step 4 — Test it

Visit your new `*.vercel.app` URL → sign in as `ichibond` / `123456` → you
should land on the Executive Dashboard. Try `csvietnam` / `123456` to see the
CS role's narrower nav (no Dashboard, no User Management).

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL + AUTH_SECRET
npm run dev
```

## Recommended way to build out the remaining modules

Each remaining module follows the exact same pattern as Orders/Inventory:
1. Add any missing Drizzle fields to `src/lib/schema.ts` (most are already
   there — the schema was written to cover the whole spec up front).
2. Add a route under `src/app/api/<module>/route.ts` for reads, and a
   `[id]/action/route.ts` for state-changing actions that need row locking
   (copy the transaction pattern from `src/app/api/orders/route.ts`).
3. Replace the placeholder in `src/app/(dashboard)/<module>/page.tsx` with a
   real page (copy the pattern from `inventory/page.tsx`).

Given how much repetitive, interlocking work this is across ~12 remaining
modules, doing this inside **Claude Code** (rather than back in this chat)
will go faster: it keeps the whole codebase in context across many sessions,
can run `npm run dev` / `npm run build` itself after every change, and won't
lose track of earlier files the way a long chat conversation eventually
will.
