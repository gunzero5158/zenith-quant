import { describe, expect, it } from "vitest";
import { evaluateOutcome, isOutlookCorrect, jevCalibration, summarizeTrack } from "../outcomes";
import { AnalysisLike, mergeValidationRecords, primarySamples, recordsFromAnalysis, TRACK_VERSIONS, ValidationRecord } from "../records";

const candles = Array.from({ length: 30 }, (_, index) => ({
  date: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  high: 101 + index,
  low: 99 + index,
  close: 100 + index,
  open: 100 + index,
  complete: true,
  tradable: true,
}));

function analysis(overrides: Partial<AnalysisLike> = {}): AnalysisLike {
  return {
    symbol: "TEST",
    price: 100,
    isLLMUsed: true,
    analysisMode: "jev-ai",
    snapshotId: "snapshot-1",
    entryAssessment: {
      finalScore: 3.5, outlook: "bullish", leftStatus: "too_late", rightStatus: "triggered",
      activeSetup: "right", riskPlan: { stop: 96, target: 108 },
      forecast: { horizon: 10, referencePrice: 100, bandPct: 3, upperPrice: 103, lowerPrice: 97, definition: "close_return_band" },
      opportunity: { kind: "breakout", status: "triggered", horizon: 10, score: 3.5, reasons: [], plan: {
        id: "breakout-1", kind: "breakout", side: "right", horizon: 10, generatedAt: "2026-09-01", anchorKnownAt: "2026-08-31",
        entry: 100, priceConfirmed: true, stop: 96, target: 108, stopTrigger: "intraday", minimumStopDistance: 1,
        maxEntry: (108 + 1.2 * 96) / 2.2, expiresAfterBars: 10, evidenceIds: [],
      } },
    },
    ruleBaseline: {
      finalScore: 2.4, ruleScore: 2.4, leftStatus: "watch", rightStatus: "not_formed", activeSetup: "none", riskPlan: {},
    },
    jevDecision: { outlookProbabilities: { bullish: 0.7, neutral: 0.2, bearish: 0.1 }, setupStage: "right_triggered" },
    dataQuality: { latestDailyDate: "2026-09-01T00:00:00.000Z", dailyBarComplete: true },
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
      id: `TEST|jev-ai|${TRACK_VERSIONS["jev-ai"]}|2026-09-01|1`, barDate: "2026-09-01", atrPct: 2, outlook: "bullish",
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

  it("keeps old and new rule decisions paired on the same immutable input", () => {
    const input = analysis();
    input.legacyComparison = { ...input.ruleBaseline!, decisionVersion: "rules-0.6.0-paired",
      forecast: input.entryAssessment!.forecast };
    input.decisionId = "pair-1";
    const records = recordsFromAnalysis(input, 1);
    const rules = records.filter(r => r.track === "rule");
    expect(rules).toHaveLength(2);
    expect(new Set(rules.map(r => r.id)).size).toBe(2);
    expect(new Set(rules.map(r => r.snapshotId)).size).toBe(1);
    expect(new Set(rules.map(r => r.decisionId)).size).toBe(1);
    expect(rules[0].trackVersion).toBe("rules-0.6.0-paired");
  });

  it("preserves immutable runs but chooses one primary daily sample", () => {
    const [rule, jev] = recordsFromAnalysis(analysis(), 1);
    const evaluated = { ...jev, outcome: evaluateOutcome(jev, candles, 5) };
    const merged = mergeValidationRecords([rule, evaluated], recordsFromAnalysis(analysis(), 9));
    expect(merged).toHaveLength(4);
    expect(merged.find((record) => record.id === jev.id)).toMatchObject({ analyzedAt: 1, outcome: { evaluatedAt: 5 } });
    expect(primarySamples(merged, "jev-ai")).toHaveLength(1);
    expect(primarySamples(merged, "jev-ai")[0].analyzedAt).toBe(1);
    expect(mergeValidationRecords([evaluated], [{ ...jev, stop: 80 }])[0].stop).toBe(96);
  });

  it("does not count cached results again or pool incompatible versions", () => {
    const cached = analysis({ decisionId: "same-run", decisionTime: "2026-09-01T20:00:00Z" });
    const first = recordsFromAnalysis(cached, 1);
    expect(mergeValidationRecords(first, recordsFromAnalysis(cached, 500))).toHaveLength(2);
    const record = first[1];
    expect(primarySamples([{ ...record, trackVersion: "old" }, record], "jev-ai")).toEqual([record]);
    expect(primarySamples([{ ...record, schemaVersion: undefined }], "jev-ai")).toEqual([]);
  });
});

describe("validation outcomes", () => {
  const [, base] = recordsFromAnalysis(analysis(), 1);
  const jev: ValidationRecord = { ...base, executionPolicy: { version: "test", roundTripCostBps: 10,
    slippageBpsPerSide: 0, minimumHoldBars: 0, marketConstraintsVerified: true } };

  it("measures forward returns from the analysis price by trading bars", () => {
    const outcome = evaluateOutcome(jev, candles, 5)!;
    expect(outcome.returns).toEqual({ 3: 3, 5: 5, 10: 10, 20: 20 });
    expect(outcome).toMatchObject({ complete: true, barsElapsed: 20, plan: "target", planBars: 7, maxGainPct: 21 });
  });

  it("stays incomplete until the longest horizon has elapsed", () => {
    const outcome = evaluateOutcome(jev, candles.slice(0, 6), 5)!;
    expect(outcome.returns).toEqual({ 3: 3, 5: 5 });
    expect(outcome).toMatchObject({ complete: false, plan: "open" });
    expect(evaluateOutcome({ ...jev, barDate: "2027-01-01" }, candles, 5)).toBeUndefined();
  });

  it("does not invent the order when a bar spans both levels", () => {
    const wide = candles.map((candle, index) => (index === 1 ? { ...candle, low: 90, high: 120 } : candle));
    expect(evaluateOutcome(jev, wide, 5)).toMatchObject({ execution: { status: "ambiguous", barsHeld: 1 } });
    expect(evaluateOutcome(jev, wide, 5)?.plan).toBeUndefined();
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
      { ...jev, id: "b", symbol: "SECOND", outlook: "bearish", score: 2, activeSetup: "none", outlookProbabilities: { bullish: 0.1, neutral: 0.2, bearish: 0.7 }, outcome: evaluateOutcome({ ...jev, activeSetup: "none" }, candles, 5) },
      { ...jev, id: "c", symbol: "THIRD" },
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

  it("requires the exact analysis bar and excludes unfinished future bars", () => {
    expect(evaluateOutcome(jev, candles.slice(1), 5)).toBeUndefined();
    const pending = candles.slice(0, 6).map((c, i) => ({ ...c, complete: i !== 5 }));
    expect(evaluateOutcome(jev, pending, 5)?.returns).toEqual({ 3: 3 });
  });

  it("calibrates the declared event rather than any positive return", () => {
    const record = { ...jev, forecast: { ...jev.forecast!, horizon: 5 as const, bandPct: 6 },
      outcome: evaluateOutcome(jev, candles, 5) };
    expect(summarizeTrack("jev-ai", [record]).outlookHitRate).toBe(0);
    expect(jevCalibration([record]).find(b => b.count)?.actualUpRate).toBe(0);
  });
});
