import { Candle } from "./indicators";
import { EvidenceSnapshot } from "./evidence";
import { JevDecision, jevConfidenceReason } from "./jevDecision";

interface JevReportPromptInput {
  snapshot: EvidenceSnapshot;
  decision: JevDecision;
  dailyCandles: Candle[];
  weeklyCandles: Candle[];
  language: string;
  currencySymbol: string;
}

export const JEV_REPORT_SYSTEM_BOUNDARY = "You explain decisions made by a separate decision model. Its probabilities are not validated trading win rates. Treat the supplied evidence and final decision as immutable. Never contradict the opportunity, horizon, score, status, action, stop, or target. Distinguish current trend from the exact future forecast event. Do not invent data. Evidence IDs may appear only in evidenceIds arrays, never user-visible prose.";

function candleSummary(candle: Candle) {
  return {
    date: String(candle.date).slice(0, 10),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

function targetLanguage(language: string): string {
  if (language === "en") return "English";
  if (language === "ja") return "Japanese";
  if (language === "zh-TW" || language === "zh-HK") return "Traditional Chinese";
  return "Simplified Chinese";
}

export function buildJevReportPrompt(input: JevReportPromptInput): string {
  const { scoreCap: omittedScoreCap, ...dataQuality } = input.snapshot.dataQuality;
  const {
    weeklyRegime: omittedWeeklyRegime,
    dailyPhase: omittedDailyPhase,
    dataQuality: omittedDataQuality,
    ...objectiveSnapshot
  } = input.snapshot;
  void omittedScoreCap;
  void omittedWeeklyRegime;
  void omittedDailyPhase;
  void omittedDataQuality;

  // As in LLM-native mode, the rule engine's bullish/bearish tags are withheld;
  // Jev's readings are the only interpretation the report builds on.
  const items = objectiveSnapshot.items.map((item) => {
    const { direction: omittedDirection, ...facts } = item;
    void omittedDirection;
    return facts;
  });

  const { adjustments, ...decision } = input.decision;
  const payload = {
    language: input.language,
    currencySymbol: input.currencySymbol,
    immutableDecision: {
      ...decision,
      consistencyAdjustments: adjustments,
    },
    immutableFacts: {
      snapshot: { ...objectiveSnapshot, items, dataQuality },
      recentDailyCandles: input.dailyCandles.slice(-20).map(candleSummary),
      recentWeeklyCandles: input.weeklyCandles.slice(-12).map(candleSummary),
    },
  };

  return `You are a senior quantitative technical analyst writing the report for a 5-20 trading-day swing assessment.
Output language: ${targetLanguage(input.language)}.
Write every user-visible string in that language. Indicator abbreviations may remain unchanged.

Division of labor:
- A decision model (Jev) has already made every judgment in immutableDecision: the declared forecast event with probabilities, 0-5 entry attractiveness, opportunity status, actions, stop trigger, and stop/target prices. A weak current trend can coexist with a short rebound opportunity; do not confuse the horizons.
- Your job is to explain those decisions with the supplied evidence so that a reader understands why they are reasonable, what would confirm them, and what would invalidate them.
- Never change, soften, or contradict a decision. If the evidence contains a meaningful counter-argument, present it as a risk or as a condition that would change the view, not as a different conclusion.
- immutableDecision.readings holds Jev's own bullish/neutral/bearish reading of each evidence item (matched by id), made in the context of all evidence. Use these readings when you describe what a signal implies.
- outlookProbabilities and confidence are model outputs, not validated trading win rates. The forecast horizon and price boundaries are in immutableDecision.forecast. An even split means low conviction; high disagreement is not itself a bullish signal.
- immutableDecision.disagreement counts how the readings split between bullish and bearish (minorityShare 0 is one-sided, 0.5 is an even split) and whether the daily and weekly readings lean in opposite directions. Describe a high split as genuinely mixed evidence.

Evidence boundary:
- Do not recalculate indicators. Use only supplied facts and do not invent fundamentals, news, values, targets, or unseen levels.
- The only stop and target you may mention as the plan are immutableDecision.stop and immutableDecision.target. If either is absent, say that no defensible level is available and recommend waiting.
- Every reason and strategy item must cite exact evidence IDs from immutableFacts.snapshot.items.
- Evidence IDs are metadata only. Never include them in any user-visible string.

Writing requirements:
- Synthesize rather than enumerate raw evidence. Include meaningful triggers and material timing/provisional status.
- overview: 2-3 short paragraphs with the direct conclusion, trend quality, price position, opportunity, and risk. Do not repeat the score.
- technicalAnalysis: concise Markdown headings/bullets covering meaningful trend, levels/VPVR/ATR, momentum, volume flow, Ichimoku, patterns, TD, Elliott Wave, and Chanlun findings.
- strategyCommentary: most important confirmation and invalidation conditions without repeating the four strategy items.
- reasons: 3-5 items explaining the finalScore and outlook.
- strategyTexts: one short paragraph each, consistent with holderAction, leftEntryAction, rightAddAction, and stopTrigger.

Return JSON only:
{
  "overview": "string",
  "technicalAnalysis": "string",
  "strategyCommentary": "string",
  "reasons": [{ "evidenceIds": ["existing.id"], "text": "string" }],
  "strategyTexts": {
    "holder": { "evidenceIds": ["existing.id"], "text": "string" },
    "leftEntry": { "evidenceIds": ["existing.id"], "text": "string" },
    "rightAdd": { "evidenceIds": ["existing.id"], "text": "string" },
    "exitStop": { "evidenceIds": ["existing.id"], "text": "string" }
  }
}

IMMUTABLE_INPUT:
${JSON.stringify(payload)}`;
}

function section(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Combines Jev's decisions with the LLM's prose into the AI-native result shape,
 * so validateAiAnalysisResult can enforce the same grounding and consistency rules.
 * Decisions always come from Jev; the LLM contributes text and evidence citations only.
 */
export function mergeJevDecisionWithReport(
  decision: JevDecision,
  llmReport: unknown,
  language: "zh-CN" | "zh-TW" | "en" | "ja"
): Record<string, unknown> {
  const report = section(llmReport);
  const texts = section(report.strategyTexts);
  const advice = (key: string, field: "action" | "trigger", value: string) => ({
    ...section(texts[key]),
    [field]: value,
  });

  return {
    overview: report.overview,
    technicalAnalysis: report.technicalAnalysis,
    strategyCommentary: report.strategyCommentary,
    scoreAssessment: {
      outlook: decision.outlook,
      finalScore: decision.finalScore,
      confidence: decision.confidence,
      confidenceReason: jevConfidenceReason(decision, language),
      leftStatus: decision.leftStatus,
      rightStatus: decision.rightStatus,
      activeSetup: decision.activeSetup,
      selectedPlanId: decision.selectedPlanId,
      riskPlan: { stop: decision.stop, target: decision.target },
      reasons: report.reasons,
    },
    strategyAdvice: {
      holder: advice("holder", "action", decision.holderAction),
      leftEntry: advice("leftEntry", "action", decision.leftEntryAction),
      rightAdd: advice("rightAdd", "action", decision.rightAddAction),
      exitStop: advice("exitStop", "trigger", decision.stopTrigger),
    },
  };
}
