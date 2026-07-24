import { describe, expect, it } from "vitest";
import { EvidenceSnapshot } from "../evidence";
import { EntryAssessment } from "../scoring";
import { buildStrategyAdvice } from "../strategyAdvice";

function snapshot(phase: EvidenceSnapshot["dailyPhase"]): EvidenceSnapshot {
  return {
    version: "2.0",
    symbol: "300757.SZ",
    price: 100,
    dataQuality: { asOf: "2026-07-23T08:00:00Z", dailyBarComplete: true, weeklyBarComplete: true, dailySamples: 250, weeklySamples: 120, missingFamilies: [], scoreCap: 5, warnings: [] },
    items: [
      { id: "daily.ema.bullish", family: "ema", timeframe: "daily", direction: "bullish", state: "bullish", label: "EMA", description: "bullish", provisional: false, reliability: 0.9 },
      { id: "daily.atr.flat", family: "atr", timeframe: "daily", direction: "neutral", state: "flat", label: "ATR", description: "ATR", provisional: false, reliability: 0.9, values: { value: 2 } },
    ],
    levels: [{ price: 95, kind: "support", source: "horizontal", strength: 0.8 }],
    weeklyRegime: "bullish",
    dailyPhase: phase,
  };
}

function assessment(overrides: Partial<EntryAssessment> = {}): EntryAssessment {
  return {
    ruleScore: 2.8,
    aiAdjustment: 0,
    finalScore: 2.8,
    hardCap: 2.8,
    dimensions: { priceLocation: 0.5, payoffQuality: 0.5, setupMaturity: 0.5, timeframeContext: 0.5, confirmationQuality: 0.3 },
    leftStatus: "too_late",
    rightStatus: "too_late",
    activeSetup: "none",
    riskPlan: { stop: 94.2, target: 108, rewardRisk: 1.38 },
    reasons: [],
    ...overrides,
  };
}

describe("independent strategy advice", () => {
  it("can recommend holding while rejecting a new extended entry", () => {
    const advice = buildStrategyAdvice(snapshot("extended"), assessment());
    expect(advice.holder.action).toBe("hold_protect");
    expect(advice.rightAdd.action).toBe("avoid_chasing");
    expect(advice.leftEntry.action).toBe("not_applicable");
  });

  it("always gives traceable structural and ATR stops", () => {
    const advice = buildStrategyAdvice(snapshot("pullback"), assessment({ leftStatus: "triggered", activeSetup: "left" }));
    expect(advice.exitStop.structuralStop).toBe(94.2);
    expect(advice.exitStop.atrStop).toBe(93.6);
    expect(advice.exitStop.trigger).toBe("close");
  });
});
