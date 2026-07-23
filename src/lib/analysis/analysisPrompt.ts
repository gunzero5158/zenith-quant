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
  return `Review the immutable technical facts below for a 5-20 trading-day swing decision.
Do not recalculate MACD, KDJ, RSI, EMA, BOLL, Ichimoku, ATR, Fibonacci, TD Sequential, classical patterns, candlesticks, volume, CMF, OBV, VPVR, Elliott Wave, or Chanlun. Use the supplied event timing and provisional daily/weekly status.
The 0-5 rule score measures current new-entry attractiveness, not trend strength. Holder, left entry, right add, and exit/stop are separate strategies.
You may adjust the rule score by at most +/-0.5. A nonzero adjustment must cite existing evidence IDs and cannot exceed hardCap.

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
