-- ============================================================================
-- CPSQUARE ERP — COMPLETE DATABASE SCHEMA FOR NEON (PostgreSQL)
-- Compatible with an existing Better Auth setup: "user", "session",
-- "account", "verification" tables are assumed to already exist and are
-- NEVER modified by this script. Everything here references user.id only.
-- ============================================================================
-- HOW TO RUN:
--   1. Open your Neon project → SQL Editor.
--   2. Paste this entire file, click Run. It is idempotent (safe to re-run).
--   3. See the companion instructions for attaching roles to your 11 test
--      accounts AFTER you create them through the app's normal sign-up flow.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. APP USERS — this standalone build owns its own authentication
--    (bcrypt password hashes + signed session cookies), independent of any
--    external auth provider.
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_users (
  user_id                   TEXT PRIMARY KEY,
  username                  TEXT NOT NULL UNIQUE,
  display_name              TEXT NOT NULL,
  password_hash             TEXT NOT NULL,
  role                      TEXT NOT NULL DEFAULT 'CS'
                             CHECK (role IN ('ADMIN','MANAGER','CS','STREAMER','PACKING','TECH')),
  team_allocation           TEXT,
  require_password_change   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_market_access (
  user_id      TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  market_code  TEXT NOT NULL CHECK (market_code IN ('VN','ID','TH','PH')),
  PRIMARY KEY (user_id, market_code)
);

-- ============================================================================
-- 2. PRODUCT CATALOG — serialized phones (IMEI) vs quantity-based accessories
-- ============================================================================
CREATE TABLE IF NOT EXISTS categories (
  category_id    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category_name  TEXT NOT NULL UNIQUE     -- 'Smartphones','Chargers','Cases','Gifts'...
);

CREATE TABLE IF NOT EXISTS product_variants (
  variant_id       TEXT PRIMARY KEY,              -- human-readable SKU, e.g. 'IP14PM-256-BLK'
  category_id      TEXT REFERENCES categories(category_id),
  brand            TEXT,
  model_group      TEXT NOT NULL,                 -- used to match compatible accessories, e.g. 'iPhone 14 Pro Max'
  model_name       TEXT NOT NULL,                 -- full display name incl. storage, e.g. 'iPhone 14 Pro Max 256GB'
  storage          TEXT,
  color            TEXT,
  selling_price_ntd DECIMAL(10,2) NOT NULL,        -- base retail price (NTD) — Admin edits only
  is_serialized    BOOLEAN NOT NULL DEFAULT TRUE,  -- TRUE = phone tracked by IMEI; FALSE = accessory tracked by qty
  stock_quantity   INT NOT NULL DEFAULT 0,         -- only meaningful when is_serialized = FALSE
  reserved_quantity INT NOT NULL DEFAULT 0,        -- only meaningful when is_serialized = FALSE
  compatible_model TEXT,                           -- only meaningful when is_serialized = FALSE; NULL = fits all models
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. PHYSICAL IMEI INVENTORY — centralized Taiwan warehouse pool
-- ============================================================================
CREATE TABLE IF NOT EXISTS product_items (
  imei_serial        TEXT PRIMARY KEY,
  variant_id          TEXT NOT NULL REFERENCES product_variants(variant_id),
  battery_health      INT,
  cosmetic_condition  TEXT,
  status              TEXT NOT NULL DEFAULT 'IN_STOCK'
                       CHECK (status IN ('IN_STOCK','CHECKED_OUT_LIVE','RESERVED','PACKING','SHIPPED','REPAIRING','MEDIA_HOLD')),
  current_location    TEXT NOT NULL DEFAULT 'CPSquare Warehouse (TW)',
  order_id            TEXT,                        -- set while RESERVED/PACKING/SHIPPED; FK added below after orders exists
  rma_stage           TEXT CHECK (rma_stage IN ('RECEIVE','INSPECTION','REPAIRING','REPAIR_DONE','SENT_OUT')),
  updated_by_user_id  TEXT REFERENCES app_users(user_id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_items_status ON product_items(status);
CREATE INDEX IF NOT EXISTS idx_product_items_variant ON product_items(variant_id);

-- ============================================================================
-- 4. ORDERS — multi-item, multi-payment-type, monthly-reset order codes
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
  order_id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_code                TEXT NOT NULL UNIQUE,   -- [Market][Seq][Month][Year], e.g. V1JAN2026 — reset monthly per market
  market_code                TEXT NOT NULL CHECK (market_code IN ('VN','ID','TH','PH')),
  sales_channel               TEXT NOT NULL,         -- 'TikTok','Facebook','Line'
  customer_name               TEXT NOT NULL,
  customer_social_handle      TEXT,
  customer_phone              TEXT,
  postal_code                 TEXT,
  shipping_address            TEXT NOT NULL,
  carrier_service              TEXT NOT NULL CHECK (carrier_service IN ('711','FAMILY','TCAT')),
  tracking_number              TEXT,
  payment_type                 TEXT NOT NULL CHECK (payment_type IN ('COD','DOWNPAYMENT_COD','INSTALLMENT')),
  total_invoice_amount_ntd     DECIMAL(10,2) NOT NULL,
  downpayment_received_ntd     DECIMAL(10,2) NOT NULL DEFAULT 0,
  cod_collect_amount_ntd       DECIMAL(10,2) NOT NULL DEFAULT 0,
  remaining_balance_ntd        DECIMAL(10,2) NOT NULL DEFAULT 0,
  installment_term_months      INT,                  -- 3 / 6 / 9 / 12, only when payment_type = INSTALLMENT
  shipment_status               TEXT NOT NULL DEFAULT 'PENDING_PACK'
                                 CHECK (shipment_status IN ('PENDING_PACK','PACKED','SHIPPED','DELIVERED','RETURNED','CANCELLED','DELIVERY_FAILED')),
  cancel_reason                 TEXT,
  price_approved_by_user_id     TEXT REFERENCES app_users(user_id),
  created_by_user_id            TEXT REFERENCES app_users(user_id),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  packed_at                     TIMESTAMPTZ,
  shipped_at                    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orders_market ON orders(market_code);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(shipment_status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_product_items_order') THEN
    ALTER TABLE product_items
      ADD CONSTRAINT fk_product_items_order
      FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE SET NULL;
  END IF;
END $$;

-- Sequence tracker used by the app to generate order_code (reset monthly per market)
CREATE TABLE IF NOT EXISTS order_code_counters (
  market_code   TEXT NOT NULL CHECK (market_code IN ('VN','ID','TH','PH')),
  year_month    TEXT NOT NULL,        -- 'YYYY-MM'
  last_sequence INT NOT NULL DEFAULT 0,
  PRIMARY KEY (market_code, year_month)
);

CREATE TABLE IF NOT EXISTS order_items (
  item_id      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id     TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  variant_id   TEXT NOT NULL REFERENCES product_variants(variant_id),
  imei_serial  TEXT NOT NULL REFERENCES product_items(imei_serial),
  color        TEXT,
  item_price_ntd DECIMAL(10,2) NOT NULL   -- locked at order time, immune to later Price Book changes
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_accessories (
  accessory_row_id  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id           TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  variant_id          TEXT NOT NULL REFERENCES product_variants(variant_id),  -- is_serialized = FALSE row
  accessory_name      TEXT NOT NULL,
  is_verified          BOOLEAN NOT NULL DEFAULT FALSE   -- ticked during Dynamic Pack Checklist
);
CREATE INDEX IF NOT EXISTS idx_order_accessories_order ON order_accessories(order_id);

-- ============================================================================
-- 5. INSTALLMENTS — schedule auto-generated on DELIVERED, plus dunning log
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_schedules (
  schedule_id     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id         TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  period_number     INT NOT NULL,
  amount_due_ntd    DECIMAL(10,2) NOT NULL,
  due_date           DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','OVERDUE')),
  paid_receipt_url    TEXT,
  paid_at              TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_order ON payment_schedules(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_due ON payment_schedules(due_date) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS installment_dunning_logs (
  log_id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  schedule_id              TEXT NOT NULL REFERENCES payment_schedules(schedule_id) ON DELETE CASCADE,
  performed_by_user_id      TEXT NOT NULL REFERENCES app_users(user_id),
  contact_channel            TEXT NOT NULL CHECK (contact_channel IN ('LINE','TIKTOK','PHONE','FACEBOOK')),
  dunning_result              TEXT NOT NULL,
  promised_payment_date        DATE,
  cs_notes                     TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. AUDIT TRAIL — Order_Logs, IMEI_Logs, Price_Change_Logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_logs (
  log_id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id             TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  action_type           TEXT NOT NULL,   -- ORDER_CREATED, ORDER_EDITED, PRICE_OVERRIDE_APPROVED, PACKED,
                                          -- TRACKING_ASSIGNED, DELIVERED, CANCELLED, DELIVERY_FAILED,
                                          -- RETURN_PROCESSED, RETURNED_TO_INSPECTION,
                                          -- INSTALLMENT_SCHEDULE_GENERATED, INSTALLMENT_PAID
  performed_by_user_id   TEXT NOT NULL REFERENCES app_users(user_id),
  note                    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_logs_order ON order_logs(order_id);

CREATE TABLE IF NOT EXISTS imei_logs (
  log_id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  imei_serial            TEXT NOT NULL,
  status_from              TEXT,
  status_to                TEXT NOT NULL,
  related_order_id          TEXT REFERENCES orders(order_id),
  performed_by_user_id       TEXT NOT NULL REFERENCES app_users(user_id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_imei_logs_imei ON imei_logs(imei_serial);

CREATE TABLE IF NOT EXISTS price_change_logs (
  log_id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  variant_id              TEXT NOT NULL REFERENCES product_variants(variant_id),
  order_id                 TEXT REFERENCES orders(order_id),  -- NULL if it was a Price Book base-price edit
  approved_by_user_id       TEXT NOT NULL REFERENCES app_users(user_id),
  note                       TEXT NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7. ANNOUNCEMENTS — header-blinking banner, scheduled, soft-delete
-- ============================================================================
CREATE TABLE IF NOT EXISTS announcements (
  announcement_id     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title                 TEXT NOT NULL,
  content                TEXT NOT NULL,
  priority                TEXT NOT NULL DEFAULT 'URGENT' CHECK (priority IN ('NORMAL','IMPORTANT','URGENT')),
  target_markets           TEXT NOT NULL DEFAULT 'ALL',   -- 'ALL' or comma-separated e.g. 'VN,TH'
  start_datetime             TIMESTAMPTZ NOT NULL,
  expiration_datetime          TIMESTAMPTZ NOT NULL,
  is_blinking                   BOOLEAN NOT NULL DEFAULT TRUE,
  is_active                      BOOLEAN NOT NULL DEFAULT TRUE,   -- Delete action sets this to FALSE
  created_by_user_id              TEXT NOT NULL REFERENCES app_users(user_id),
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcements_active_window
  ON announcements(is_active, start_datetime, expiration_datetime);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id  TEXT NOT NULL REFERENCES announcements(announcement_id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  read_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

-- ============================================================================
-- 8. INTERNAL MAILBOX — pure autocomplete, multi-recipient, team broadcast
-- ============================================================================
CREATE TABLE IF NOT EXISTS internal_messages (
  message_id   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sender_id     TEXT NOT NULL REFERENCES app_users(user_id),
  subject        TEXT NOT NULL,
  body            TEXT NOT NULL,
  parent_id        TEXT REFERENCES internal_messages(message_id),  -- set for replies
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_recipients (
  recipient_row_id  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id         TEXT NOT NULL REFERENCES internal_messages(message_id) ON DELETE CASCADE,
  receiver_user_id     TEXT NOT NULL REFERENCES app_users(user_id),
  is_read               BOOLEAN NOT NULL DEFAULT FALSE,
  read_at                TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_message_recipients_receiver ON message_recipients(receiver_user_id, is_read);

-- ============================================================================
-- 9. REFERENCE / SEED DATA that does NOT depend on Better Auth user rows
--    (safe to run immediately — no accounts required for this part)
-- ============================================================================
INSERT INTO categories (category_name) VALUES
  ('Smartphones'), ('Chargers'), ('Cases'), ('Gifts')
ON CONFLICT (category_name) DO NOTHING;

INSERT INTO product_variants (variant_id, category_id, brand, model_group, model_name, storage, color, selling_price_ntd, is_serialized)
SELECT v.variant_id, c.category_id, v.brand, v.model_group, v.model_name, v.storage, v.color, v.price, TRUE
FROM (VALUES
  ('IP14PM-256-BLK','Apple','iPhone 14 Pro Max','iPhone 14 Pro Max 256GB','256GB','Black',38900),
  ('IP14PM-512-GLD','Apple','iPhone 14 Pro Max','iPhone 14 Pro Max 512GB','512GB','Gold',44900),
  ('SGS23U-256-GRN','Samsung','Galaxy S23 Ultra','Samsung Galaxy S23 Ultra 256GB','256GB','Green',32900),
  ('SGS23U-512-BLK','Samsung','Galaxy S23 Ultra','Samsung Galaxy S23 Ultra 512GB','512GB','Black',37900),
  ('PXL7PRO-128-WHT','Google','Pixel 7 Pro','Google Pixel 7 Pro 128GB','128GB','White',24900)
) AS v(variant_id, brand, model_group, model_name, storage, color, price)
JOIN categories c ON c.category_name = 'Smartphones'
ON CONFLICT (variant_id) DO NOTHING;

INSERT INTO product_variants (variant_id, category_id, model_group, model_name, color, selling_price_ntd, is_serialized, stock_quantity, compatible_model)
SELECT v.variant_id, c.category_id, v.model_group, v.model_group, v.color, v.price, FALSE, v.qty, v.compat
FROM (VALUES
  ('SKU-CASE-IP14PM','Cases','Jelly Case (iPhone 14 Pro Max)','Clear',190,26,'iPhone 14 Pro Max'),
  ('SKU-GLASS-IP14PM','Cases','Glass Protector (iPhone 14 Pro Max)','Clear',190,24,'iPhone 14 Pro Max'),
  ('SKU-CASE-S23U','Cases','Jelly Case (Galaxy S23 Ultra)','Clear',190,20,'Galaxy S23 Ultra'),
  ('SKU-GLASS-S23U','Cases','Glass Protector (Galaxy S23 Ultra)','Clear',190,18,'Galaxy S23 Ultra'),
  ('SKU-CASE-PXL7','Cases','Jelly Case (Pixel 7 Pro)','Clear',190,16,'Pixel 7 Pro'),
  ('SKU-GLASS-PXL7','Cases','Glass Protector (Pixel 7 Pro)','Clear',190,15,'Pixel 7 Pro'),
  ('SKU-POWERBANK','Chargers','Power Bank','Black',690,22,NULL),
  ('SKU-CHARGE-CABLE','Chargers','Charging Cable','White',290,71,NULL),
  ('SKU-CHARGER-20W','Chargers','20W Fast Charger','White',590,40,NULL),
  ('SKU-GIFT-POUCH','Gifts','Branded Gift Pouch','Navy',0,100,NULL)
) AS v(variant_id, category_name, model_group, color, price, qty, compat)
JOIN categories c ON c.category_name = v.category_name
ON CONFLICT (variant_id) DO NOTHING;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
