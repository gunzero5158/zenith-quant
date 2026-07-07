import { and, eq, gt, gte, sql } from "drizzle-orm";
import { ensureDbReady, schema, Database } from "@/lib/db";
import { getPricePerUseCents } from "./settings";

// Consistency model: every money mutation is a single conditional UPDATE
// (atomic on its own, so concurrent requests can never double-spend), and the
// paired ledger INSERT is protected by a compensating update if it fails.
// Interactive transactions are deliberately avoided: @libsql/client's local
// file driver interleaves concurrent transactions on one connection
// (SQLITE_BUSY), and on Turso's HTTP driver they cost extra roundtrips.

export class InsufficientBalanceError extends Error {
  constructor(public priceCents: number) {
    super("余额不足");
    this.name = "InsufficientBalanceError";
  }
}

export interface ChargeResult {
  method: "free_use" | "balance" | "none";
  priceCents: number;
  // Post-charge values, so callers never need a follow-up SELECT.
  balanceCents: number;
  freeUsesRemaining: number;
}

const billingColumns = {
  balanceCents: schema.users.balanceCents,
  freeUsesRemaining: schema.users.freeUsesRemaining,
};

async function insertLedger(
  db: Database,
  entry: { userId: string; deltaCents: number; type: "charge" | "refund" | "topup" | "free_use"; refId: string; note: string },
): Promise<void> {
  await db.insert(schema.creditLedger).values({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...entry,
  });
}

// Charge one analysis: consume a free use first, then fall back to balance.
export async function chargeForAnalysis(userId: string, refId: string): Promise<ChargeResult> {
  const db = await ensureDbReady();
  const priceCents = await getPricePerUseCents();

  // A free promo (price 0) must not burn users' free-use quota.
  if (priceCents === 0) {
    const row = (
      await db.select(billingColumns).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    )[0];
    return { method: "none", priceCents: 0, balanceCents: row?.balanceCents ?? 0, freeUsesRemaining: row?.freeUsesRemaining ?? 0 };
  }

  const freeRows = await db.update(schema.users)
    .set({ freeUsesRemaining: sql`${schema.users.freeUsesRemaining} - 1` })
    .where(and(eq(schema.users.id, userId), gt(schema.users.freeUsesRemaining, 0)))
    .returning(billingColumns);
  if (freeRows.length > 0) {
    try {
      await insertLedger(db, { userId, deltaCents: 0, type: "free_use", refId, note: "免费体验次数" });
    } catch (err) {
      await db.update(schema.users)
        .set({ freeUsesRemaining: sql`${schema.users.freeUsesRemaining} + 1` })
        .where(eq(schema.users.id, userId));
      throw err;
    }
    return { method: "free_use", priceCents: 0, ...freeRows[0] };
  }

  const paidRows = await db.update(schema.users)
    .set({ balanceCents: sql`${schema.users.balanceCents} - ${priceCents}` })
    .where(and(eq(schema.users.id, userId), gte(schema.users.balanceCents, priceCents)))
    .returning(billingColumns);
  if (paidRows.length === 0) {
    throw new InsufficientBalanceError(priceCents);
  }
  try {
    await insertLedger(db, { userId, deltaCents: -priceCents, type: "charge", refId, note: "AI 分析" });
  } catch (err) {
    await db.update(schema.users)
      .set({ balanceCents: sql`${schema.users.balanceCents} + ${priceCents}` })
      .where(eq(schema.users.id, userId));
    throw err;
  }
  return { method: "balance", priceCents, ...paidRows[0] };
}

// Reverse a charge when the AI report was not actually delivered.
export async function refundAnalysis(userId: string, refId: string, charge: ChargeResult): Promise<void> {
  if (charge.method === "none") return;
  const db = await ensureDbReady();
  const isFreeUse = charge.method === "free_use";
  await db.update(schema.users)
    .set(
      isFreeUse
        ? { freeUsesRemaining: sql`${schema.users.freeUsesRemaining} + 1` }
        : { balanceCents: sql`${schema.users.balanceCents} + ${charge.priceCents}` },
    )
    .where(eq(schema.users.id, userId));
  await insertLedger(db, {
    userId,
    deltaCents: isFreeUse ? 0 : charge.priceCents,
    type: "refund",
    refId,
    note: isFreeUse ? "AI 分析失败，返还免费次数" : "AI 分析失败退款",
  });
}

// Credit a Stripe topup exactly once: the eventId primary key is the
// idempotency claim, so a replayed webhook is a no-op. If crediting fails
// after the claim, the claim is released so Stripe's retry can succeed.
export async function creditTopupIdempotent(
  userId: string,
  amountCents: number,
  stripeSessionId: string,
  stripeEventId: string,
): Promise<boolean> {
  const db = await ensureDbReady();
  const claim = await db.insert(schema.stripeEvents)
    .values({ eventId: stripeEventId, processedAt: Date.now() })
    .onConflictDoNothing();
  if (claim.rowsAffected === 0) return false;

  try {
    const updated = await db.update(schema.users)
      .set({ balanceCents: sql`${schema.users.balanceCents} + ${amountCents}` })
      .where(eq(schema.users.id, userId))
      .returning({ id: schema.users.id });
    if (updated.length === 0) {
      // Unknown user: keep the failure visible in Stripe (retries + dashboard)
      // instead of returning 200 and losing the payment silently.
      throw new Error(`Stripe topup for unknown user ${userId} (session ${stripeSessionId})`);
    }
    try {
      await insertLedger(db, { userId, deltaCents: amountCents, type: "topup", refId: stripeSessionId, note: "Stripe 充值" });
    } catch (err) {
      await db.update(schema.users)
        .set({ balanceCents: sql`${schema.users.balanceCents} - ${amountCents}` })
        .where(eq(schema.users.id, userId));
      throw err;
    }
    return true;
  } catch (err) {
    // Release the idempotency claim so the retry isn't a silent no-op.
    await db.delete(schema.stripeEvents).where(eq(schema.stripeEvents.eventId, stripeEventId));
    throw err;
  }
}
