import { describe, expect, it } from "vitest";
import { buildEntryScorePresentation } from "../presentation";
import { EntryAssessment } from "../scoring";

function assessment(overrides: Partial<EntryAssessment> = {}): EntryAssessment {
  return {
    ruleScore: 3.6,
    aiAdjustment: -0.2,
    finalScore: 3.4,
    hardCap: 5,
    dimensions: { priceLocation: 0.8, payoffQuality: 0.9, setupMaturity: 0.8, timeframeContext: 0.6, confirmationQuality: 0.5 },
    leftStatus: "triggered",
    rightStatus: "watch",
    activeSetup: "left",
    riskPlan: {},
    reasons: [],
    ...overrides,
  };
}

describe("entry score presentation", () => {
  it("labels rule, AI adjustment, final score, and scenarios", () => {
    expect(buildEntryScorePresentation(assessment(), "zh-CN")).toMatchObject({
      ruleLabel: "规则基础分",
      adjustmentText: "-0.2",
      finalLabel: "最终综合分",
      leftText: "触发",
      rightText: "观察",
    });
  });

  it("formats positive adjustment and provisional data status", () => {
    const view = buildEntryScorePresentation(assessment({ aiAdjustment: 0.3 }), "en", {
      asOf: "2026-07-23T06:00:00.000Z",
      dailyBarComplete: false,
      weeklyBarComplete: false,
      dailySamples: 250,
      weeklySamples: 120,
      missingFamilies: [],
      scoreCap: 5,
      warnings: [],
    });
    expect(view.adjustmentText).toBe("+0.3");
    expect(view.dataStatus).toContain("Daily provisional");
    expect(view.dataStatus).toContain("Weekly provisional");
  });
});
