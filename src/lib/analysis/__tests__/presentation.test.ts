import { describe, expect, it } from "vitest";
import { buildEntryScorePresentation } from "../presentation";
import { EntryAssessment } from "../scoring";
import { AiEntryAssessment } from "../aiAnalysisResult";

function assessment(overrides: Partial<EntryAssessment> = {}): EntryAssessment {
  return {
    ruleScore: 3.6,
    aiAdjustment: -0.2,
    finalScore: 3.4,
    hardCap: 5,
    dimensions: { priceLocation: 0.8, payoffQuality: 0.9, setupMaturity: 0.8, timeframeContext: 0.6, confirmationQuality: 0.5 },
    pathScores: { left: 3.6, right: 2.8 },
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
      leftText: "确认",
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

  it("labels an intraday trigger as provisional instead of confirmed", () => {
    expect(buildEntryScorePresentation(assessment({ leftStatus: "provisional" }), "zh-CN").leftText).toBe("盘中暂定");
  });

  it("presents AI-native confidence and outlook without a rule breakdown", () => {
    const aiAssessment: AiEntryAssessment = {
      source: "ai",
      outlook: "bullish",
      finalScore: 3.8,
      confidence: 0.78,
      confidenceReason: "Independent evidence agrees.",
      leftStatus: "watch",
      rightStatus: "triggered",
      activeSetup: "right",
      riskPlan: {},
      reasons: [],
    };

    expect(buildEntryScorePresentation(aiAssessment, "zh-CN")).toMatchObject({
      mode: "ai-native",
      finalLabel: "AI 评分",
      finalText: "3.8",
      confidenceText: "78%",
      outlookText: "看多",
      ruleText: "",
      adjustmentText: "",
    });
  });
});
