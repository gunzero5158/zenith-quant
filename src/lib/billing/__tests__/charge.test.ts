import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// Point the db singleton at a throwaway file BEFORE the module graph loads it.
process.env.DEV_DATABASE_FILE = path.join(mkdtempSync(path.join(tmpdir(), "zenith-test-")), "test.db");

type ChargeModule = typeof import("../charge");
type DbModule = typeof import("@/lib/db");
type SettingsModule = typeof import("../settings");

let charge: ChargeModule;
let dbMod: DbModule;
let settings: SettingsModule;

async function createUser(id: string, freeUses: number, balanceCents: number) {
  const db = await dbMod.ensureDbReady();
  await db.insert(dbMod.schema.users).values({
    id,
    email: `${id}@test.local`,
    passwordHash: "x",
    emailVerifiedAt: Date.now(),
    freeUsesRemaining: freeUses,
    balanceCents,
    createdAt: Date.now(),
  });
}

async function getUser(id: string) {
  const db = await dbMod.ensureDbReady();
  const { eq } = await import("drizzle-orm");
  return (await db.select().from(dbMod.schema.users).where(eq(dbMod.schema.users.id, id)))[0];
}

beforeAll(async () => {
  charge = await import("../charge");
  dbMod = await import("@/lib/db");
  settings = await import("../settings");
  await dbMod.ensureDbReady();
});

describe("chargeForAnalysis", () => {
  it("consumes free uses before balance", async () => {
    await createUser("u1", 2, 100);
    const r1 = await charge.chargeForAnalysis("u1", "a1");
    expect(r1).toMatchObject({ method: "free_use", priceCents: 0, freeUsesRemaining: 1 });
    const r2 = await charge.chargeForAnalysis("u1", "a2");
    expect(r2.method).toBe("free_use");
    const r3 = await charge.chargeForAnalysis("u1", "a3");
    expect(r3).toMatchObject({ method: "balance", priceCents: 5, balanceCents: 95 });
    const u = await getUser("u1");
    expect(u.freeUsesRemaining).toBe(0);
    expect(u.balanceCents).toBe(95);
  });

  it("throws InsufficientBalanceError when broke", async () => {
    await createUser("u2", 0, 4);
    await expect(charge.chargeForAnalysis("u2", "a1")).rejects.toBeInstanceOf(charge.InsufficientBalanceError);
    const u = await getUser("u2");
    expect(u.balanceCents).toBe(4); // untouched
  });

  it("respects an admin-updated price", async () => {
    await settings.setPricePerUseCents(10);
    try {
      await createUser("u3", 0, 25);
      const r = await charge.chargeForAnalysis("u3", "a1");
      expect(r).toMatchObject({ method: "balance", priceCents: 10, balanceCents: 15 });
      expect((await getUser("u3")).balanceCents).toBe(15);
    } finally {
      await settings.setPricePerUseCents(5);
    }
  });

  it("charges nothing when price is zero and does not burn free uses", async () => {
    await settings.setPricePerUseCents(0);
    try {
      await createUser("u4", 2, 0);
      const r = await charge.chargeForAnalysis("u4", "a1");
      expect(r).toMatchObject({ method: "none", priceCents: 0 });
      expect((await getUser("u4")).freeUsesRemaining).toBe(2);
    } finally {
      await settings.setPricePerUseCents(5);
    }
  });

  it("never double-spends under concurrent requests", async () => {
    await createUser("u5", 1, 5); // exactly 1 free use + 1 paid use of funds
    const results = await Promise.allSettled([
      charge.chargeForAnalysis("u5", "c1"),
      charge.chargeForAnalysis("u5", "c2"),
      charge.chargeForAnalysis("u5", "c3"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBe(2);
    expect(failed.length).toBe(1);
    const u = await getUser("u5");
    expect(u.freeUsesRemaining).toBe(0);
    expect(u.balanceCents).toBe(0);
  });
});

describe("refundAnalysis", () => {
  it("returns a free use", async () => {
    await createUser("u6", 1, 0);
    const r = await charge.chargeForAnalysis("u6", "a1");
    await charge.refundAnalysis("u6", "a1", r);
    expect((await getUser("u6")).freeUsesRemaining).toBe(1);
  });

  it("returns balance", async () => {
    await createUser("u7", 0, 5);
    const r = await charge.chargeForAnalysis("u7", "a1");
    expect((await getUser("u7")).balanceCents).toBe(0);
    await charge.refundAnalysis("u7", "a1", r);
    expect((await getUser("u7")).balanceCents).toBe(5);
  });
});

describe("creditTopupIdempotent", () => {
  it("credits once and ignores webhook replays", async () => {
    await createUser("u8", 0, 0);
    const first = await charge.creditTopupIdempotent("u8", 500, "cs_1", "evt_1");
    const replay = await charge.creditTopupIdempotent("u8", 500, "cs_1", "evt_1");
    expect(first).toBe(true);
    expect(replay).toBe(false);
    expect((await getUser("u8")).balanceCents).toBe(500);
  });

  it("credits separate events independently", async () => {
    await createUser("u9", 0, 0);
    await charge.creditTopupIdempotent("u9", 500, "cs_a", "evt_a");
    await charge.creditTopupIdempotent("u9", 2000, "cs_b", "evt_b");
    expect((await getUser("u9")).balanceCents).toBe(2500);
  });

  it("throws for an unknown user and releases the claim for retry", async () => {
    await expect(
      charge.creditTopupIdempotent("no-such-user", 500, "cs_x", "evt_x"),
    ).rejects.toThrow(/unknown user/);
    // The claim must be released so a retry can succeed once the user exists.
    await createUser("u10", 0, 0);
    const retried = await charge.creditTopupIdempotent("u10", 500, "cs_x", "evt_x");
    expect(retried).toBe(true);
    expect((await getUser("u10")).balanceCents).toBe(500);
  });
});
