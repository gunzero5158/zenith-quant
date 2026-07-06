import { Candle } from "./indicators";

export type PatternBias = "bullish" | "bearish" | "neutral";

export interface PatternSignal {
  key: string;
  name: string;
  bias: PatternBias;
  confidence: number;
  description: string;
}

export interface PatternResult {
  tdSequential: number[];
  tdSignal: string;
  fibonacciLevels: { label: string; price: number }[];
  activePatterns: PatternSignal[];
  isDoubleBottom: boolean;
  isDoubleTop: boolean;
  isTripleBottom: boolean;
  isTripleTop: boolean;
  isHeadAndShoulders: boolean;
  isCupAndHandle: boolean;
  isRoundingTop: boolean;
  isBullFlag: boolean;
  isBearFlag: boolean;
  isRectangle: boolean;
  isTrianglePennant: boolean;
  isRisingWedge: boolean;
  isFallingWedge: boolean;
  macdDivergence: "top" | "bottom" | "none";
  rsiDivergence: "top" | "bottom" | "none";
  kdjDivergence: "top" | "bottom" | "none";
  patternDescription: string;
}

interface PivotPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

export interface PatternDetectionResult {
  activePatterns: PatternSignal[];
  isDoubleBottom: boolean;
  isDoubleTop: boolean;
  isTripleBottom: boolean;
  isTripleTop: boolean;
  isHeadAndShoulders: boolean;
  isCupAndHandle: boolean;
  isRoundingTop: boolean;
  isBullFlag: boolean;
  isBearFlag: boolean;
  isRectangle: boolean;
  isTrianglePennant: boolean;
  isRisingWedge: boolean;
  isFallingWedge: boolean;
}

const isFiniteNumber = (value: number | undefined): value is number => typeof value === "number" && Number.isFinite(value);

function pctDiff(a: number, b: number): number {
  if (!a || !b) return Infinity;
  return Math.abs(a - b) / Math.abs(a) * 100;
}

function pctChange(from: number, to: number): number {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

function pushSignal(
  signals: PatternSignal[],
  key: string,
  name: string,
  bias: PatternBias,
  confidence: number,
  description: string
): void {
  signals.push({
    key,
    name,
    bias,
    confidence: Number(confidence.toFixed(2)),
    description,
  });
}

function linearSlope(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;

  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

function recentRange(candles: Candle[], length: number): { high: number; low: number; widthPct: number } {
  const slice = candles.slice(-Math.min(length, candles.length));
  const high = Math.max(...slice.map((c) => c.high));
  const low = Math.min(...slice.map((c) => c.low));
  const mid = (high + low) / 2;
  return { high, low, widthPct: mid ? ((high - low) / mid) * 100 : 0 };
}

/**
 * Calculates TD Sequential. Positive numbers are sell setups, negative numbers are buy setups.
 */
export function calculateTDSequential(candles: Candle[]): { counts: number[]; latestSignal: string } {
  const counts: number[] = Array(candles.length).fill(0);
  let bullCount = 0;
  let bearCount = 0;

  for (let i = 4; i < candles.length; i++) {
    const todayClose = candles[i].close;
    const refClose = candles[i - 4].close;

    if (todayClose > refClose) {
      bullCount++;
      bearCount = 0;
      counts[i] = bullCount;
    } else if (todayClose < refClose) {
      bearCount++;
      bullCount = 0;
      counts[i] = -bearCount;
    } else {
      bullCount = 0;
      bearCount = 0;
      counts[i] = 0;
    }
  }

  let latestSignal = "None";
  if (counts.length > 0) {
    const lastVal = counts[counts.length - 1];
    if (lastVal === 9) latestSignal = "Sell Setup 9";
    else if (lastVal === -9) latestSignal = "Buy Setup 9";
  }

  return { counts, latestSignal };
}

/**
 * Detects divergence between close price and indicators.
 */
export function detectDivergence(
  candles: Candle[],
  indicator: number[],
  lookback: number = 30
): "top" | "bottom" | "none" {
  const len = candles.length;
  // The scan below reads candles[i - 2] with i as low as len - lookback + 1,
  // so len must be at least lookback + 1 to stay in bounds.
  if (len < lookback + 1) return "none";

  let latestPricePeakIdx = -1;
  let prevPricePeakIdx = -1;
  let latestPriceTroughIdx = -1;
  let prevPriceTroughIdx = -1;

  for (let i = len - 3; i > len - lookback; i--) {
    if (
      candles[i].high > candles[i - 1].high &&
      candles[i].high > candles[i + 1].high &&
      candles[i].high > candles[i - 2].high &&
      candles[i].high > candles[i + 2].high
    ) {
      if (latestPricePeakIdx === -1) latestPricePeakIdx = i;
      else if (prevPricePeakIdx === -1 && latestPricePeakIdx - i > 5) prevPricePeakIdx = i;
    }

    if (
      candles[i].low < candles[i - 1].low &&
      candles[i].low < candles[i + 1].low &&
      candles[i].low < candles[i - 2].low &&
      candles[i].low < candles[i + 2].low
    ) {
      if (latestPriceTroughIdx === -1) latestPriceTroughIdx = i;
      else if (prevPriceTroughIdx === -1 && latestPriceTroughIdx - i > 5) prevPriceTroughIdx = i;
    }
  }

  if (latestPricePeakIdx !== -1 && prevPricePeakIdx !== -1) {
    const priceHigh1 = candles[prevPricePeakIdx].high;
    const priceHigh2 = candles[latestPricePeakIdx].high;
    const indHigh1 = indicator[prevPricePeakIdx];
    const indHigh2 = indicator[latestPricePeakIdx];

    if (priceHigh2 > priceHigh1 && indHigh2 < indHigh1 && !isNaN(indHigh1) && !isNaN(indHigh2)) {
      return "top";
    }
  }

  if (latestPriceTroughIdx !== -1 && prevPriceTroughIdx !== -1) {
    const priceLow1 = candles[prevPriceTroughIdx].low;
    const priceLow2 = candles[latestPriceTroughIdx].low;
    const indLow1 = indicator[prevPriceTroughIdx];
    const indLow2 = indicator[latestPriceTroughIdx];

    if (priceLow2 < priceLow1 && indLow2 > indLow1 && !isNaN(indLow1) && !isNaN(indLow2)) {
      return "bottom";
    }
  }

  return "none";
}

/**
 * Calculates Fibonacci retracement levels based on the recent high/low range.
 */
export function calculateFibonacci(candles: Candle[]): { label: string; price: number }[] {
  const windowDays = Math.min(candles.length, 120);
  const recent = candles.slice(-windowDays);

  let high = -Infinity;
  let low = Infinity;
  let highIdx = 0;
  let lowIdx = 0;

  for (let i = 0; i < recent.length; i++) {
    if (recent[i].high > high) {
      high = recent[i].high;
      highIdx = i;
    }
    if (recent[i].low < low) {
      low = recent[i].low;
      lowIdx = i;
    }
  }

  const diff = high - low;
  const isUpTrend = highIdx > lowIdx;
  const ratios = [
    { label: "0.0%", r: isUpTrend ? 0 : 1 },
    { label: "23.6%", r: isUpTrend ? 0.236 : 0.764 },
    { label: "38.2%", r: isUpTrend ? 0.382 : 0.618 },
    { label: "50.0%", r: 0.5 },
    { label: "61.8%", r: isUpTrend ? 0.618 : 0.382 },
    { label: "78.6%", r: isUpTrend ? 0.786 : 0.214 },
    { label: "100.0%", r: isUpTrend ? 1 : 0 },
  ];

  return ratios.map((item) => ({
    label: item.label,
    price: Number((low + diff * item.r).toFixed(2)),
  }));
}

function getPivots(candles: Candle[], leftRight: number = 5): PivotPoint[] {
  const pivots: PivotPoint[] = [];
  const len = candles.length;

  for (let i = leftRight; i < len - leftRight; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    let isHigh = true;
    let isLow = true;

    for (let j = i - leftRight; j <= i + leftRight; j++) {
      if (j === i) continue;
      if (candles[j].high > high) isHigh = false;
      if (candles[j].low < low) isLow = false;
    }

    if (isHigh) pivots.push({ index: i, price: high, type: "high" });
    else if (isLow) pivots.push({ index: i, price: low, type: "low" });
  }

  return pivots;
}

/**
 * Detects classic geometric patterns through pivot and light regression rules.
 */
export function detectPatterns(candles: Candle[]): PatternDetectionResult {
  const empty: PatternDetectionResult = {
    activePatterns: [],
    isDoubleBottom: false,
    isDoubleTop: false,
    isTripleBottom: false,
    isTripleTop: false,
    isHeadAndShoulders: false,
    isCupAndHandle: false,
    isRoundingTop: false,
    isBullFlag: false,
    isBearFlag: false,
    isRectangle: false,
    isTrianglePennant: false,
    isRisingWedge: false,
    isFallingWedge: false,
  };

  if (candles.length < 12) return empty;

  const pivots = getPivots(candles, 5);
  const currentPrice = candles[candles.length - 1].close;
  const lows = pivots.filter((p) => p.type === "low");
  const highs = pivots.filter((p) => p.type === "high");
  const signals: PatternSignal[] = [];
  const result = { ...empty, activePatterns: signals };

  if (lows.length >= 2 && highs.length >= 1) {
    const recentLows = lows.slice(-6);
    for (let i = recentLows.length - 2; i >= 0 && !result.isDoubleBottom; i--) {
      for (let j = recentLows.length - 1; j > i && !result.isDoubleBottom; j--) {
        const l1 = recentLows[i];
        const l2 = recentLows[j];
        const intermediateHighs = highs.filter((h) => h.index > l1.index && h.index < l2.index);
        const neckline = intermediateHighs.length > 0 ? Math.max(...intermediateHighs.map((h) => h.price)) : NaN;
        const timeDiff = l2.index - l1.index;

        if (isFiniteNumber(neckline) && pctDiff(l1.price, l2.price) <= 3 && timeDiff >= 8 && currentPrice >= neckline * 0.98) {
          result.isDoubleBottom = true;
          pushSignal(signals, "doubleBottom", "Double bottom/W bottom", "bullish", 0.72, `Two major lows are close and price is near or above neckline ${neckline.toFixed(2)}.`);
        }
      }
    }
  }

  if (highs.length >= 2 && lows.length >= 1) {
    const recentHighs = highs.slice(-6);
    for (let i = recentHighs.length - 2; i >= 0 && !result.isDoubleTop; i--) {
      for (let j = recentHighs.length - 1; j > i && !result.isDoubleTop; j--) {
        const h1 = recentHighs[i];
        const h2 = recentHighs[j];
        const intermediateLows = lows.filter((l) => l.index > h1.index && l.index < h2.index);
        const neckline = intermediateLows.length > 0 ? Math.min(...intermediateLows.map((l) => l.price)) : NaN;
        const timeDiff = h2.index - h1.index;

        if (isFiniteNumber(neckline) && pctDiff(h1.price, h2.price) <= 3 && timeDiff >= 8 && currentPrice <= neckline * 1.02) {
          result.isDoubleTop = true;
          pushSignal(signals, "doubleTop", "Double top", "bearish", 0.7, `Two major highs are close and price is near or below neckline ${neckline.toFixed(2)}.`);
        }
      }
    }
  }

  if (lows.length >= 3) {
    const recentLows = lows.slice(-3);
    const maxLow = Math.max(...recentLows.map((p) => p.price));
    const minLow = Math.min(...recentLows.map((p) => p.price));
    const span = recentLows[2].index - recentLows[0].index;
    const neckline = Math.max(
      ...highs
        .filter((h) => h.index > recentLows[0].index && h.index < recentLows[2].index)
        .map((h) => h.price)
    );

    if (isFiniteNumber(neckline) && pctDiff(maxLow, minLow) <= 3.5 && span >= 14 && currentPrice >= neckline * 0.98) {
      result.isTripleBottom = true;
      pushSignal(signals, "tripleBottom", "三重底", "bullish", 0.76, `三个低点区间稳定，价格正在确认 ${neckline.toFixed(2)} 附近的颈线。`);
    }
  }

  if (highs.length >= 3) {
    const recentHighs = highs.slice(-3);
    const maxHigh = Math.max(...recentHighs.map((p) => p.price));
    const minHigh = Math.min(...recentHighs.map((p) => p.price));
    const span = recentHighs[2].index - recentHighs[0].index;
    const neckline = Math.min(
      ...lows
        .filter((l) => l.index > recentHighs[0].index && l.index < recentHighs[2].index)
        .map((l) => l.price)
    );

    if (isFiniteNumber(neckline) && pctDiff(maxHigh, minHigh) <= 3.5 && span >= 14 && currentPrice <= neckline * 1.02) {
      result.isTripleTop = true;
      pushSignal(signals, "tripleTop", "三重顶", "bearish", 0.76, `三个高点反复受压，价格正在确认 ${neckline.toFixed(2)} 附近的颈线风险。`);
    }
  }

  if (highs.length >= 3) {
    const p4 = highs[highs.length - 1];
    const p2 = highs[highs.length - 2];
    const p0 = highs[highs.length - 3];
    const necklineLows = lows.filter((l) => l.index > p0.index && l.index < p4.index);
    const neckline = necklineLows.length > 0 ? Math.min(...necklineLows.map((l) => l.price)) : NaN;

    if (
      p2.price > p0.price &&
      p2.price > p4.price &&
      pctDiff(p0.price, p4.price) <= 5 &&
      (!isFiniteNumber(neckline) || currentPrice <= neckline * 1.03)
    ) {
      result.isHeadAndShoulders = true;
      pushSignal(signals, "headAndShoulders", "头肩顶", "bearish", 0.68, "右肩弱于头部，顶部派发结构风险升高。");
    }
  }

  if (highs.length >= 2 && lows.length >= 2) {
    const hRight = highs[highs.length - 1];
    const hLeft = highs[highs.length - 2];
    const cupBottom = lows[lows.length - 2];
    const handlePullback = lows[lows.length - 1];
    const lipDiff = pctDiff(hLeft.price, hRight.price);
    const cupDepth = pctChange(hLeft.price, cupBottom.price) * -1;
    const handleDip = pctChange(hRight.price, handlePullback.price) * -1;

    if (lipDiff <= 4 && cupDepth >= 10 && handleDip > 0 && handleDip <= 10 && currentPrice >= hRight.price * 0.99) {
      result.isCupAndHandle = true;
      pushSignal(signals, "cupAndHandle", "杯柄突破", "bullish", 0.74, `杯沿接近，柄部回撤可控，价格正在挑战 ${hRight.price.toFixed(2)} 附近突破位。`);
    }
  }

  if (highs.length >= 4) {
    const h3 = highs[highs.length - 1].price;
    const h2 = highs[highs.length - 2].price;
    const h1 = highs[highs.length - 3].price;
    const h0 = highs[highs.length - 4].price;

    if (h1 > h0 && h2 > h1 && h3 < h2) {
      result.isRoundingTop = true;
      pushSignal(signals, "roundingTop", "圆弧顶", "bearish", 0.62, "高点抬升后开始回落，顶部圆弧雏形出现。");
    }
  }

  const flagLen = Math.min(14, Math.max(8, Math.floor(candles.length * 0.12)));
  const impulseLen = Math.min(28, candles.length - flagLen - 1);
  if (impulseLen >= 10) {
    const impulseStart = candles.length - flagLen - impulseLen;
    const impulseEnd = candles.length - flagLen - 1;
    const impulseMove = pctChange(candles[impulseStart].close, candles[impulseEnd].close);
    const recent = candles.slice(-flagLen);
    const highSlope = linearSlope(recent.map((c, i) => ({ x: i, y: c.high })));
    const lowSlope = linearSlope(recent.map((c, i) => ({ x: i, y: c.low })));
    const flagRange = recentRange(candles, flagLen);

    if (impulseMove >= 12 && flagRange.widthPct <= 14 && highSlope <= 0 && lowSlope <= 0 && currentPrice >= flagRange.high * 0.98) {
      result.isBullFlag = true;
      pushSignal(signals, "bullFlag", "牛旗", "bullish", 0.67, "前段急涨后进入向下窄幅整理，价格接近旗形上沿。");
    }

    if (impulseMove <= -12 && flagRange.widthPct <= 14 && highSlope >= 0 && lowSlope >= 0 && currentPrice <= flagRange.low * 1.02) {
      result.isBearFlag = true;
      pushSignal(signals, "bearFlag", "熊旗", "bearish", 0.67, "前段急跌后进入向上窄幅整理，价格接近旗形下沿。");
    }
  }

  const structureLookback = Math.min(50, candles.length);
  const recentPivots = pivots.filter((p) => p.index >= candles.length - structureLookback);
  const recentHighs = recentPivots.filter((p) => p.type === "high");
  const recentLows = recentPivots.filter((p) => p.type === "low");
  const box = recentRange(candles, Math.min(40, candles.length));

  if (recentHighs.length >= 2 && recentLows.length >= 2 && box.widthPct >= 4 && box.widthPct <= 18) {
    const highTouches = recentHighs.filter((p) => pctDiff(p.price, box.high) <= 2.5).length;
    const lowTouches = recentLows.filter((p) => pctDiff(p.price, box.low) <= 2.5).length;
    if (highTouches >= 2 && lowTouches >= 2 && currentPrice > box.low * 1.02 && currentPrice < box.high * 0.98) {
      result.isRectangle = true;
      pushSignal(signals, "rectangle", "箱体震荡", "neutral", 0.58, `价格在 ${box.low.toFixed(2)}-${box.high.toFixed(2)} 区间内反复震荡，等待方向选择。`);
    }
  }

  if (recentHighs.length >= 2 && recentLows.length >= 2) {
    const highSlope = linearSlope(recentHighs.map((p) => ({ x: p.index, y: p.price })));
    const lowSlope = linearSlope(recentLows.map((p) => ({ x: p.index, y: p.price })));
    const firstHigh = recentHighs[0];
    const lastHigh = recentHighs[recentHighs.length - 1];
    const firstLow = recentLows[0];
    const lastLow = recentLows[recentLows.length - 1];
    const startWidth = Math.abs(firstHigh.price - firstLow.price);
    const endWidth = Math.abs(lastHigh.price - lastLow.price);

    if (highSlope < 0 && lowSlope > 0 && startWidth > endWidth * 1.2) {
      result.isTrianglePennant = true;
      pushSignal(signals, "trianglePennant", "三角旗形/收敛三角", "neutral", 0.6, "高点下移且低点上移，波动正在收敛，需等待突破方向确认。");
    }

    if (highSlope > 0 && lowSlope > 0 && lowSlope > highSlope * 1.15) {
      result.isRisingWedge = true;
      pushSignal(signals, "risingWedge", "上升楔形", "bearish", 0.62, "高低点同步抬升但空间收窄，上升动能有衰减风险。");
    }

    if (highSlope < 0 && lowSlope < 0 && highSlope < lowSlope * 1.15) {
      result.isFallingWedge = true;
      pushSignal(signals, "fallingWedge", "下降楔形", "bullish", 0.62, "高低点同步下移但跌势收敛，若放量上破可视为修复信号。");
    }
  }

  return result;
}

function formatFibonacciContext(fibonacciLevels: { label: string; price: number }[], currentPrice: number): string {
  const nearby = fibonacciLevels
    .map((level) => ({ ...level, distance: Math.abs(level.price - currentPrice) / currentPrice * 100 }))
    .filter((level) => level.distance <= 3)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2);

  if (nearby.length === 0) return "";
  return ` 斐波纳契附近关键位：${nearby.map((level) => `${level.label}=${level.price}`).join("，")}；`;
}

/**
 * Analyzes TD, divergences, Fibonacci, and classic geometric patterns.
 */
export function analyzePatterns(
  candles: Candle[],
  dif: number[],
  rsi: number[],
  k: number[]
): PatternResult {
  const { counts: tdSequential, latestSignal: tdSignal } = calculateTDSequential(candles);
  const fibonacciLevels = calculateFibonacci(candles);
  const patternDetection = detectPatterns(candles);
  const macdDivergence = detectDivergence(candles, dif, 30);
  const rsiDivergence = detectDivergence(candles, rsi, 30);
  const kdjDivergence = detectDivergence(candles, k, 30);
  const latestPrice = candles[candles.length - 1]?.close ?? 0;

  const descParts: string[] = [];
  if (tdSignal !== "None") {
    descParts.push(tdSignal === "Buy Setup 9" ? "TD Buy Setup 9 出现，左侧反转信号增强。" : "TD Sell Setup 9 出现，趋势衰竭风险上升。");
  } else {
    const latestCount = tdSequential[tdSequential.length - 1];
    if (Math.abs(latestCount) >= 5) {
      descParts.push(`TD 序列处于${latestCount > 0 ? "上涨" : "下跌"} ${Math.abs(latestCount)} 阶段。`);
    }
  }

  const divergences: string[] = [];
  if (macdDivergence !== "none") divergences.push(`MACD ${macdDivergence === "top" ? "顶背离" : "底背离"}`);
  if (rsiDivergence !== "none") divergences.push(`RSI ${rsiDivergence === "top" ? "顶背离" : "底背离"}`);
  if (kdjDivergence !== "none") divergences.push(`KDJ ${kdjDivergence === "top" ? "顶背离" : "底背离"}`);
  if (divergences.length > 0) {
    descParts.push(`指标检测到 ${divergences.join("、")}。`);
  }

  if (patternDetection.activePatterns.length > 0) {
    descParts.push(`经典形态：${patternDetection.activePatterns.map((p) => `${p.name}(${p.bias}, ${Math.round(p.confidence * 100)}%)`).join("；")}。`);
  } else {
    descParts.push("经典形态暂无强烈、已确认的几何信号。");
  }

  const fibContext = formatFibonacciContext(fibonacciLevels, latestPrice);
  if (fibContext) descParts.push(fibContext.trim());

  return {
    tdSequential,
    tdSignal,
    fibonacciLevels,
    activePatterns: patternDetection.activePatterns,
    isDoubleBottom: patternDetection.isDoubleBottom,
    isDoubleTop: patternDetection.isDoubleTop,
    isTripleBottom: patternDetection.isTripleBottom,
    isTripleTop: patternDetection.isTripleTop,
    isHeadAndShoulders: patternDetection.isHeadAndShoulders,
    isCupAndHandle: patternDetection.isCupAndHandle,
    isRoundingTop: patternDetection.isRoundingTop,
    isBullFlag: patternDetection.isBullFlag,
    isBearFlag: patternDetection.isBearFlag,
    isRectangle: patternDetection.isRectangle,
    isTrianglePennant: patternDetection.isTrianglePennant,
    isRisingWedge: patternDetection.isRisingWedge,
    isFallingWedge: patternDetection.isFallingWedge,
    macdDivergence,
    rsiDivergence,
    kdjDivergence,
    patternDescription: descParts.join(" "),
  };
}
