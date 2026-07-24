import { describe, expect, it } from "vitest";
import type { AiEntryAssessment } from "../aiAnalysisResult";
import { buildEntryScorePresentation } from "../presentation";

function assessment(overrides: Partial<AiEntryAssessment> = {}): AiEntryAssessment {
  return {
    source: "ai",
    finalScore: 3.7,
    confidence: 0.82,
    leftStatus: "triggered",
    rightStatus: "watch",
    activeSetup: "left",
    riskPlan: {},
    reasons: [],
    ...overrides,
  };
}

describe("AI entry score presentation", () => {
  it("labels AI score, confidence, and scenarios", () => {
    expect(buildEntryScorePresentation(assessment(), "zh-CN")).toMatchObject({
      scoreLabel: "AI 评分",
      scoreText: "3.7",
      confidenceLabel: "置信度",
      confidenceText: "82%",
      leftText: "触发",
      rightText: "观察",
    });
  });

  it("keeps provisional data status", () => {
    const view = buildEntryScorePresentation(assessment(), "en", {
      asOf: "2026-07-23T06:00:00.000Z",
      dailyBarComplete: false,
      weeklyBarComplete: false,
      dailySamples: 250,
      weeklySamples: 120,
      missingFamilies: [],
      scoreCap: 5,
      warnings: [],
    });
    expect(view.scoreLabel).toBe("AI score");
    expect(view.confidenceText).toBe("82%");
    expect(view.dataStatus).toContain("Daily provisional");
    expect(view.dataStatus).toContain("Weekly provisional");
  });
});
