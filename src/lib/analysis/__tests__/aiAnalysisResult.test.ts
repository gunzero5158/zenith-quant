import { describe, expect, it } from "vitest";
import { toLegacyAiScoreDetail, validateAiAnalysisResult } from "../aiAnalysisResult";

const evidenceIds = new Set(["daily.ema.trend", "daily.macd.cross"]);

function validResult() {
  return {
    overview: "The setup is improving, but confirmation is incomplete.",
    technicalAnalysis: "### Momentum\nMACD is improving.",
    strategyCommentary: "Wait for confirmation before increasing exposure.",
    scoreAssessment: {
      finalScore: 3.75,
      confidence: 0.72,
      leftStatus: "watch",
      rightStatus: "not_formed",
      activeSetup: "left",
      riskPlan: { stop: 98.5, target: 112, rewardRisk: 2.1, stopDistancePct: 3.4 },
      reasons: [
        {
          evidenceIds: ["daily.ema.trend", "daily.macd.cross"],
          text: "Trend support is present while momentum still needs confirmation.",
        },
      ],
    },
    strategyAdvice: {
      holder: { action: "hold_protect", text: "Hold with a defined protective stop." },
      leftEntry: { action: "wait", text: "Wait for reversal confirmation." },
      rightAdd: { action: "wait_breakout", text: "Wait for a confirmed breakout." },
      exitStop: { structuralStop: 98.5, trigger: "close", text: "Exit on a close below 98.5." },
    },
  };
}

describe("AI-native analysis result validation", () => {
  it("preserves the AI score and maps it to the legacy score field without local adjustment", () => {
    const result = validateAiAnalysisResult(validResult(), evidenceIds);

    expect(result.scoreAssessment.finalScore).toBe(3.75);
    expect(result.scoreAssessment.source).toBe("ai");
    expect(toLegacyAiScoreDetail(result.scoreAssessment)).toMatchObject({
      totalScore: 3.75,
      scoreReasons: ["Trend support is present while momentum still needs confirmation."],
    });
  });

  it.each([-0.01, 5.01, Number.NaN])("rejects an out-of-range score: %s", (finalScore) => {
    const value = validResult();
    value.scoreAssessment.finalScore = finalScore;
    expect(() => validateAiAnalysisResult(value, evidenceIds)).toThrow(/finalScore/);
  });

  it("rejects unknown evidence references", () => {
    const value = validResult();
    value.scoreAssessment.reasons[0].evidenceIds = ["invented.signal"];
    expect(() => validateAiAnalysisResult(value, evidenceIds)).toThrow(/unknown evidence/i);
  });

  it("rejects invalid strategy actions instead of silently replacing them", () => {
    const value = validResult();
    value.strategyAdvice.holder.action = "buy_more";
    expect(() => validateAiAnalysisResult(value, evidenceIds)).toThrow(/holder.action/);
  });
});
