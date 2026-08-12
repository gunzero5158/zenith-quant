import { Candle } from "./indicators";
import { EvidenceSnapshot } from "./evidence";

export interface AnalysisPromptInput {
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

export function buildEvidenceAnalystPrompt(input: AnalysisPromptInput): string {
  const {
    scoreCap: omittedScoreCap,
    ...dataQuality
  } = input.snapshot.dataQuality;
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
  const outputLanguage = targetLanguage(input.language);

  return `You are a senior quantitative technical analyst and the sole decision-maker for a 5-20 trading-day swing assessment.
Output language: ${outputLanguage}.
Write every user-visible string in that language, including headings, explanations, confidence reasoning, score reasons, and strategy text. Indicator abbreviations such as MACD, KDJ, RSI, EMA, BOLL, ATR, CMF, OBV, and VPVR may remain unchanged.

Analytical authority:
- Independently determine the market outlook, current long-entry attractiveness, setup state, and advice from the supplied objective facts.
- There is no prior score, fixed weighting table, local score cap, or predetermined market regime to preserve. Do not infer one.
- Treat supplied indicator states and direction labels as measurements to interpret in context, not as a forced conclusion.
- Assign a 0-5 entry-attractiveness score using professional judgment. As semantic anchors only: 0 means no defensible long case, 2.5 means no clear edge, and 5 means an exceptional evidence-backed opportunity.
- Trend direction and entry quality are different judgments. A bullish trend can still be a poor entry, and a bearish trend can contain only a speculative reversal setup.

Evidence boundary:
- Do not recalculate MACD, KDJ, RSI, EMA, BOLL, Ichimoku, ATR, Fibonacci, TD Sequential, classical patterns, candlesticks, volume, CMF, OBV, VPVR, Elliott Wave, or Chanlun.
- Use only supplied facts. Do not invent fundamentals, news, indicator values, targets, or unseen price levels.
- Every score reason and every strategy item must cite one or more exact evidence IDs from immutableFacts.snapshot.items in its evidenceIds field. Never invent an evidence ID.
- Evidence IDs are machine-readable metadata only. Never include evidence IDs in any user-visible string, including overview, technicalAnalysis, strategyCommentary, confidenceReason, reason text, or strategy text.

Decision consistency:
- leftStatus/rightStatus allowed values: not_formed, watch, triggered, too_late.
- activeSetup allowed values: left, right, none. Use left or right only when that same setup is triggered and is the setup you recommend acting on; otherwise use none.
- holder.action: hold, hold_protect, reduce, exit.
- leftEntry.action: wait, probe, not_applicable. Use probe only with activeSetup=left.
- rightAdd.action: wait_breakout, add_on_retest, avoid_chasing. Use add_on_retest only with activeSetup=right.
- exitStop.trigger: close, intraday.

Risk-plan rules:
- Select every stop and target as an exact price from immutableFacts.snapshot.levels.
- A stop must be below the current price and use a supplied support or stop level.
- A target must be above the current price and use a supplied resistance or target level.
- If recommending probe or add_on_retest, provide both stop and target. If no defensible pair exists, recommend waiting or avoiding instead.
- Do not return rewardRisk or stopDistancePct; the server derives those arithmetic fields from the selected prices.
- Omit stop and target when the supplied levels do not support a coherent plan.

Confidence calibration:
- confidence measures certainty in the conclusion, not bullishness and not score magnitude.
- Return confidence as a JSON number from 0 to 1, where 0.78 means 78%. Never return 78, "78%", or a percentage string.
- Base it on data completeness, agreement across independent evidence families and timeframes, provisional-bar status, conflicting signals, and proximity to confirmation or invalidation.
- Explain the main reason for the confidence value in confidenceReason. Do not use a mechanical cap.

Writing requirements:
- Synthesize the evidence into an analyst view. Do not translate or enumerate the raw evidence list.
- Review every supplied indicator and pattern internally. Omit categories that have no distinctive or actionable information, and combine evidence supporting the same conclusion.
- Never omit confirmed or recent trigger events such as a golden/death cross, divergence, breakout/breakdown, volume confirmation, active classical pattern, or active candlestick pattern.
- For every included category, state its current fact or value, plain-language meaning, and effect on the 5-20 trading-day decision. Mention event timing and provisional status when material.
- The overview must contain 2-3 short paragraphs with a direct bullish/neutral/bearish conclusion, trend quality, price position, main opportunity, and main risk. Do not repeat the numeric score.
- The technicalAnalysis must use concise Markdown headings and bullets, covering only meaningful findings among trend and multi-timeframe structure; support/resistance, Fibonacci, VPVR and ATR; MACD/KDJ/RSI; volume/CMF/OBV; Ichimoku; patterns; TD Sequential; Elliott Wave; and Chanlun.
- The strategyCommentary should state the most important confirmation and invalidation conditions without repeating the four strategy items.

Return JSON only with this shape:
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
