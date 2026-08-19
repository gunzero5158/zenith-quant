import { describe, expect, it } from "vitest";
import { buildEntryScorePresentation, formatDataAsOf } from "../presentation";
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
  it("formats the UTC analysis timestamp in the requested display timezone", () => {
    expect(formatDataAsOf("2026-08-19T03:58:57.596Z", "Asia/Shanghai"))
      .toBe("2026-08-19 11:58");
  });

  it("presents the AI trend instead of internal score details", () => {
    expect(buildEntryScorePresentation(assessment({ aiOutlook: "bearish" }), "zh-CN")).toMatchObject({
      outlookLabel: "AI趋势",
      outlookText: "看空",
      finalLabel: "最终综合分",
      leftText: "确认",
      rightText: "观察",
    });
  });

  it("localizes a neutral trend and provisional data status", () => {
    const view = buildEntryScorePresentation(assessment({ aiOutlook: "neutral" }), "en", {
      asOf: "2026-07-23T06:00:00.000Z",
      dailyBarComplete: false,
      weeklyBarComplete: false,
      dailySamples: 250,
      weeklySamples: 120,
      missingFamilies: [],
      scoreCap: 5,
      warnings: [],
    });
    expect(view.outlookText).toBe("Neutral");
    expect(view.dataStatus).toContain("Daily provisional");
    expect(view.dataStatus).toContain("Weekly provisional");
  });

  it("does not invent an AI trend when no valid AI review is available", () => {
    expect(buildEntryScorePresentation(assessment(), "zh-CN")).toMatchObject({
      outlookLabel: "AI趋势",
      outlookText: "未判断",
    });
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
      finalLabel: "AI 评分",
      finalText: "3.8",
      confidenceText: "78%",
      outlookText: "看多",
    });
  });
});
