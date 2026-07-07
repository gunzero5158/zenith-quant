import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { ensureDbReady, schema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof NextResponse) return guard;

  const db = await ensureDbReady();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [userCount, todayAnalyses, topupTotal] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(schema.users)
      .where(sql`${schema.users.emailVerifiedAt} IS NOT NULL`),
    db.select({ n: sql<number>`count(*)` }).from(schema.creditLedger)
      .where(and(
        inArray(schema.creditLedger.type, ["charge", "free_use"]),
        gte(schema.creditLedger.createdAt, dayStart.getTime()),
      )),
    db.select({ n: sql<number>`coalesce(sum(${schema.creditLedger.deltaCents}), 0)` })
      .from(schema.creditLedger).where(eq(schema.creditLedger.type, "topup")),
  ]);

  return NextResponse.json({
    verifiedUsers: userCount[0]?.n ?? 0,
    todayAnalyses: todayAnalyses[0]?.n ?? 0,
    totalTopupCents: topupTotal[0]?.n ?? 0,
  });
}
