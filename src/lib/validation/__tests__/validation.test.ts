import { describe, expect, it } from "vitest";
import { evaluateOutcome, isOutlookCorrect, jevCalibration, summarizeTrack } from "../outcomes";
import { AnalysisLike, mergeValidationRecords, recordsFromAnalysis, ValidationRecord } from "../records";

const candles = Array.from({ length: 30 }, (_, index) => ({
  date: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  high: 101 + index,
  low: 99 + index,
  close: 100 + index,
}));

function analysis(overrides: Partial<AnalysisLike> = {}): AnalysisLike {
  return {
    symbol: "TEST",
    price: 100,
    isLLMUsed: true,
    analysisMode: "jev-ai",
    entryAssessment: {
      finalScore: 3.5, outlook: "bullish", leftStatus: "too_late", rightStatus: "triggered",
      activeSetup: "right", riskPlan: { stop: 96, target: 108 },
    },
    ruleBaseline: {
      finalScore: 2.4, ruleScore: 2.4, leftStatus: "watch", rightStatus: "not_formed", activeSetup: "none", riskPlan: {},
    },
    jevDecision: { outlookProbabilities: { bullish: 0.7, neutral: 0.2, bearish: 0.1 }, setupStage: "right_triggered" },
    dataQuality: { latestDailyDate: "2026-09-01T00:00:00.000Z" },
    dailyCandles: candles,
    indicators: { atr: [2] },
    ...overrides,
  };
}

describe("validation records", () => {
  it("logs the mode that ran together with the free rule baseline", () => {
    const records = recordsFromAnalysis(analysis(), 1, "custom/model");
    expect(records.map((record) => record.track)).toEqual(["rule", "jev-ai"]);
    expect(records[1]).toMatchObject({
      id: "TEST|jev-ai|2026-09-01", barDate: "2026-09-01", atrPct: 2, outlook: "bullish",
      stage: "right_triggered", stop: 96, target: 108, model: "custom/model",
    });
    expect(records[0].score).toBe(2.4);
    expect(records[0].outlook).toBeUndefined();
    expect(records[0].model).toBeUndefined();
  });

  it("splits a rules + LLM analysis into the pure rule score and the reviewed score", () => {
    const records = recordsFromAnalysis(analysis({
      analysisMode: "rule-ai",
      ruleBaseline: undefined,
      entryAssessment: {
        finalScore: 3.1, ruleScore: 2.8, aiOutlook: "neutral", leftStatus: "watch", rightStatus: "not_formed", activeSetup: "none",
      },
    }), 1);
    expect(records.map((record) => [record.track, record.score, record.outlook])).toEqual([
      ["rule", 2.8, undefined], ["rule-ai", 3.1, "neutral"],
    ]);
  });

  it("never logs mock data", () => {
    expect(recordsFromAnalysis(analysis({ isMock: true }), 1)).toEqual([]);
  });

  it("keeps one sample per stock, track, and bar while preserving an evaluated outcome", () => {
    const [rule, jev] = recordsFromAnalysis(analysis(), 1);
    const evaluated = { ...jev, outcome: evaluateOutcome(jev, candles, 5) };
    const merged = mergeValidationRecords([rule, evaluated], recordsFromAnalysis(analysis(), 9));
    expect(merged).toHaveLength(2);
    expect(merged.find((record) => record.track === "jev-ai")).toMatchObject({ analyzedAt: 9, outcome: { evaluatedAt: 5 } });
  });
});

describe("validation outcomes", () => {
  const [, jev] = recordsFromAnalysis(analysis(), 1);

  it("measures forward returns from the analysis price by trading bars", () => {
    const outcome = evaluateOutcome(jev, candles, 5)!;
    expect(outcome.returns).toEqual({ 5: 5, 10: 10, 20: 20 });
    expect(outcome).toMatchObject({ complete: true, barsElapsed: 20, plan: "target", planBars: 7, maxGainPct: 21 });
  });

  it("stays incomplete until the longest horizon has elapsed", () => {
    const outcome = evaluateOutcome(jev, candles.slice(0, 6), 5)!;
    expect(outcome.returns).toEqual({ 5: 5 });
    expect(outcome).toMatchObject({ complete: false, plan: "open" });
    expect(evaluateOutcome({ ...jev, barDate: "2027-01-01" }, candles, 5)).toBeUndefined();
  });

  it("counts a bar that spans both levels as the stop", () => {
    const wide = candles.map((candle, index) => (index === 1 ? { ...candle, low: 90, high: 120 } : candle));
    expect(evaluateOutcome(jev, wide, 5)).toMatchObject({ plan: "stop", planBars: 1 });
  });

  it("judges an outlook against a volatility-sized band", () => {
    expect(isOutlookCorrect(jev, 3.1)).toBe(true);
    expect(isOutlookCorrect(jev, 2.9)).toBe(false);
    expect(isOutlookCorrect({ ...jev, outlook: "neutral" }, -2.9)).toBe(true);
    expect(isOutlookCorrect({ ...jev, outlook: undefined }, 9)).toBeUndefined();
  });

  it("summarizes a track and Jev's calibration", () => {
    const records: ValidationRecord[] = [
      { ...jev, outcome: evaluateOutcome(jev, candles, 5) },
      { ...jev, id: "b", outlook: "bearish", score: 2, activeSetup: "none", outlookProbabilities: { bullish: 0.1, neutral: 0.2, bearish: 0.7 }, outcome: evaluateOutcome({ ...jev, activeSetup: "none" }, candles, 5) },
      { ...jev, id: "c" },
    ];
    const stats = summarizeTrack("jev-ai", records);
    expect(stats).toMatchObject({ total: 3, evaluated: 2, outlookJudged: 2, outlookHitRate: 0.5 });
    expect(stats.byOutlook.bullish).toEqual({ count: 1, averageReturnPct: 10, upRate: 1 });
    expect(stats.byScore.low.count).toBe(1);
    expect(stats.plan).toMatchObject({ target: 1, stop: 0, winRate: 1 });
    expect(summarizeTrack("rule", records).total).toBe(0);

    const calibration = jevCalibration(records);
    expect(calibration.find((bucket) => bucket.label === "60-80%")).toEqual({ label: "60-80%", count: 1, statedProbability: 0.7, actualUpRate: 1 });
    expect(calibration.find((bucket) => bucket.label === "<40%")).toMatchObject({ count: 1, actualUpRate: 1 });
  });
});
