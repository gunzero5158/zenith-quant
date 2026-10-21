import { describe, expect, it } from "vitest";
import type { EvidenceSnapshot } from "../evidence";
import { toLegacyAiScoreDetail, validateAiAnalysisResult } from "../aiAnalysisResult";
import { buildTradePlans } from "../opportunities";

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

describe("AI report fact and consistency validation", () => {
  it("preserves model prose, score and judgment while deriving arithmetic", () => {
    const value = validResult();
    const result = validateAiAnalysisResult(value, snapshot);
    expect(result.overview).toBe(value.overview);
    expect(result.technicalAnalysis).toBe(value.technicalAnalysis);
    expect(result.strategyCommentary).toBe(value.strategyCommentary);
    expect(result.strategyAdvice).toEqual(value.strategyAdvice);
    expect(result.scoreAssessment.riskPlan).toMatchObject({stop:95,target:112,rewardRisk:2.4});
    expect(toLegacyAiScoreDetail(result.scoreAssessment).totalScore).toBe(3.75);
  });
  it.each([-0.01, 5.01, Number.NaN])("rejects invalid score %s", finalScore => {
    const value = validResult(); value.scoreAssessment.finalScore = finalScore;
    expect(() => validateAiAnalysisResult(value, snapshot)).toThrow(/finalScore/);
  });
  it.each([[78,0.78],["78%",0.78],["0.78",0.78],[1,1]])("normalizes confidence format %s", (confidence,expected) => {
    const value = validResult(); value.scoreAssessment.confidence = confidence as number;
    expect(validateAiAnalysisResult(value,snapshot).scoreAssessment.confidence).toBe(expected);
  });
  it.each([-1,101,"not-a-number"])("rejects invalid confidence %s", confidence => {
    const value = validResult(); value.scoreAssessment.confidence = confidence as number;
    expect(() => validateAiAnalysisResult(value,snapshot)).toThrow(/confidence/);
  });
  it("rejects fabricated evidence without substituting local prose", () => {
    const value = validResult(); value.scoreAssessment.reasons[0].evidenceIds = ["invented"];
    expect(() => validateAiAnalysisResult(value,snapshot)).toThrow(/Unknown evidence/);
  });
  it.each([{stop:101,target:112},{stop:95,target:99},{stop:94,target:112},{stop:95,target:113}])("rejects ungrounded prices %j", riskPlan => {
    const value = validResult(); value.scoreAssessment.riskPlan = riskPlan;
    const copy = structuredClone(value);
    expect(() => validateAiAnalysisResult(value,snapshot)).toThrow(/riskPlan/);
    expect(value).toEqual(copy);
  });
  it("rejects contradictory status/action and missing risk without changing the model response", () => {
    const value = validResult(); value.scoreAssessment.leftStatus = "watch";
    expect(() => validateAiAnalysisResult(value,snapshot)).toThrow(/triggered leftStatus/);
    expect(value.strategyAdvice.leftEntry.action).toBe("probe");
    const incomplete = validResult();
    incomplete.scoreAssessment.riskPlan = {stop:95} as {stop:number;target:number};
    expect(() => validateAiAnalysisResult(incomplete,snapshot)).toThrow(/both a grounded stop and target/);
  });
  it("rejects protective hold without stop rather than recommending hold locally", () => {
    const value = validResult();
    Object.assign(value.scoreAssessment,{activeSetup:"none",leftStatus:"watch",riskPlan:{}});
    value.strategyAdvice.leftEntry.action = "wait";
    expect(() => validateAiAnalysisResult(value,snapshot)).toThrow(/hold_protect/);
  });
  it("does not cap a model watch score or replace any text", () => {
    const value = validResult();
    Object.assign(value.scoreAssessment,{leftStatus:"watch",activeSetup:"none",finalScore:4.5});
    value.strategyAdvice.leftEntry.action = "wait";
    const result=validateAiAnalysisResult(value,{...snapshot,tradePlans:buildTradePlans(snapshot)});
    expect(result.scoreAssessment.finalScore).toBe(4.5);
    expect(result.technicalAnalysis).toBe(value.technicalAnalysis);
    expect(result.normalized).toBe(false);
  });
  it("allows a model plan despite provisional bars, local confirmation and reward-risk thresholds", () => {
    const input = {...snapshot,price:110,tradePlans:buildTradePlans(snapshot),
      dataQuality:{...snapshot.dataQuality,dailyBarComplete:false,dailySamples:20}};
    const value=validResult();
    Object.assign(value.scoreAssessment,{selectedPlanId:input.tradePlans[0].id});
    const result=validateAiAnalysisResult(value,input);
    expect(result.scoreAssessment.activeSetup).toBe("left");
    expect(result.scoreAssessment.riskPlan.rewardRisk).toBe(0.13);
    expect(result.scoreAssessment.finalScore).toBe(3.75);
    expect(result.strategyAdvice.leftEntry.text).toBe(value.strategyAdvice.leftEntry.text);
  });
  it("supports independent combinations of supplied levels without choosing a local plan", () => {
    const value=validResult();
    Object.assign(value.scoreAssessment,{opportunityKind:"rebound",horizon:5,selectedPlanId:null,
      currentTrend:{daily:"bearish",weekly:"neutral"}});
    const result=validateAiAnalysisResult(value,snapshot);
    expect(result.scoreAssessment.opportunity?.plan.id).toBe("model:rebound");
    expect(result.scoreAssessment.forecast?.horizon).toBe(5);
    expect(result.scoreAssessment.currentTrend).toEqual({daily:"bearish",weekly:"neutral"});
  });
  it("preserves a target in an observation even if no stop has been selected", () => {
    const value=validResult();
    Object.assign(value.scoreAssessment,{activeSetup:"none",leftStatus:"watch",riskPlan:{target:112}});
    value.strategyAdvice.leftEntry.action="wait"; value.strategyAdvice.holder.action="hold";
    expect(validateAiAnalysisResult(value,snapshot).scoreAssessment.riskPlan.target).toBe(112);
  });
  it("rejects a horizon mismatch rather than silently relabeling the forecast", () => {
    const value=validResult(); Object.assign(value.scoreAssessment,{opportunityKind:"rebound",horizon:10});
    expect(() => validateAiAnalysisResult(value,snapshot)).toThrow(/horizon/);
  });
  it("rejects an active entry paired with an explicit no-opportunity conclusion", () => {
    const value=validResult(); Object.assign(value.scoreAssessment,{opportunityKind:null});
    expect(() => validateAiAnalysisResult(value,snapshot)).toThrow(/opportunityKind=null/);
  });
  it("removes machine IDs without rewriting the analysis", () => {
    const value=validResult(); value.technicalAnalysis="MACD improving (`daily.macd.cross`).";
    expect(validateAiAnalysisResult(value,snapshot).technicalAnalysis).toBe("MACD improving.");
  });
});
