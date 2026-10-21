import { describe, expect, it } from "vitest";
import type { Candle } from "../indicators";
import type { EvidenceItem, EvidenceSnapshot } from "../evidence";
import { buildPriceActionFacts, buildTradePlans, planIsExecutable, priceActionEvidence } from "../opportunities";
import { calculateEntryAssessment } from "../scoring";
import { buildStrategyAdvice } from "../strategyAdvice";
import { opportunityPresentation } from "../opportunityPresentation";

function item(family: EvidenceItem["family"], values: EvidenceItem["values"], state = "neutral"): EvidenceItem {
  return { id: `daily.${family}.${state}`, family, values, state, timeframe: "daily", direction: "neutral",
    label: family, description: family, provisional: false, reliability: 0.9 };
}
const candle = (day: number, open: number, high: number, low: number, close: number): Candle =>
  ({ date: `2026-09-${String(day).padStart(2, "0")}`, open, high, low, close, volume: 10000 });
const reboundBars = [candle(1, 100, 101, 97, 98), candle(2, 98, 99, 96, 97),
  candle(3, 97, 98, 95, 96), candle(4, 96, 100, 94, 99)];
function snapshot(overrides: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot {
  const levels: EvidenceSnapshot["levels"] = [
    { price: 95, kind: "support", source: "horizontal", strength: 0.8 },
    { price: 110, kind: "resistance", source: "horizontal", strength: 0.8 },
  ];
  return { version: "2.0", symbol: "MSFT", price: 99, weeklyRegime: "bearish", dailyPhase: "base", levels,
    dataQuality: { asOf: "2026-09-04T22:00:00Z", latestDailyDate: "2026-09-04", dailyBarComplete: true,
      weeklyBarComplete: true, dailySamples: 100, weeklySamples: 60, missingFamilies: [], scoreCap: 5, warnings: [] },
    priceAction: buildPriceActionFacts(reboundBars, levels, 2, true),
    items: [item("atr", { value: 2 }), item("ema", { order: "bearish", pricePosition: "below_all" }, "bearish"),
      item("rsi", { value: 28 }), item("macd", { histogram: -0.3, histogramTrend: "contracting" })],
    ...overrides };
}

describe("opportunity decisions", () => {
  it.each(["zh-CN", "en", "ja"])("does not veto APP model judgment with local payoff rules (%s)", (language) => {
    const plan = { ...buildTradePlans(snapshot())[0], entry: 272.46, stop: 260.59,
      target: 282.14, priceConfirmed: true };
    const opportunity = { kind: "rebound" as const, status: "triggered" as const,
      horizon: 5 as const, score: 2.5, plan, reasons: [] };
    expect(planIsExecutable(plan)).toBe(false);
    const model = opportunityPresentation({ source: "ai", opportunity }, language);
    expect(model.action).toBeUndefined();
    expect(model.warning).toBeUndefined();
    expect(model.plan).toContain("282.14");
    expect(model.plan).not.toContain(String(plan.maxEntry));
    const local = opportunityPresentation({ opportunity }, language);
    expect(local.warning).toBeTruthy();
    expect(local.action).toBeTruthy();
  });
  it("rejects the reported 688048 path whose confirmation exceeds its first obstacle", () => {
    const plan = { ...buildTradePlans(snapshot())[0], entry: 183.26, trigger: 195.8,
      stop: 172.59, target: 189.79, maxEntry: 180.41, priceConfirmed: false };
    expect(planIsExecutable(plan)).toBe(false);
    const presentation = opportunityPresentation({ opportunity: {
      kind: "rebound", status: "watch", horizon: 5, score: 1.6, plan, reasons: [],
    } }, "zh-CN");
    expect(presentation.warning).toContain("当前路径不成立");
    expect(presentation.plan).toContain("首个阻力 189.79");
    expect(presentation.plan).not.toContain("最高参考入场价");
  });
  it("evaluates an unconfirmed plan at confirmation price even when spot payoff is attractive", () => {
    const plan = { ...buildTradePlans(snapshot())[0], entry: 99, trigger: 109,
      stop: 94, target: 110, priceConfirmed: false };
    expect(planIsExecutable(plan)).toBe(false);
    expect(planIsExecutable({ ...plan, trigger: 101 })).toBe(true);
  });
  it("allows a confirmed short rebound while keeping the bearish weekly background", () => {
    const result = calculateEntryAssessment(snapshot());
    expect(result.opportunity?.kind).toBe("rebound");
    expect(result.opportunity?.status).toBe("triggered");
    expect(result.currentTrend?.weekly).toBe("bearish");
    expect(result.activeSetup).toBe("left");
    expect(result.forecast?.horizon).toBe(5);
    expect(result.riskPlan.stop).toBe(93.5);
  });
  it("does not turn oversold readings and an ATR stop into price confirmation", () => {
    const falling = snapshot({ priceAction: undefined, levels: [] });
    const result = calculateEntryAssessment(falling);
    expect(result.opportunities?.find(o => o.kind === "rebound")?.status).toBe("watch");
    expect(result.activeSetup).toBe("none");
    expect(result.opportunity?.plan.stopBasis).toBe("volatility");
    expect(result.opportunity?.plan.priceConfirmed).toBe(false);
  });
  it("requires improvement beyond a second oversold indicator", () => {
    const input = snapshot();
    input.items = input.items.filter(i => i.family !== "macd");
    input.items.push(item("kdj", { zone: "low", jState: "oversold" }));
    expect(calculateEntryAssessment(input).opportunity?.status).toBe("watch");
  });
  it("keeps intraday confirmation provisional and does not activate a trade", () => {
    const input = snapshot();
    input.dataQuality.dailyBarComplete = false;
    const result = calculateEntryAssessment(input);
    expect(result.opportunity?.status).toBe("provisional");
    expect(result.activeSetup).toBe("none");
    expect(buildStrategyAdvice(input, result).leftEntry.action).toBe("wait");
  });
  it("uses the first obstacle rather than a far target that makes reward/risk look better", () => {
    const input = snapshot();
    input.levels.push({ price: 100, kind: "resistance", source: "vpvr", strength: 0.9 });
    const result = calculateEntryAssessment(input);
    expect(result.riskPlan.target).toBe(100);
    expect(result.opportunity?.status).toBe("watch");
    expect(planIsExecutable(result.opportunity?.plan)).toBe(false);
  });
  it("does not confirm when daily history or ATR is missing", () => {
    const input = snapshot();
    input.dataQuality.dailySamples = 10;
    expect(calculateEntryAssessment(input).activeSetup).toBe("none");
    input.dataQuality.dailySamples = 100;
    input.items = input.items.filter(i => i.family !== "atr");
    expect(calculateEntryAssessment(input).activeSetup).toBe("none");
  });
  it("generates separate plans and labels volatility stops honestly", () => {
    const input = snapshot({ priceAction: undefined, levels: [{ price: 110, kind: "resistance", source: "horizontal", strength: 0.8 }] });
    const plans = buildTradePlans(input);
    expect(new Set(plans.map(p => p.id)).size).toBe(3);
    expect(plans.map(p => p.horizon)).toEqual([5, 10, 10]);
    const advice = buildStrategyAdvice(input, calculateEntryAssessment(input));
    expect(advice.exitStop.structuralStop).toBeUndefined();
    expect(advice.exitStop.atrStop).toBe(96);
  });
  it("handles an empty cached candidate list without crashing", () => {
    expect(calculateEntryAssessment(snapshot({ tradePlans: [] })).opportunities).toHaveLength(3);
  });
  it("does not borrow an old pattern stop for a fresh pullback", () => {
    const input = snapshot({ priceAction: undefined });
    input.levels.push({ price: 70, kind: "stop", source: "pattern", strength: 0.9 });
    input.items.push({ ...item("classicalPattern", { triggerPrice: 90, invalidationPrice: 70 }, "confirmed"),
      direction: "bullish", barsSince: 20 });
    const plans = buildTradePlans(input);
    expect(plans.find(p => p.kind === "pullback")).toMatchObject({ stop: 94.5, stopSource: "horizontal" });
    expect(plans.find(p => p.kind === "breakout")).toMatchObject({ stop: 70, stopSource: "pattern" });
    expect(plans.find(p => p.kind === "pullback")?.evidenceIds).not.toContain("daily.classicalPattern.confirmed");
  });
  it("prefers a genuine watch setup over an unrelated unformed candidate", () => {
    const input = snapshot({ priceAction: undefined });
    input.items = [item("atr", { value: 2 }),
      { ...item("ema", { order: "bullish", pricePosition: "above_all" }), direction: "bullish" },
      item("volume", { isLowVolumePullback: true })];
    const result = calculateEntryAssessment(input);
    expect(result.opportunities?.find(o => o.kind === "rebound")?.status).toBe("not_formed");
    expect(result.opportunity?.kind).toBe("pullback");
    expect(result.opportunity?.status).toBe("watch");
  });
  it("dates a past pattern confirmation from its actual trading bar, not today", () => {
    const input = snapshot({ priceAction: undefined });
    input.items.push({ ...item("classicalPattern", { triggerPrice: 90 }, "confirmed"), direction: "bullish", barsSince: 2 });
    const plan = buildTradePlans(input, reboundBars).find(p => p.kind === "breakout")!;
    expect(plan.confirmedAt).toBe("2026-09-02");
    expect(plan.confirmationAgeBars).toBe(2);
    expect(buildTradePlans(input).find(p => p.kind === "breakout")?.confirmedAt).toBeUndefined();
    input.tradePlans = buildTradePlans(input, reboundBars);
    expect(calculateEntryAssessment(input).opportunities?.find(o => o.kind === "breakout")?.status).toBe("too_late");
  });
  it("authorizes only the selected plan when both sides have confirmed candidates", () => {
    const input = snapshot();
    input.items.push({ ...item("volume", {}), direction: "bullish" });
    input.tradePlans = buildTradePlans(input).map(plan => ({ ...plan, priceConfirmed: true }));
    const result = calculateEntryAssessment(input);
    expect(result.opportunities?.filter(o => o.status === "triggered").length).toBeGreaterThanOrEqual(2);
    expect([result.leftStatus, result.rightStatus].filter(s => s === "triggered")).toHaveLength(1);
    const advice = buildStrategyAdvice(input, result);
    expect(advice.leftEntry.action === "probe").toBe(result.activeSetup === "left");
    expect(advice.rightAdd.action === "add_on_retest").toBe(result.activeSetup === "right");
    expect(result.riskPlan).toEqual(result.opportunity?.plan);
  });
});

describe("price events use historical anchors", () => {
  it("retains the actual three-bar trigger instead of substituting yesterday's high", () => {
    const bars = [...reboundBars.slice(0, 3), candle(4, 96, 103, 95, 102)];
    const facts = buildPriceActionFacts(bars, [], 2, true)!;
    expect(facts.localTriggerHigh).toBe(101);
    expect(facts.previousHigh).toBe(98);
    expect(priceActionEvidence(facts).find(i => i.state === "local_high_break")?.values?.level).toBe(101);
    expect(facts.knownAt).toBe("2026-09-03");
    expect(facts.observedAt).toBe("2026-09-04");
  });
  it("does not allow the newest low to redefine the support it broke", () => {
    const bars = [...reboundBars.slice(0, 3), candle(4, 96, 97, 90, 91)];
    const facts = buildPriceActionFacts(bars, [], 2, true)!;
    expect(facts.recentLow).toBe(95);
    expect(facts.supportBroken?.level).toBe(95);
    expect(facts.supportReclaimed).toBeUndefined();
  });
});
