import { describe, expect, it } from "vitest";
import type { EvidenceSnapshot } from "../evidence";
import type { Candle } from "../indicators";
import { validateAiAnalysisResult } from "../aiAnalysisResult";
import { resolveJevEndpoint } from "../jevClient";
import { buildJevDecisionRequest, jevConfidenceReason, resolveJevDecision } from "../jevDecision";
import { buildJevReportPrompt, mergeJevDecisionWithReport } from "../jevReportPrompt";

const snapshot: EvidenceSnapshot = {
  version: "2.0",
  symbol: "TEST",
  price: 100,
  dataQuality: {
    asOf: "2026-09-21T06:00:00.000Z",
    dailyBarComplete: true,
    weeklyBarComplete: false,
    dailySamples: 120,
    weeklySamples: 60,
    missingFamilies: [],
    scoreCap: 3.2,
    warnings: [],
  },
  items: [
    {
      id: "daily.ema.bullish",
      family: "ema",
      timeframe: "daily",
      direction: "bullish",
      state: "bullish",
      label: "daily.ema.bullish",
      description: "EMA order is bullish; price is above_all.",
      provisional: false,
      reliability: 0.9,
      values: { order: "bullish", ema5: 99.1, ema20: 96.4 },
    },
    {
      id: "daily.atr.rising",
      family: "atr",
      timeframe: "daily",
      direction: "neutral",
      state: "rising",
      label: "daily.atr.rising",
      description: "ATR is 2% of price and rising.",
      provisional: false,
      reliability: 0.9,
      values: { value: 2, percentOfPrice: 2 },
    },
    {
      id: "weekly.vpvr.unavailable",
      family: "vpvr",
      timeframe: "weekly",
      direction: "neutral",
      state: "unavailable",
      label: "VPVR",
      description: "Insufficient samples for vpvr.",
      provisional: false,
      reliability: 0,
    },
    {
      id: "daily.elliottWave.wave2",
      family: "elliottWave",
      timeframe: "daily",
      direction: "bullish",
      state: "第 2 浪筑底蓄势 (Wave 2 Bottoming)",
      label: "daily.elliottWave.wave2",
      description: "处于 1 浪反弹后的 2 浪横盘整理蓄势段。",
      provisional: false,
      reliability: 0.9,
    },
    {
      id: "daily.fibonacci.neutral",
      family: "fibonacci",
      timeframe: "daily",
      direction: "neutral",
      state: "neutral",
      label: "No active signal",
      description: "No active fibonacci signal.",
      provisional: false,
      reliability: 0.9,
    },
  ],
  levels: [
    { price: 97, kind: "support", source: "ema", strength: 0.6 },
    { price: 95, kind: "support", source: "horizontal", strength: 0.8, hits: 3 },
    { price: 110, kind: "resistance", source: "horizontal", strength: 0.8 },
    { price: 120, kind: "target", source: "pattern", strength: 0.4 },
    { price: 105, kind: "support", source: "boll", strength: 0.5 },
  ],
  weeklyRegime: "bearish",
  dailyPhase: "range",
};

const candles: Candle[] = Array.from({ length: 70 }, (_, index) => ({
  date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
  open: 80 + index * 0.3,
  high: 81 + index * 0.3,
  low: 79 + index * 0.3,
  close: 80 + index * 0.3,
  volume: 1000,
})) as Candle[];

function choice(value: string, probabilities: Record<string, number> = { [value]: 0.8 }, confidence = 0.7) {
  return { type: "choice", choice: value, probabilities, confidence };
}

function answers(overrides: Record<string, unknown> = {}) {
  return {
    outlook: choice("bullish", { bullish: 0.62, neutral: 0.3, bearish: 0.08 }, 0.43),
    entryQuality: { type: "score", score: 3.64, probabilities: {}, confidence: 0.55 },
    leftStatus: choice("watch"),
    rightStatus: choice("triggered"),
    preferredSetup: choice("right"),
    holderAction: choice("hold_protect"),
    leftEntryAction: choice("wait"),
    rightAddAction: choice("add_on_retest"),
    stopTrigger: choice("close"),
    stopLevel: choice("s2"),
    targetLevel: choice("t1"),
    evidenceConflict: { type: "noul", noul: 0.21 },
    ...overrides,
  };
}

describe("Jev decision request", () => {
  const request = buildJevDecisionRequest({ snapshot, dailyCandles: candles, weeklyCandles: candles });

  it("offers only supplied levels on the correct side of price as candidates", () => {
    expect(request.stopCandidates.map((candidate) => candidate.price)).toEqual([97, 95]);
    expect(request.targetCandidates.map((candidate) => candidate.price)).toEqual([110, 120]);
    const stopQuestion = request.questions.stopLevel;
    expect(stopQuestion.type === "choice" && Object.keys(stopQuestion.criteria)).toEqual(["s1", "s2", "none"]);
  });

  it("sends semantic evidence without raw indicator numbers, rule conclusions, or unavailable items", () => {
    const serialized = JSON.stringify(request.state);
    expect(serialized).toContain("EMA order is bullish");
    expect(serialized).not.toContain("ema5");
    expect(serialized).not.toContain("weeklyRegime");
    expect(serialized).not.toContain("scoreCap");
    expect(serialized).not.toContain("Insufficient samples");
    expect(serialized).not.toContain("No active");
    expect(serialized).toContain("Wave 2 Bottoming");
    expect(/[^\x00-\x7f]/.test(serialized)).toBe(false);
    expect(serialized).toContain("up (+6.3%)");
  });

  it("omits level questions when no candidate exists", () => {
    const bare = buildJevDecisionRequest({ snapshot: { ...snapshot, levels: [] }, dailyCandles: [], weeklyCandles: [] });
    expect(bare.questions.stopLevel).toBeUndefined();
    expect(bare.questions.targetLevel).toBeUndefined();
  });
});

describe("Jev decision resolution", () => {
  const request = buildJevDecisionRequest({ snapshot, dailyCandles: candles, weeklyCandles: candles });

  it("maps consistent answers to a grounded decision", () => {
    const decision = resolveJevDecision(answers(), request);
    expect(decision).toMatchObject({
      outlook: "bullish",
      finalScore: 3.6,
      confidence: 0.43,
      rightStatus: "triggered",
      activeSetup: "right",
      rightAddAction: "add_on_retest",
      holderAction: "hold_protect",
      stop: 95,
      target: 110,
      adjustments: [],
    });
    expect(jevConfidenceReason(decision, "zh-CN")).toContain("看多 62%");
  });

  it("downgrades an entry that independent answers do not jointly support", () => {
    const decision = resolveJevDecision(answers({ stopLevel: choice("none"), leftEntryAction: choice("probe") }), request);
    expect(decision.stop).toBeUndefined();
    expect(decision.target).toBeUndefined();
    expect(decision.activeSetup).toBe("none");
    expect(decision.rightStatus).toBe("watch");
    expect(decision.rightAddAction).toBe("wait_breakout");
    expect(decision.leftEntryAction).toBe("wait");
    expect(decision.holderAction).toBe("hold");
    expect(decision.adjustments.length).toBeGreaterThan(0);
  });

  it("keeps a single active setup when both sides look actionable", () => {
    const decision = resolveJevDecision(answers({
      leftStatus: choice("triggered"),
      leftEntryAction: choice("probe"),
      preferredSetup: choice("left"),
    }), request);
    expect(decision.activeSetup).toBe("left");
    expect(decision.rightStatus).toBe("watch");
    expect(decision.rightAddAction).toBe("wait_breakout");
  });

  it("rejects answers outside the declared options", () => {
    expect(() => resolveJevDecision(answers({ outlook: choice("moon") }), request)).toThrow(/outlook/);
    expect(() => resolveJevDecision(answers({ stopLevel: choice("s9") }), request)).toThrow(/stopLevel/);
    expect(() => resolveJevDecision(undefined, request)).toThrow();
  });

  it("produces a result that passes the AI-native validator with Jev decisions intact", () => {
    const decision = resolveJevDecision(answers(), request);
    const cite = { evidenceIds: ["daily.ema.bullish"], text: "说明 daily.ema.bullish" };
    const merged = mergeJevDecisionWithReport(decision, {
      overview: "总览",
      technicalAnalysis: "技术面",
      strategyCommentary: "补充",
      reasons: [cite],
      strategyTexts: { holder: { ...cite, action: "exit" }, leftEntry: cite, rightAdd: cite, exitStop: cite },
    }, "zh-CN");
    const result = validateAiAnalysisResult(merged, snapshot, "zh-CN");
    expect(result.scoreAssessment).toMatchObject({ outlook: "bullish", finalScore: 3.6, activeSetup: "right" });
    expect(result.scoreAssessment.riskPlan).toMatchObject({ stop: 95, target: 110, rewardRisk: 2 });
    expect(result.strategyAdvice.holder.action).toBe("hold_protect");
    expect(result.strategyAdvice.holder.text).toBe("说明");
  });
});

describe("Jev report prompt and endpoint", () => {
  it("passes decisions as immutable input without leaking rule conclusions", () => {
    const request = buildJevDecisionRequest({ snapshot, dailyCandles: candles, weeklyCandles: candles });
    const prompt = buildJevReportPrompt({
      snapshot,
      decision: resolveJevDecision(answers(), request),
      dailyCandles: candles,
      weeklyCandles: candles,
      language: "zh-CN",
      currencySymbol: "$",
    });
    expect(prompt).toContain('"immutableDecision"');
    expect(prompt).toContain('"outlook":"bullish"');
    expect(prompt).not.toContain("weeklyRegime");
    expect(prompt).not.toContain("scoreCap");
  });

  it("normalizes the Jev endpoint", () => {
    expect(resolveJevEndpoint(undefined)).toBe("https://api.typesafe.ai/v1/systemone");
    expect(resolveJevEndpoint("https://proxy.example.com/v1/")).toBe("https://proxy.example.com/v1/systemone");
    expect(resolveJevEndpoint("https://proxy.example.com/v1/systemone")).toBe("https://proxy.example.com/v1/systemone");
    expect(() => resolveJevEndpoint("http://169.254.169.254")).toThrow();
  });
});
