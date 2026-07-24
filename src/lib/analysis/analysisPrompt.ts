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
  const { scoreCap: omittedScoreCap, ...dataQuality } = input.snapshot.dataQuality;
  void omittedScoreCap;
  const payload = {
    language: input.language,
    currencySymbol: input.currencySymbol,
    immutableFacts: {
      snapshot: { ...input.snapshot, dataQuality },
      recentDailyCandles: input.dailyCandles.slice(-20).map(candleSummary),
      recentWeeklyCandles: input.weeklyCandles.slice(-12).map(candleSummary),
    },
  };
  const outputLanguage = targetLanguage(input.language);
  return `You are a senior quantitative technical analyst. Review the immutable technical facts below for a 5-20 trading-day swing decision.
Output language: ${outputLanguage}.
Write every user-visible string in that language, including headings, explanations, score reasons, and strategy text. Indicator abbreviations such as MACD, KDJ, RSI, EMA, BOLL, ATR, CMF, OBV, and VPVR may remain unchanged.

Do not recalculate MACD, KDJ, RSI, EMA, BOLL, Ichimoku, ATR, Fibonacci, TD Sequential, classical patterns, candlesticks, volume, CMF, OBV, VPVR, Elliott Wave, or Chanlun. Use the supplied event timing and provisional daily/weekly status.
Independently assign a 0-5 score for current new-entry attractiveness over the next 5-20 trading days. Use your professional judgment across the supplied evidence; there are no fixed weights and no precomputed score to adjust. Trend strength alone is not entry quality.
Every score reason must cite one or more exact evidence IDs from immutableFacts.snapshot.items. Never invent an evidence ID. Do not change or manufacture indicator values or price levels.
Holder, left entry, right add, and exit/stop are separate strategies. Select only the allowed action values shown in the JSON shape.
Allowed values:
- leftStatus/rightStatus: not_formed, watch, triggered, too_late
- activeSetup: left, right, none
- holder.action: hold, hold_protect, reduce, exit
- leftEntry.action: wait, probe, not_applicable
- rightAdd.action: wait_breakout, add_on_retest, avoid_chasing
- exitStop.trigger: close, intraday

Writing requirements:
- Synthesize the evidence into an analyst view. Do not translate or enumerate the raw evidence list.
- Review every supplied indicator and pattern internally. Omit categories that have no distinctive or actionable information, and combine evidence that supports the same conclusion.
- Never omit confirmed or recent trigger events such as a golden/death cross, divergence, breakout/breakdown, volume confirmation, active classical pattern, or active candlestick pattern.
- For every included category, state its current fact or value, its plain-language meaning, and its effect on the 5-20 trading-day decision. Mention event timing and provisional status when they materially change confidence.
- The overview must contain 2-3 short paragraphs covering the bull/bear view, trend quality, current price position, main opportunity, and main risk. Do not repeat the score shown in the interface.
- The technicalAnalysis must use concise Markdown headings and bullets. Organize only the meaningful findings among trend and multi-timeframe structure; support/resistance, Fibonacci, VPVR and ATR; MACD/KDJ/RSI; volume/CMF/OBV; Ichimoku; classical and candlestick patterns; TD Sequential; Elliott Wave; and Chanlun.
- The strategyCommentary should explain the most important change conditions without repeating the four-part strategy verbatim.
- Use only supplied facts. Do not invent fundamentals, news, targets, or unseen price levels.
- Risk-plan numbers and stop fields must come from supplied levels. Omit optional numeric fields when the evidence does not support them.

Return JSON only with this shape:
{
  "overview": "string",
  "technicalAnalysis": "string",
  "strategyCommentary": "string",
  "scoreAssessment": {
    "finalScore": 0,
    "confidence": 0,
    "leftStatus": "watch",
    "rightStatus": "not_formed",
    "activeSetup": "left",
    "riskPlan": {},
    "reasons": [{ "evidenceIds": ["existing.id"], "text": "string" }]
  },
  "strategyAdvice": {
    "holder": { "action": "hold_protect", "text": "string" },
    "leftEntry": { "action": "wait", "text": "string" },
    "rightAdd": { "action": "wait_breakout", "text": "string" },
    "exitStop": { "trigger": "close", "text": "string" }
  }
}

IMMUTABLE_FACTS:
${JSON.stringify(payload)}`;
}
