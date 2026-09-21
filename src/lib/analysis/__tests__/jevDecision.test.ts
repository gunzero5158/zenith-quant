import { describe, expect, it } from "vitest";
import type { EvidenceSnapshot } from "../evidence";
import type { Candle } from "../indicators";
import { validateAiAnalysisResult } from "../aiAnalysisResult";
import { resolveJevEndpoint } from "../jevClient";
import {
  buildJevDecisionRequest,
  buildJevFollowUpRequest,
  jevConfidenceReason,
  resolveJevDecision,
  resolveJevPrimaryDecision,
  resolveJevReadings,
  summarizeDisagreement,
  withJevReadings,
} from "../jevDecision";
import { buildJevReadingsSection } from "../jevReadingsReport";
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
      id: "daily.pattern.headAndShoulders.forming",
      family: "classicalPattern",
      timeframe: "daily",
      direction: "bearish",
      state: "forming",
      label: "daily.pattern.headAndShoulders.forming",
      description: "右肩弱于头部，顶部派发结构风险升高。",
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

function primaryAnswers(overrides: Record<string, unknown> = {}) {
  return {
    outlook: choice("bullish", { bullish: 0.62, neutral: 0.3, bearish: 0.08 }, 0.43),
    setupStage: choice("right_triggered"),
    ...overrides,
  };
}

function followUpAnswers(overrides: Record<string, unknown> = {}) {
  return {
    entryQuality: { type: "score", score: 3.64, probabilities: {}, confidence: 0.55 },
    holderAction: choice("hold_protect"),
    stopTrigger: choice("close"),
    stopLevel: choice("s2"),
    targetLevel: choice("t1"),
    ...overrides,
  };
}

const request = buildJevDecisionRequest({ snapshot, dailyCandles: candles, weeklyCandles: candles });

function decide(primary: Record<string, unknown> = {}, followUp: Record<string, unknown> = {}) {
  return resolveJevDecision(resolveJevPrimaryDecision(primaryAnswers(primary)), followUpAnswers(followUp), request);
}

describe("Jev decision request", () => {
  it("offers only supplied levels on the correct side of price as candidates", () => {
    expect(request.stopCandidates.map((candidate) => candidate.price)).toEqual([97, 95]);
    expect(request.targetCandidates.map((candidate) => candidate.price)).toEqual([110, 120]);
    const followUp = buildJevFollowUpRequest(request, resolveJevPrimaryDecision(primaryAnswers()));
    const stopQuestion = followUp.questions.stopLevel;
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
    expect(serialized).toContain("daily pattern head and shoulders forming");
    expect(/[^\x00-\x7f]/.test(serialized)).toBe(false);
    expect(serialized).toContain("up (+6.3%)");
  });

  it("hides the rule engine's bullish/bearish tags and asks Jev to read every signal", () => {
    const evidence = request.state.evidence as Record<string, Record<string, unknown>>;
    expect(Object.keys(evidence)).toEqual(request.signals.map((signal) => signal.key));
    expect(Object.values(evidence).every((item) => !("direction" in item))).toBe(true);
    expect(Object.keys(request.readingQuestions)).toEqual(Object.keys(evidence));
    expect(request.signals.map((signal) => signal.id)).toEqual([
      "daily.ema.bullish", "daily.atr.rising", "daily.elliottWave.wave2", "daily.pattern.headAndShoulders.forming",
    ]);
  });

  it("feeds Jev's own readings into the later questions and lists them in the report", () => {
    const readings = resolveJevReadings({
      e1: choice("bullish", { bullish: 0.9, neutral: 0.08, bearish: 0.02 }),
      e2: choice("neutral", { bullish: 0.1, neutral: 0.8, bearish: 0.1 }),
      e3: choice("bearish", { bullish: 0.2, neutral: 0.2, bearish: 0.6 }),
      e4: choice("bearish", { bullish: 0.05, neutral: 0.15, bearish: 0.8 }),
    }, request);
    expect(readings[2]).toEqual({ id: "daily.elliottWave.wave2", family: "elliottWave", timeframe: "daily", direction: "bearish", probability: 0.6 });

    // 1 bullish (0.9) against 2 bearish (0.6 + 0.8): the minority carries 0.9 / 2.3 of the directional weight.
    expect(summarizeDisagreement(readings)).toEqual({
      bullish: 1, neutral: 1, bearish: 2, minorityShare: 0.39, level: "high", timeframesOppose: false,
    });
    expect(summarizeDisagreement(readings.filter((reading) => reading.direction !== "bullish"))).toMatchObject({ minorityShare: 0, level: "low" });
    expect(summarizeDisagreement([
      { ...readings[0], timeframe: "weekly" }, readings[3],
    ]).timeframesOppose).toBe(true);

    const enriched = withJevReadings(request, readings);
    const evidence = enriched.state.evidence as Record<string, Record<string, unknown>>;
    expect(evidence.e1.reading).toBe("bullish (90%)");
    expect((request.state.evidence as Record<string, Record<string, unknown>>).e1.reading).toBeUndefined();

    const section = buildJevReadingsSection(readings, snapshot, "zh-CN");
    expect(section).toContain("### Jev 逐项判读");
    expect(section).toContain("- 日线 头肩顶 · 经典形态形成中：**偏空** 80%");
    expect(section).toContain("- 日线 ATR rising：**中性** 80%");
    expect(section).toContain("**偏空** 60%");
    expect(section).not.toContain("规则标签");
    expect(section).toContain("偏多 1 项、中性 1 项、偏空 2 项。");
    expect(() => resolveJevReadings({ e1: choice("bullish") }, request)).toThrow(/e2/);
  });

  it("asks left and right status as one staged judgment", () => {
    expect(Object.keys(request.primaryQuestions)).toEqual(["outlook", "setupStage"]);
  });

  it("shows earlier decisions to the dependent follow-up questions", () => {
    const followUp = buildJevFollowUpRequest(request, resolveJevPrimaryDecision(primaryAnswers()));
    expect(JSON.stringify(followUp.state.decisionsSoFar)).toContain("bullish 62%");
    expect(JSON.stringify(followUp.state.decisionsSoFar)).toContain("Right-side executable");
    expect(Object.keys(followUp.questions)).toEqual(["entryQuality", "holderAction", "stopTrigger", "stopLevel", "targetLevel"]);
  });

  it("omits level questions when no candidate exists", () => {
    const bare = buildJevDecisionRequest({ snapshot: { ...snapshot, levels: [] }, dailyCandles: [], weeklyCandles: [] });
    const followUp = buildJevFollowUpRequest(bare, resolveJevPrimaryDecision(primaryAnswers()));
    expect(followUp.questions.stopLevel).toBeUndefined();
    expect(followUp.questions.targetLevel).toBeUndefined();
  });
});

describe("Jev decision resolution", () => {
  it("maps a confirmed right-side stage to a coherent left/right pair", () => {
    const decision = decide();
    expect(decision).toMatchObject({
      outlook: "bullish",
      finalScore: 3.5,
      confidence: 0.43,
      setupStage: "right_triggered",
      leftStatus: "too_late",
      rightStatus: "triggered",
      activeSetup: "right",
      leftEntryAction: "not_applicable",
      rightAddAction: "add_on_retest",
      holderAction: "hold_protect",
      stop: 95,
      target: 110,
      adjustments: [],
    });
    expect(jevConfidenceReason(decision, "zh-CN")).toContain("看多 62%");
  });

  it("never reports a triggered side together with a watching opposite side", () => {
    const stages = ["none", "breakdown", "left_watch", "left_triggered", "range_watch", "rebound_underway", "right_watch", "right_triggered", "extended"];
    for (const stage of stages) {
      const decision = decide({ setupStage: choice(stage) });
      if (decision.rightStatus === "triggered") expect(decision.leftStatus).toBe("too_late");
      if (decision.leftStatus === "triggered") expect(decision.rightStatus).toBe("not_formed");
      expect(decision.activeSetup === "left").toBe(decision.leftEntryAction === "probe");
      expect(decision.activeSetup === "right").toBe(decision.rightAddAction === "add_on_retest");
    }
  });

  it("downgrades an executable stage without a stop-target pair", () => {
    const decision = decide({}, { stopLevel: choice("none") });
    expect(decision.stop).toBeUndefined();
    expect(decision.target).toBeUndefined();
    expect(decision.setupStage).toBe("right_watch");
    expect(decision.activeSetup).toBe("none");
    expect(decision.rightStatus).toBe("watch");
    expect(decision.rightAddAction).toBe("wait_breakout");
    expect(decision.holderAction).toBe("hold");
    expect(decision.adjustments.length).toBeGreaterThan(0);
  });

  it("downgrades an executable stage whose chosen levels pay less than the rule-engine threshold", () => {
    const decision = decide({}, { stopLevel: choice("s2"), targetLevel: choice("t1") });
    expect(decision.activeSetup).toBe("right");
    const thin = resolveJevDecision(
      resolveJevPrimaryDecision(primaryAnswers()),
      followUpAnswers(),
      { ...request, price: 106 }
    );
    expect(thin.setupStage).toBe("right_watch");
    expect(thin.activeSetup).toBe("none");
    expect(thin.adjustments.join(" ")).toContain("reward-to-risk");
  });

  it("does not keep an executable long entry under a bearish outlook", () => {
    const decision = decide({
      outlook: choice("bearish", { bullish: 0.1, neutral: 0.2, bearish: 0.7 }),
      setupStage: choice("left_triggered"),
    });
    expect(decision.setupStage).toBe("left_watch");
    expect(decision.leftStatus).toBe("watch");
    expect(decision.leftEntryAction).toBe("wait");
    expect(decision.activeSetup).toBe("none");
  });

  it("rejects answers outside the declared options", () => {
    expect(() => decide({ outlook: choice("moon") })).toThrow(/outlook/);
    expect(() => decide({ setupStage: choice("sideways") })).toThrow(/setupStage/);
    expect(() => decide({}, { stopLevel: choice("s9") })).toThrow(/stopLevel/);
    expect(() => resolveJevPrimaryDecision(undefined)).toThrow();
  });

  it("produces a result that passes the AI-native validator with Jev decisions intact", () => {
    const decision = decide();
    const cite = { evidenceIds: ["daily.ema.bullish"], text: "说明 daily.ema.bullish" };
    const merged = mergeJevDecisionWithReport(decision, {
      overview: "总览",
      technicalAnalysis: "技术面",
      strategyCommentary: "补充",
      reasons: [cite],
      strategyTexts: { holder: { ...cite, action: "exit" }, leftEntry: cite, rightAdd: cite, exitStop: cite },
    }, "zh-CN");
    const result = validateAiAnalysisResult(merged, snapshot, "zh-CN");
    expect(result.scoreAssessment).toMatchObject({ outlook: "bullish", finalScore: 3.5, activeSetup: "right", leftStatus: "too_late" });
    expect(result.scoreAssessment.riskPlan).toMatchObject({ stop: 95, target: 110, rewardRisk: 2 });
    expect(result.strategyAdvice.holder.action).toBe("hold_protect");
    expect(result.strategyAdvice.holder.text).toBe("说明");
  });
});

describe("Jev report prompt and endpoint", () => {
  it("passes decisions as immutable input without leaking rule conclusions", () => {
    const prompt = buildJevReportPrompt({
      snapshot,
      decision: decide(),
      dailyCandles: candles,
      weeklyCandles: candles,
      language: "zh-CN",
      currencySymbol: "$",
    });
    expect(prompt).toContain('"immutableDecision"');
    expect(prompt).toContain('"outlook":"bullish"');
    expect(prompt).not.toContain('"direction":"bullish","state"');
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
