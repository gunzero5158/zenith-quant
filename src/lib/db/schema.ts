import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// All money amounts are stored in cents (分) as integers to avoid float errors.
// All timestamps are epoch milliseconds.

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: integer("email_verified_at"),
    freeUsesRemaining: integer("free_uses_remaining").notNull().default(2),
    balanceCents: integer("balance_cents").notNull().default(0),
    isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
);

export const verificationCodes = sqliteTable("verification_codes", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastSentAt: integer("last_sent_at").notNull(),
});

export const creditLedger = sqliteTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    // Positive = credit (topup/refund), negative = debit (charge). free_use rows are 0.
    deltaCents: integer("delta_cents").notNull(),
    type: text("type", { enum: ["charge", "refund", "topup", "free_use"] }).notNull(),
    // charge/refund: analysis request id; topup: stripe session id
    refId: text("ref_id"),
    note: text("note"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_ledger_user").on(t.userId, t.createdAt),
    // Admin stats filter by type (+date) — without this the dashboard scans
    // the whole ledger.
    index("idx_ledger_type_created").on(t.type, t.createdAt),
  ],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const stripeEvents = sqliteTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  processedAt: integer("processed_at").notNull(),
});
