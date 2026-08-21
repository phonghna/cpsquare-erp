import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  decimal,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// This app owns its own authentication (bcrypt password hashes + signed
// session cookies) via app_users, so it works standalone without depending
// on an external auth provider's internal schema.
// ---------------------------------------------------------------------------

export const appUsers = pgTable("app_users", {
  userId: text("user_id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("CS"),
  teamAllocation: text("team_allocation"),
  requirePasswordChange: boolean("require_password_change").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userMarketAccess = pgTable(
  "user_market_access",
  {
    userId: text("user_id").notNull(),
    marketCode: text("market_code").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.marketCode] }) })
);

export const categories = pgTable("categories", {
  categoryId: text("category_id").primaryKey(),
  categoryName: text("category_name").notNull(),
});

export const productVariants = pgTable("product_variants", {
  variantId: text("variant_id").primaryKey(),
  categoryId: text("category_id"),
  brand: text("brand"),
  modelGroup: text("model_group").notNull(),
  modelName: text("model_name").notNull(),
  storage: text("storage"),
  color: text("color"),
  sellingPriceNtd: decimal("selling_price_ntd", { precision: 10, scale: 2 }).notNull(),
  isSerialized: boolean("is_serialized").notNull().default(true),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  reservedQuantity: integer("reserved_quantity").notNull().default(0),
  compatibleModel: text("compatible_model"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productItems = pgTable("product_items", {
  imeiSerial: text("imei_serial").primaryKey(),
  variantId: text("variant_id").notNull(),
  batteryHealth: integer("battery_health"),
  cosmeticCondition: text("cosmetic_condition"),
  status: text("status").notNull().default("IN_STOCK"),
  currentLocation: text("current_location").notNull().default("CPSquare Warehouse (TW)"),
  orderId: text("order_id"),
  rmaStage: text("rma_stage"),
  // Free-text context for a status change — mandatory (enforced in the API)
  // when status is set to MISSING, WHOLESALE, or OTHER, e.g. "Last seen at Live Room
  // #2, unaccounted for after Aug 20 stocktake".
  remark: text("remark"),
  // Stamped to now() by the API every time `status` changes (not on any row
  // update) — powers the "sorted by most recently edited" Reserved board.
  statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }).notNull().defaultNow(),
  // Which physical Taiwan warehouse this device's home base is. Persists
  // independently of `currentLocation`'s operational state (Live Room,
  // Technical Repair Room, etc.) so the device returns to the correct
  // warehouse when it comes back, not a hardcoded default.
  warehouseCode: text("warehouse_code").notNull().default("XINSHENG"),
  updatedByUserId: text("updated_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  orderId: text("order_id").primaryKey(),
  orderCode: text("order_code").notNull(),
  marketCode: text("market_code").notNull(),
  salesChannel: text("sales_channel").notNull(),
  customerName: text("customer_name").notNull(),
  customerSocialHandle: text("customer_social_handle"),
  customerPhone: text("customer_phone"),
  postalCode: text("postal_code"),
  shippingAddress: text("shipping_address").notNull(),
  carrierService: text("carrier_service").notNull(),
  trackingNumber: text("tracking_number"),
  paymentType: text("payment_type").notNull(),
  totalInvoiceAmountNtd: decimal("total_invoice_amount_ntd", { precision: 10, scale: 2 }).notNull(),
  downpaymentReceivedNtd: decimal("downpayment_received_ntd", { precision: 10, scale: 2 }).notNull().default("0"),
  codCollectAmountNtd: decimal("cod_collect_amount_ntd", { precision: 10, scale: 2 }).notNull().default("0"),
  remainingBalanceNtd: decimal("remaining_balance_ntd", { precision: 10, scale: 2 }).notNull().default("0"),
  installmentTermMonths: integer("installment_term_months"),
  shipmentStatus: text("shipment_status").notNull().default("PENDING_PACK"),
  cancelReason: text("cancel_reason"),
  priceApprovedByUserId: text("price_approved_by_user_id"),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  packedAt: timestamp("packed_at", { withTimezone: true }),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
});

export const orderItems = pgTable("order_items", {
  itemId: text("item_id").primaryKey(),
  orderId: text("order_id").notNull(),
  variantId: text("variant_id").notNull(),
  imeiSerial: text("imei_serial").notNull(),
  color: text("color"),
  itemPriceNtd: decimal("item_price_ntd", { precision: 10, scale: 2 }).notNull(),
});

export const orderAccessories = pgTable("order_accessories", {
  accessoryRowId: text("accessory_row_id").primaryKey(),
  orderId: text("order_id").notNull(),
  variantId: text("variant_id").notNull(),
  accessoryName: text("accessory_name").notNull(),
  isVerified: boolean("is_verified").notNull().default(false),
});

export const paymentSchedules = pgTable("payment_schedules", {
  scheduleId: text("schedule_id").primaryKey(),
  orderId: text("order_id").notNull(),
  periodNumber: integer("period_number").notNull(),
  amountDueNtd: decimal("amount_due_ntd", { precision: 10, scale: 2 }).notNull(),
  dueDate: date("due_date").notNull(),
  status: text("status").notNull().default("PENDING"),
  paidReceiptUrl: text("paid_receipt_url"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const orderLogs = pgTable("order_logs", {
  logId: text("log_id").primaryKey(),
  orderId: text("order_id").notNull(),
  actionType: text("action_type").notNull(),
  performedByUserId: text("performed_by_user_id").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const imeiLogs = pgTable("imei_logs", {
  logId: text("log_id").primaryKey(),
  imeiSerial: text("imei_serial").notNull(),
  statusFrom: text("status_from"),
  statusTo: text("status_to").notNull(),
  relatedOrderId: text("related_order_id"),
  performedByUserId: text("performed_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const announcements = pgTable("announcements", {
  announcementId: text("announcement_id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  priority: text("priority").notNull().default("URGENT"),
  targetMarkets: text("target_markets").notNull().default("ALL"),
  startDatetime: timestamp("start_datetime", { withTimezone: true }).notNull(),
  expirationDatetime: timestamp("expiration_datetime", { withTimezone: true }).notNull(),
  isBlinking: boolean("is_blinking").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const internalMessages = pgTable("internal_messages", {
  messageId: text("message_id").primaryKey(),
  senderId: text("sender_id").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  parentId: text("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageRecipients = pgTable("message_recipients", {
  recipientRowId: text("recipient_row_id").primaryKey(),
  messageId: text("message_id").notNull(),
  receiverUserId: text("receiver_user_id").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
});
