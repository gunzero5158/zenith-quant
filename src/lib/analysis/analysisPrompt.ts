import { Candle } from "./indicators";
import { EvidenceSnapshot } from "./evidence";
import { EntryAssessment } from "./scoring";
import { StrategyAdvice } from "./strategyAdvice";

export interface AnalysisPromptInput {
  snapshot: EvidenceSnapshot;
  entryAssessment: EntryAssessment;
  strategyAdvice: StrategyAdvice;
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
  const payload = {
    language: input.language,
    currencySymbol: input.currencySymbol,
    immutableFacts: {
      snapshot: input.snapshot,
      ruleAssessment: input.entryAssessment,
      strategy: input.strategyAdvice,
      recentDailyCandles: input.dailyCandles.slice(-20).map(candleSummary),
      recentWeeklyCandles: input.weeklyCandles.slice(-12).map(candleSummary),
    },
  };
  const outputLanguage = targetLanguage(input.language);
  return `You are a senior quantitative technical analyst. Review the immutable technical facts below for a 5-20 trading-day swing decision.
Output language: ${outputLanguage}.
Write every user-visible string in that language, including headings, explanations, strategy commentary, score-review reasons, conflicts, and change conditions. Indicator abbreviations such as MACD, KDJ, RSI, EMA, BOLL, ATR, CMF, OBV, and VPVR may remain unchanged.

Do not recalculate MACD, KDJ, RSI, EMA, BOLL, Ichimoku, ATR, Fibonacci, TD Sequential, classical patterns, candlesticks, volume, CMF, OBV, VPVR, Elliott Wave, or Chanlun. Use the supplied event timing and provisional daily/weekly status.
The 0-5 rule score measures current new-entry attractiveness, not trend strength. Holder, left entry, right add, and exit/stop are separate strategies.
You may adjust the rule score by at most +/-0.5. A nonzero adjustment must cite existing evidence IDs and cannot exceed hardCap.

Writing requirements:
- Synthesize the evidence into an analyst view. Do not translate or enumerate the raw evidence list.
- Review every supplied indicator and pattern internally. Omit categories that have no distinctive or actionable information, and combine evidence that supports the same conclusion.
- Never omit confirmed or recent trigger events such as a golden/death cross, divergence, breakout/breakdown, volume confirmation, active classical pattern, or active candlestick pattern.
- For every included category, state its current fact or value, its plain-language meaning, and its effect on the 5-20 trading-day decision. Mention event timing and provisional status when they materially change confidence.
- The overview must contain 2-3 short paragraphs covering the bull/bear view, trend quality, current price position, main opportunity, and main risk. Do not repeat the Rule/AI/Final score breakdown already shown in the interface.
- The technicalAnalysis must use concise Markdown headings and bullets. Organize only the meaningful findings among trend and multi-timeframe structure; support/resistance, Fibonacci, VPVR and ATR; MACD/KDJ/RSI; volume/CMF/OBV; Ichimoku; classical and candlestick patterns; TD Sequential; Elliott Wave; and Chanlun.
- The strategyCommentary should add context or change conditions without repeating the supplied four-part holder, left-entry, right-add, and exit/stop strategy verbatim.
- Use only supplied facts. Do not invent fundamentals, news, targets, or unseen price levels.

Return JSON only with this shape:
{
  "overview": "string",
  "technicalAnalysis": "string",
  "strategyCommentary": "string",
  "scoreReview": {
    "adjustment": 0,
    "confidence": 0,
    "alignment": "agree",
    "reasons": [{ "evidenceIds": ["existing.id"], "text": "string" }],
    "conflicts": [],
    "changeConditions": []
  }
}

IMMUTABLE_FACTS:
${JSON.stringify(payload)}`;
}
