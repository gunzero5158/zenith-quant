import { Candle } from "./indicators";
import { EvidenceSnapshot } from "./evidence";

interface AiNativeAnalysisPromptInput {
  snapshot: EvidenceSnapshot;
  dailyCandles: Candle[];
  weeklyCandles: Candle[];
  language: string;
  currencySymbol: string;
}

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

export function buildAiNativeAnalystPrompt(input: AiNativeAnalysisPromptInput): string {
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

  const payload = {
    language: input.language,
    currencySymbol: input.currencySymbol,
    immutableFacts: {
      snapshot: { ...objectiveSnapshot, dataQuality },
      recentDailyCandles: input.dailyCandles.slice(-20).map(candleSummary),
      recentWeeklyCandles: input.weeklyCandles.slice(-12).map(candleSummary),
    },
  };

  return `You are a senior quantitative technical analyst and the sole decision-maker for a 5-20 trading-day swing assessment.
Output language: ${targetLanguage(input.language)}.
Write every user-visible string in that language. Indicator abbreviations may remain unchanged.

Analytical authority:
- Independently determine market outlook, long-entry attractiveness, setup state, and advice from the supplied objective facts.
- There is no prior score, fixed weighting table, local score cap, or predetermined market regime to preserve.
- Indicator states and direction labels are measurements to interpret in context, not forced conclusions.
- Assign a 0-5 entry-attractiveness score using professional judgment. Semantic anchors only: 0 means no defensible long case, 2.5 means no clear edge, and 5 means an exceptional evidence-backed opportunity.
- Trend direction and entry quality are different judgments.

Evidence boundary:
- Do not recalculate indicators. Use only supplied facts and do not invent fundamentals, news, values, targets, or unseen levels.
- Every score reason and strategy item must cite exact evidence IDs from immutableFacts.snapshot.items.
- Evidence IDs are metadata only. Never include them in any user-visible string.

Decision consistency:
- leftStatus/rightStatus: not_formed, watch, triggered, too_late.
- Use triggered only when the setup is executable now with a grounded stop-target pair and the corresponding entry action. If the structure exists but execution conditions are incomplete, use watch.
- activeSetup: left, right, none. Select left/right only when that setup is triggered and recommended for action.
- holder.action: hold, hold_protect, reduce, exit.
- leftEntry.action: wait, probe, not_applicable. Use probe only with activeSetup=left.
- rightAdd.action: wait_breakout, add_on_retest, avoid_chasing. Use add_on_retest only with activeSetup=right.
- exitStop.trigger: close, intraday.

Risk-plan rules:
- Select stop and target only as exact prices from immutableFacts.snapshot.levels.
- Stop must be below current price and use a support/stop level. Target must be above current price and use a resistance/target level.
- An actionable probe or add_on_retest requires both stop and target. Otherwise recommend waiting.
- Do not return rewardRisk or stopDistancePct; the server derives them.

Confidence calibration:
- Confidence measures certainty in the conclusion, not bullishness or score magnitude.
- Return confidence as a JSON number from 0 to 1. Base it on completeness, agreement across evidence families/timeframes, provisional bars, conflicts, and proximity to confirmation/invalidation.

Writing requirements:
- Synthesize rather than enumerate raw evidence. Include meaningful triggers and material timing/provisional status.
- Overview: 2-3 short paragraphs with direct conclusion, trend quality, price position, opportunity, and risk. Do not repeat the score.
- technicalAnalysis: concise Markdown headings/bullets covering meaningful trend, levels/VPVR/ATR, momentum, volume flow, Ichimoku, patterns, TD, Elliott Wave, and Chanlun findings.
- strategyCommentary: most important confirmation and invalidation conditions without repeating the four strategy items.

Return JSON only:
{
  "overview": "string",
  "technicalAnalysis": "string",
  "strategyCommentary": "string",
  "scoreAssessment": {
    "outlook": "bullish",
    "finalScore": 0,
    "confidence": 0.72,
    "confidenceReason": "string",
    "leftStatus": "watch",
    "rightStatus": "not_formed",
    "activeSetup": "none",
    "riskPlan": {},
    "reasons": [{ "evidenceIds": ["existing.id"], "text": "string" }]
  },
  "strategyAdvice": {
    "holder": { "action": "hold", "evidenceIds": ["existing.id"], "text": "string" },
    "leftEntry": { "action": "wait", "evidenceIds": ["existing.id"], "text": "string" },
    "rightAdd": { "action": "wait_breakout", "evidenceIds": ["existing.id"], "text": "string" },
    "exitStop": { "trigger": "close", "evidenceIds": ["existing.id"], "text": "string" }
  }
}

IMMUTABLE_FACTS:
${JSON.stringify(payload)}`;
}
