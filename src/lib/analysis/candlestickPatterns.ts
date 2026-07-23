import { TradeLevel } from "./evidence";
import { Candle } from "./indicators";

export const CANDLESTICK_PATTERN_IDS = [
  "hammer", "invertedHammer", "bullishEngulfing", "piercingLine", "morningStar", "bullishHarami",
  "hangingMan", "shootingStar", "bearishEngulfing", "darkCloudCover", "eveningStar", "bearishHarami",
  "threeWhiteSoldiers", "threeBlackCrows", "bullishMarubozu", "bearishMarubozu",
  "gapUp", "gapDown", "insideBar", "outsideBar", "doji", "spinningTop", "longUpperShadow", "longLowerShadow",
] as const;

export type CandlestickPatternId = typeof CANDLESTICK_PATTERN_IDS[number];
export type CandlestickBias = "bullish" | "bearish" | "neutral";

export interface CandlestickPatternSignal {
  id: CandlestickPatternId;
  bias: CandlestickBias;
  state: "forming" | "triggered" | "extended";
  location: "support" | "resistance" | "neutral";
  startIndex: number;
  endIndex: number;
  barsSince: number;
  confidence: number;
  description: string;
}

interface DetectionOptions {
  ema20?: number[];
  maxBarsSince?: number;
}

interface Geometry {
  bullish: boolean;
  bearish: boolean;
  body: number;
  range: number;
  upperShadow: number;
  lowerShadow: number;
  bodyToRange: number;
  bodyToAtr: number;
}

interface Candidate extends CandlestickPatternSignal {
  priority: number;
}

function geometry(candle: Candle, atr: number): Geometry {
  const body = Math.abs(candle.close - candle.open);
  const range = Math.max(candle.high - candle.low, Number.EPSILON);
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  return {
    bullish: candle.close > candle.open,
    bearish: candle.close < candle.open,
    body,
    range,
    upperShadow,
    lowerShadow,
    bodyToRange: body / range,
    bodyToAtr: body / Math.max(atr, Number.EPSILON),
  };
}

function priorTrend(candles: Candle[], endIndex: number): "up" | "down" | "flat" {
  if (endIndex < 2) return "flat";
  const startIndex = Math.max(0, endIndex - 4);
  const start = candles[startIndex].close;
  const end = candles[endIndex - 1].close;
  const normalizedMove = (end - start) / Math.max(Math.abs(start), Number.EPSILON);
  return normalizedMove > 0.015 ? "up" : normalizedMove < -0.015 ? "down" : "flat";
}

function locationAt(candle: Candle, atr: number, levels: TradeLevel[]): CandlestickPatternSignal["location"] {
  const threshold = Math.max(atr * 0.75, candle.close * 0.005);
  const supportNear = levels.some((level) => level.kind === "support" && Math.abs(candle.low - level.price) <= threshold);
  const resistanceNear = levels.some((level) => level.kind === "resistance" && Math.abs(candle.high - level.price) <= threshold);
  return supportNear ? "support" : resistanceNear ? "resistance" : "neutral";
}

function candidate(
  id: CandlestickPatternId,
  bias: CandlestickBias,
  startIndex: number,
  endIndex: number,
  latestIndex: number,
  location: CandlestickPatternSignal["location"],
  priority: number,
  confidence = 0.7,
  state: CandlestickPatternSignal["state"] = "triggered"
): Candidate {
  return {
    id,
    bias,
    state,
    location,
    startIndex,
    endIndex,
    barsSince: latestIndex - endIndex,
    confidence,
    description: `${id} at ${location}`,
    priority,
  };
}

function bodyContains(outer: Candle, inner: Candle): boolean {
  return Math.min(outer.open, outer.close) <= Math.min(inner.open, inner.close) &&
    Math.max(outer.open, outer.close) >= Math.max(inner.open, inner.close);
}

function detectAt(candles: Candle[], atrValues: number[], levels: TradeLevel[], index: number, options: DetectionOptions): Candidate[] {
  const current = candles[index];
  const previous = candles[index - 1];
  const third = candles[index - 2];
  const atr = Number.isFinite(atrValues[index]) ? atrValues[index] : Math.max(current.high - current.low, Number.EPSILON);
  const currentGeometry = geometry(current, atr);
  const previousGeometry = previous ? geometry(previous, Number.isFinite(atrValues[index - 1]) ? atrValues[index - 1] : atr) : undefined;
  const thirdGeometry = third ? geometry(third, Number.isFinite(atrValues[index - 2]) ? atrValues[index - 2] : atr) : undefined;
  const trend = priorTrend(candles, index);
  const location = locationAt(current, atr, levels);
  const latestIndex = candles.length - 1;
  const matches: Candidate[] = [];
  const add = (
    id: CandlestickPatternId,
    bias: CandlestickBias,
    startIndex: number,
    priority: number,
    confidence?: number,
    state?: CandlestickPatternSignal["state"]
  ) => matches.push(candidate(id, bias, startIndex, index, latestIndex, location, priority, confidence, state));

  const lowerReversalShape = currentGeometry.lowerShadow >= 2 * Math.max(currentGeometry.body, atr * 0.05) &&
    currentGeometry.upperShadow <= 0.35 * currentGeometry.range;
  const upperReversalShape = currentGeometry.upperShadow >= 2 * Math.max(currentGeometry.body, atr * 0.05) &&
    currentGeometry.lowerShadow <= 0.35 * currentGeometry.range;

  if (lowerReversalShape && trend === "down" && location === "support") add("hammer", "bullish", index, 30, 0.8);
  if (lowerReversalShape && trend === "up") add("hangingMan", "bearish", index, 30, location === "resistance" ? 0.8 : 0.65);
  if (upperReversalShape && trend === "down") add("invertedHammer", "bullish", index, 30, location === "support" ? 0.8 : 0.65);
  if (upperReversalShape && trend === "up") add("shootingStar", "bearish", index, 30, location === "resistance" ? 0.8 : 0.65);

  if (previous && previousGeometry) {
    if (previousGeometry.bearish && currentGeometry.bullish && bodyContains(current, previous)) add("bullishEngulfing", "bullish", index - 1, 40, 0.82);
    if (previousGeometry.bullish && currentGeometry.bearish && bodyContains(current, previous)) add("bearishEngulfing", "bearish", index - 1, 40, 0.82);

    const previousMidpoint = (previous.open + previous.close) / 2;
    if (previousGeometry.bearish && currentGeometry.bullish && current.open < previous.close && current.close > previousMidpoint && current.close < previous.open) {
      add("piercingLine", "bullish", index - 1, 40, 0.76);
    }
    if (previousGeometry.bullish && currentGeometry.bearish && current.open > previous.close && current.close < previousMidpoint && current.close > previous.open) {
      add("darkCloudCover", "bearish", index - 1, 40, 0.76);
    }
    if (previousGeometry.bearish && currentGeometry.bullish && bodyContains(previous, current)) add("bullishHarami", "bullish", index - 1, 40, 0.68);
    if (previousGeometry.bullish && currentGeometry.bearish && bodyContains(previous, current)) add("bearishHarami", "bearish", index - 1, 40, 0.68);

    if (current.low > previous.high) add("gapUp", "bullish", index - 1, 20, 0.6);
    if (current.high < previous.low) add("gapDown", "bearish", index - 1, 20, 0.6);
    if (current.high <= previous.high && current.low >= previous.low) add("insideBar", "neutral", index - 1, 20, 0.55, "forming");
    if (current.high >= previous.high && current.low <= previous.low) add("outsideBar", currentGeometry.bullish ? "bullish" : currentGeometry.bearish ? "bearish" : "neutral", index - 1, 20, 0.62);
  }

  if (third && previous && thirdGeometry && previousGeometry) {
    const thirdMidpoint = (third.open + third.close) / 2;
    const middleSmall = previousGeometry.bodyToRange <= 0.35 || previousGeometry.bodyToAtr <= 0.35;
    if (thirdGeometry.bearish && thirdGeometry.bodyToAtr >= 0.6 && middleSmall && currentGeometry.bullish && current.close > thirdMidpoint) {
      add("morningStar", "bullish", index - 2, 50, 0.85);
    }
    if (thirdGeometry.bullish && thirdGeometry.bodyToAtr >= 0.6 && middleSmall && currentGeometry.bearish && current.close < thirdMidpoint) {
      add("eveningStar", "bearish", index - 2, 50, 0.85);
    }

    const threeBullish = [thirdGeometry, previousGeometry, currentGeometry].every((item) => item.bullish) &&
      third.close < previous.close && previous.close < current.close &&
      previous.open >= third.open && previous.open <= third.close &&
      current.open >= previous.open && current.open <= previous.close &&
      [thirdGeometry, previousGeometry, currentGeometry].every((item) => item.upperShadow <= item.body * 0.6);
    const threeBearish = [thirdGeometry, previousGeometry, currentGeometry].every((item) => item.bearish) &&
      third.close > previous.close && previous.close > current.close &&
      previous.open <= third.open && previous.open >= third.close &&
      current.open <= previous.open && current.open >= previous.close &&
      [thirdGeometry, previousGeometry, currentGeometry].every((item) => item.lowerShadow <= item.body * 0.6);
    if (threeBullish) {
      const ema20 = options.ema20?.[index];
      const extended = Number.isFinite(ema20) && current.close - ema20! > 2.5 * atr;
      add("threeWhiteSoldiers", "bullish", index - 2, 50, 0.86, extended ? "extended" : "triggered");
    }
    if (threeBearish) add("threeBlackCrows", "bearish", index - 2, 50, 0.86);
  }

  if (currentGeometry.bodyToRange >= 0.9 && currentGeometry.bodyToAtr >= 0.6) {
    add(currentGeometry.bullish ? "bullishMarubozu" : "bearishMarubozu", currentGeometry.bullish ? "bullish" : "bearish", index, 25, 0.7);
  }
  if (currentGeometry.bodyToRange <= 0.1) add("doji", "neutral", index, 10, 0.5, "forming");
  else if (currentGeometry.bodyToRange <= 0.3 && currentGeometry.upperShadow >= currentGeometry.body && currentGeometry.lowerShadow >= currentGeometry.body) {
    add("spinningTop", "neutral", index, 10, 0.5, "forming");
  }
  if (currentGeometry.upperShadow >= 2 * Math.max(currentGeometry.body, atr * 0.05) && currentGeometry.upperShadow >= 0.6 * currentGeometry.range) {
    add("longUpperShadow", "bearish", index, 15, 0.55);
  }
  if (currentGeometry.lowerShadow >= 2 * Math.max(currentGeometry.body, atr * 0.05) && currentGeometry.lowerShadow >= 0.6 * currentGeometry.range) {
    add("longLowerShadow", "bullish", index, 15, 0.55);
  }
  return matches;
}

export function detectCandlestickPatterns(
  candles: Candle[],
  atrValues: number[],
  levels: TradeLevel[],
  options: DetectionOptions = {}
): CandlestickPatternSignal[] {
  if (candles.length === 0) return [];
  const maxBarsSince = options.maxBarsSince ?? 2;
  const start = Math.max(0, candles.length - 1 - maxBarsSince);
  const primaryByEndIndex = new Map<number, Candidate>();
  for (let index = start; index < candles.length; index++) {
    for (const match of detectAt(candles, atrValues, levels, index, options)) {
      const existing = primaryByEndIndex.get(index);
      if (!existing || match.priority > existing.priority || (match.priority === existing.priority && match.confidence > existing.confidence)) {
        primaryByEndIndex.set(index, match);
      }
    }
  }
  return [...primaryByEndIndex.values()]
    .sort((left, right) => right.endIndex - left.endIndex)
    .map(({ priority: _priority, ...signal }) => signal);
}
