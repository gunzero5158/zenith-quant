import { describe, expect, it } from "vitest";
import type { CandidateTradePlan } from "../../analysis/opportunities";
import { evaluateTrade, type ExecutionBar, type ExecutionPolicy } from "../tradeExecution";

const plan: CandidateTradePlan = {
  id: "rebound:test", kind: "rebound", side: "left", horizon: 5, generatedAt: "2026-09-01",
  anchorKnownAt: "2026-08-31", entry: 100, trigger: 99, priceConfirmed: true,
  stop: 95, target: 110, stopTrigger: "intraday", minimumStopDistance: 1,
  maxEntry: (110 + 1.2 * 95) / 2.2, expiresAfterBars: 5, evidenceIds: [],
};
const policy: ExecutionPolicy = { version: "test-1", roundTripCostBps: 10, slippageBpsPerSide: 0,
  minimumHoldBars: 0, marketConstraintsVerified: true };
const bar = (open = 100, high = 102, low = 98, close = 101): ExecutionBar =>
  ({ date: "2026-09-02", open, high, low, close, complete: true, tradable: true });
const run = (bars: ExecutionBar[], overrides: Partial<CandidateTradePlan> = {}, execution = policy) =>
  evaluateTrade({ ...plan, ...overrides }, true, true, bars, execution);

describe("frozen next-open trade validation", () => {
  it("does not treat a watch plan as a filled trade", () => {
    expect(evaluateTrade(plan, false, true, [bar()], policy).status).toBe("not_triggered");
  });
  it("requires closed data and established market assumptions", () => {
    expect(evaluateTrade(plan, true, false, [bar()], policy).status).toBe("unverifiable");
    expect(evaluateTrade(plan, true, true, [bar()], undefined).status).toBe("unverifiable");
    expect(run([{ ...bar(), tradable: undefined }]).status).toBe("unverifiable");
    expect(run([{ ...bar(), open: undefined }]).status).toBe("unverifiable");
  });
  it("skips a gap that invalidates reward/risk rather than filling at yesterday's price", () => {
    expect(run([bar(108, 111, 107, 109)]).status).toBe("skipped");
  });
  it("records a stop gap at the actual next open", () => {
    const result = run([bar(), bar(90, 94, 88, 92)]);
    expect(result.status).toBe("stop");
    expect(result.entryPrice).toBe(100);
    expect(result.exitPrice).toBe(90);
    expect(result.netR).toBeCloseTo(-2.02);
  });
  it("marks same-bar stop and target ambiguity separately", () => {
    const result = run([bar(100, 112, 93, 105)]);
    expect(result.status).toBe("ambiguous");
    expect(result.netR).toBeUndefined();
    expect(result.conservativeNetR).toBeCloseTo(-1.02);
  });
  it("does not treat intraday penetration as a close-stop signal", () => {
    const result = run([bar(100, 103, 93, 101)], { stopTrigger: "close" });
    expect(result.status).toBe("open");
  });
  it("executes a close-stop on the next open, including a gap", () => {
    const result = run([bar(100, 101, 93, 94), bar(92, 97, 91, 96)], { stopTrigger: "close" });
    expect(result.status).toBe("stop");
    expect(result.exitPrice).toBe(92);
    expect(result.barsHeld).toBe(2);
  });
  it("does not execute a close-based stop merely because the next session opens below it", () => {
    const result = run([bar(), bar(94, 102, 93, 100)], { stopTrigger: "close" });
    expect(result.status).toBe("open");
    expect(result.exitPrice).toBeUndefined();
  });
  it("does not queue a close-stop on T+1 entry-day penetration when the close recovers", () => {
    const result = run([bar(100, 103, 93, 101), bar()], { stopTrigger: "close" }, { ...policy, minimumHoldBars: 1 });
    expect(result.status).toBe("open");
    expect(result.reason).toBeUndefined();
  });
  it("does not sell on the entry day under a T+1 assumption", () => {
    const result = run([bar(100, 112, 94, 98), bar(93, 97, 92, 96)], {}, { ...policy, minimumHoldBars: 1 });
    expect(result.status).toBe("stop");
    expect(result.exitPrice).toBe(93);
    expect(result.barsHeld).toBe(2);
  });
  it("exits at the declared horizon and deducts costs", () => {
    const result = run(Array.from({ length: 5 }, () => bar()));
    expect(result.status).toBe("timeout");
    expect(result.netReturnPct).toBeCloseTo(0.9);
    expect(result.barsHeld).toBe(5);
  });
  it("does not consume an unfinished bar", () => {
    expect(run([{ ...bar(100, 112, 90, 101), complete: false }]).status).toBe("open");
  });
});
