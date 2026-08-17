import { describe, expect, it } from "vitest";
import type { EvidenceSnapshot } from "../evidence";
import { toLegacyAiScoreDetail, validateAiAnalysisResult } from "../aiAnalysisResult";

const snapshot: EvidenceSnapshot = {
  version: "2.0",
  symbol: "TEST",
  price: 100,
  dataQuality: {
    asOf: "2026-08-11T06:00:00.000Z",
    dailyBarComplete: true,
    weeklyBarComplete: true,
    dailySamples: 120,
    weeklySamples: 80,
    missingFamilies: [],
    scoreCap: 5,
    warnings: [],
  },
  items: [
    {
      id: "daily.ema.trend",
      family: "ema",
      timeframe: "daily",
      direction: "bullish",
      state: "bullish",
      label: "EMA trend",
      description: "EMA structure is bullish.",
      provisional: false,
      reliability: 0.9,
    },
    {
      id: "daily.macd.cross",
      family: "macd",
      timeframe: "daily",
      direction: "bullish",
      state: "golden_cross",
      label: "MACD cross",
      description: "MACD formed a golden cross.",
      provisional: false,
      reliability: 0.9,
    },
  ],
  levels: [
    { price: 95, kind: "support", source: "horizontal", strength: 0.8 },
    { price: 112, kind: "resistance", source: "horizontal", strength: 0.75 },
  ],
  weeklyRegime: "neutral",
  dailyPhase: "range",
};

function validResult() {
  return {
    overview: "The setup is improving, but confirmation is incomplete.",
    technicalAnalysis: "### Momentum\nMACD is improving.",
    strategyCommentary: "Increase exposure only while the breakout remains valid.",
    scoreAssessment: {
      outlook: "bullish",
      finalScore: 3.75,
      confidence: 0.72,
      confidenceReason: "Daily evidence agrees, while weekly confirmation remains limited.",
      leftStatus: "triggered",
      rightStatus: "watch",
      activeSetup: "left",
      riskPlan: { stop: 95, target: 112 },
      reasons: [
        {
          evidenceIds: ["daily.ema.trend", "daily.macd.cross"],
          text: "Trend support is present while momentum is improving.",
        },
      ],
    },
    strategyAdvice: {
      holder: {
        action: "hold_protect",
        evidenceIds: ["daily.ema.trend"],
        text: "Hold with a defined protective stop.",
      },
      leftEntry: {
        action: "probe",
        evidenceIds: ["daily.ema.trend", "daily.macd.cross"],
        text: "A small probe is justified with strict risk control.",
      },
      rightAdd: {
        action: "wait_breakout",
        evidenceIds: ["daily.macd.cross"],
        text: "Wait for a confirmed breakout before adding.",
      },
      exitStop: {
        trigger: "close",
        evidenceIds: ["daily.ema.trend"],
        text: "Exit on a close below 95.",
      },
    },
  };
}

describe("AI-native analysis result validation", () => {
  it("preserves the AI judgment while deriving risk arithmetic locally", () => {
    const result = validateAiAnalysisResult(validResult(), snapshot);

    expect(result.scoreAssessment).toMatchObject({
      source: "ai",
      outlook: "bullish",
      finalScore: 3.75,
      riskPlan: {
        stop: 95,
        target: 112,
        rewardRisk: 2.4,
        stopDistancePct: 5,
      },
    });
    expect(toLegacyAiScoreDetail(result.scoreAssessment)).toMatchObject({
      totalScore: 3.75,
      scoreReasons: ["Trend support is present while momentum is improving."],
    });
  });

  it.each([-0.01, 5.01, Number.NaN])("rejects an out-of-range score: %s", (finalScore) => {
    const value = validResult();
    value.scoreAssessment.finalScore = finalScore;
    expect(() => validateAiAnalysisResult(value, snapshot)).toThrow(/finalScore/);
  });

  it.each([
    [78, 0.78],
    ["78%", 0.78],
    ["0.78", 0.78],
    [1, 1],
  ])("normalizes common confidence format %s", (confidence, expected) => {
    const value = validResult();
    value.scoreAssessment.confidence = confidence as number;

    expect(validateAiAnalysisResult(value, snapshot).scoreAssessment.confidence).toBe(expected);
  });

  it.each([-1, 101, "not-a-number"])('rejects invalid confidence: %s', (confidence) => {
    const value = validResult();
    value.scoreAssessment.confidence = confidence as number;

    expect(() => validateAiAnalysisResult(value, snapshot)).toThrow(/confidence/);
  });

  it("rejects unknown evidence references", () => {
    const value = validResult();
    value.scoreAssessment.reasons[0].evidenceIds = ["invented.signal"];
    expect(() => validateAiAnalysisResult(value, snapshot)).toThrow(/unknown evidence/i);
  });

  it("rejects strategy advice that is not grounded in supplied evidence", () => {
    const value = validResult();
    value.strategyAdvice.leftEntry.evidenceIds = ["invented.signal"];
    expect(() => validateAiAnalysisResult(value, snapshot)).toThrow(/unknown evidence/i);
  });

  it("rejects invalid strategy actions instead of silently replacing them", () => {
    const value = validResult();
    value.strategyAdvice.holder.action = "buy_more";
    expect(() => validateAiAnalysisResult(value, snapshot)).toThrow(/holder.action/);
  });

  it.each([
    ["stop above current price", { stop: 101, target: 112 }],
    ["target below current price", { stop: 95, target: 99 }],
    ["stop not in supplied levels", { stop: 94, target: 112 }],
    ["target not in supplied levels", { stop: 95, target: 113 }],
  ])("removes an unreasonable %s and downgrades the entry", (_name, riskPlan) => {
    const value = validResult();
    value.scoreAssessment.riskPlan = riskPlan;
    const result = validateAiAnalysisResult(value, snapshot, "en");

    expect(result.strategyAdvice.leftEntry.action).toBe("wait");
    expect(result.scoreAssessment.activeSetup).toBe("none");
    expect(result.scoreAssessment.leftStatus).toBe("watch");
    expect(result.scoreAssessment.riskPlan.target).toBeUndefined();
    expect(result.scoreAssessment.finalScore).toBe(3.75);
  });

  it("downgrades an actionable entry when a grounded stop-target pair is incomplete", () => {
    const value = validResult();
    value.scoreAssessment.riskPlan = { stop: 95 } as { stop: number; target: number };
    const result = validateAiAnalysisResult(value, snapshot, "en");

    expect(result.scoreAssessment.activeSetup).toBe("none");
    expect(result.scoreAssessment.leftStatus).toBe("watch");
    expect(result.strategyAdvice.leftEntry.action).toBe("wait");
    expect(result.strategyAdvice.leftEntry.text).toMatch(/No validated stop-target pair/);
    expect(result.scoreAssessment.finalScore).toBe(3.75);
    expect(result.overview).toBe(value.overview);
  });

  it("downgrades hold protection when no grounded stop is available", () => {
    const value = validResult();
    value.scoreAssessment.activeSetup = "none";
    value.scoreAssessment.riskPlan = {} as { stop: number; target: number };
    value.strategyAdvice.leftEntry.action = "wait";
    const result = validateAiAnalysisResult(value, snapshot, "zh-CN");

    expect(result.strategyAdvice.holder.action).toBe("hold");
    expect(result.strategyAdvice.holder.text).toContain("缺少可验证的保护止损位");
  });

  it("downgrades contradictory setup status and strategy action", () => {
    const value = validResult();
    value.scoreAssessment.leftStatus = "watch";
    const result = validateAiAnalysisResult(value, snapshot, "en");

    expect(result.scoreAssessment.activeSetup).toBe("none");
    expect(result.strategyAdvice.leftEntry.action).toBe("wait");
  });

  it("downgrades a confirmed right-side setup when it is not executable", () => {
    const value = validResult();
    value.scoreAssessment.leftStatus = "not_formed";
    value.scoreAssessment.rightStatus = "triggered";
    value.scoreAssessment.activeSetup = "right";
    value.scoreAssessment.riskPlan = { stop: 95 } as { stop: number; target: number };
    value.strategyAdvice.leftEntry.action = "not_applicable";
    value.strategyAdvice.rightAdd.action = "add_on_retest";

    const result = validateAiAnalysisResult(value, snapshot, "zh-CN");

    expect(result.scoreAssessment.activeSetup).toBe("none");
    expect(result.scoreAssessment.rightStatus).toBe("watch");
    expect(result.strategyAdvice.rightAdd.action).toBe("wait_breakout");
  });

  it("removes internal evidence IDs from every user-visible string", () => {
    const value = validResult();
    value.overview = "Trend support is improving (`daily.ema.trend`).";
    value.technicalAnalysis = "### Momentum\nMACD is improving (`daily.macd.cross`).";
    value.strategyCommentary = "Reassess if momentum weakens (`daily.macd.cross`).";
    value.scoreAssessment.confidenceReason = "Agreement is visible in `daily.ema.trend`.";
    value.scoreAssessment.reasons[0].text = "Trend and momentum agree (`daily.ema.trend`, `daily.macd.cross`).";
    value.strategyAdvice.holder.text = "Hold with protection (`daily.ema.trend`).";
    value.strategyAdvice.exitStop.text = "Exit if the setup fails (`daily.macd.cross`).";

    const result = validateAiAnalysisResult(value, snapshot);
    const visibleText = [
      result.overview,
      result.technicalAnalysis,
      result.strategyCommentary,
      result.scoreAssessment.confidenceReason,
      result.scoreAssessment.reasons[0].text,
      result.strategyAdvice.holder.text,
      result.strategyAdvice.exitStop.text,
    ].join("\n");

    expect(visibleText).not.toMatch(/(?:daily|weekly)\./);
  });
});
