import { and, eq, gt, gte, sql } from "drizzle-orm";
import { ensureDbReady, schema } from "@/lib/db";
import { getPricePerUseCents } from "./settings";

export class InsufficientBalanceError extends Error {
  constructor(public priceCents: number) {
    super("余额不足");
    this.name = "InsufficientBalanceError";
  }
}

export interface ChargeResult {
  method: "free_use" | "balance" | "none";
  priceCents: number;
}

// Charge one analysis: consume a free use first, then fall back to balance.
// Uses conditional UPDATEs so concurrent requests can never double-spend.
export async function chargeForAnalysis(userId: string, refId: string): Promise<ChargeResult> {
  const db = await ensureDbReady();
  const now = Date.now();

  const freeResult = await db.update(schema.users)
    .set({ freeUsesRemaining: sql`${schema.users.freeUsesRemaining} - 1` })
    .where(and(eq(schema.users.id, userId), gt(schema.users.freeUsesRemaining, 0)));
  if (freeResult.rowsAffected > 0) {
    await db.insert(schema.creditLedger).values({
      id: crypto.randomUUID(),
      userId,
      deltaCents: 0,
      type: "free_use",
      refId,
      note: "免费体验次数",
      createdAt: now,
    });
    return { method: "free_use", priceCents: 0 };
  }

  const priceCents = await getPricePerUseCents();
  if (priceCents === 0) {
    return { method: "none", priceCents: 0 };
  }

  const balanceResult = await db.update(schema.users)
    .set({ balanceCents: sql`${schema.users.balanceCents} - ${priceCents}` })
    .where(and(eq(schema.users.id, userId), gte(schema.users.balanceCents, priceCents)));
  if (balanceResult.rowsAffected === 0) {
    throw new InsufficientBalanceError(priceCents);
  }
  await db.insert(schema.creditLedger).values({
    id: crypto.randomUUID(),
    userId,
    deltaCents: -priceCents,
    type: "charge",
    refId,
    note: "AI 分析",
    createdAt: now,
  });
  return { method: "balance", priceCents };
}

// Reverse a charge when the AI report was not actually delivered.
export async function refundAnalysis(userId: string, refId: string, charge: ChargeResult): Promise<void> {
  const db = await ensureDbReady();
  const now = Date.now();
  if (charge.method === "free_use") {
    await db.update(schema.users)
      .set({ freeUsesRemaining: sql`${schema.users.freeUsesRemaining} + 1` })
      .where(eq(schema.users.id, userId));
    await db.insert(schema.creditLedger).values({
      id: crypto.randomUUID(),
      userId,
      deltaCents: 0,
      type: "refund",
      refId,
      note: "AI 分析失败，返还免费次数",
      createdAt: now,
    });
  } else if (charge.method === "balance") {
    await db.update(schema.users)
      .set({ balanceCents: sql`${schema.users.balanceCents} + ${charge.priceCents}` })
      .where(eq(schema.users.id, userId));
    await db.insert(schema.creditLedger).values({
      id: crypto.randomUUID(),
      userId,
      deltaCents: charge.priceCents,
      type: "refund",
      refId,
      note: "AI 分析失败退款",
      createdAt: now,
    });
  }
}

// Credit a Stripe topup exactly once: claiming the event id and crediting the
// balance happen in one transaction, so a replayed webhook is a no-op and a
// mid-flight failure rolls back the claim for Stripe's retry.
export async function creditTopupIdempotent(
  userId: string,
  amountCents: number,
  stripeSessionId: string,
  stripeEventId: string,
): Promise<boolean> {
  const db = await ensureDbReady();
  return db.transaction(async (tx) => {
    const claim = await tx.insert(schema.stripeEvents)
      .values({ eventId: stripeEventId, processedAt: Date.now() })
      .onConflictDoNothing();
    if (claim.rowsAffected === 0) return false;
    await tx.update(schema.users)
      .set({ balanceCents: sql`${schema.users.balanceCents} + ${amountCents}` })
      .where(eq(schema.users.id, userId));
    await tx.insert(schema.creditLedger).values({
      id: crypto.randomUUID(),
      userId,
      deltaCents: amountCents,
      type: "topup",
      refId: stripeSessionId,
      note: "Stripe 充值",
      createdAt: Date.now(),
    });
    return true;
  });
}

export async function getUserBillingSnapshot(userId: string) {
  const db = await ensureDbReady();
  const user = (
    await db.select({
      balanceCents: schema.users.balanceCents,
      freeUsesRemaining: schema.users.freeUsesRemaining,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  )[0];
  return user ?? { balanceCents: 0, freeUsesRemaining: 0 };
}
