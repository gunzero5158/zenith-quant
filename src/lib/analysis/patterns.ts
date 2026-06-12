import { Candle } from "./indicators";

export interface PatternResult {
  tdSequential: number[];        // TD Sequential numbers (1-9) for each candle
  tdSignal: string;              // E.g. "Buy Setup 9", "Sell Setup 9", or "None"
  fibonacciLevels: { label: string; price: number }[];
  isDoubleBottom: boolean;
  isHeadAndShoulders: boolean;
  isCupAndHandle: boolean;
  isRoundingTop: boolean;
  macdDivergence: "top" | "bottom" | "none";
  rsiDivergence: "top" | "bottom" | "none";
  kdjDivergence: "top" | "bottom" | "none";
  patternDescription: string;
}

/**
 * Calculates TD Sequential (神奇九转).
 * Increments count when close is compared with close 4 bars ago.
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
      counts[i] = -bearCount; // Negative for bear setup
    } else {
      bullCount = 0;
      bearCount = 0;
      counts[i] = 0;
    }
  }

  let latestSignal = "None";
  if (counts.length > 0) {
    const lastVal = counts[counts.length - 1];
    if (lastVal === 9) {
      latestSignal = "Sell Setup 9";
    } else if (lastVal === -9) {
      latestSignal = "Buy Setup 9";
    }
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
  if (len < lookback) return "none";

  // Find local extrema in price over recent lookback candles
  // We check the latest 5-day window for recent peaks
  let latestPricePeakIdx = -1;
  let prevPricePeakIdx = -1;
  let latestPriceTroughIdx = -1;
  let prevPriceTroughIdx = -1;

  for (let i = len - 3; i > len - lookback; i--) {
    // Check if peak
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high && candles[i].high > candles[i - 2].high && candles[i].high > candles[i + 2].high) {
      if (latestPricePeakIdx === -1) {
        latestPricePeakIdx = i;
      } else if (prevPricePeakIdx === -1 && latestPricePeakIdx - i > 5) {
        prevPricePeakIdx = i;
      }
    }
    // Check if trough
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low && candles[i].low < candles[i - 2].low && candles[i].low < candles[i + 2].low) {
      if (latestPriceTroughIdx === -1) {
        latestPriceTroughIdx = i;
      } else if (prevPriceTroughIdx === -1 && latestPriceTroughIdx - i > 5) {
        prevPriceTroughIdx = i;
      }
    }
  }

  // 1. Top Divergence (顶背离): Price makes higher high, indicator makes lower high
  if (latestPricePeakIdx !== -1 && prevPricePeakIdx !== -1) {
    const priceHigh1 = candles[prevPricePeakIdx].high;
    const priceHigh2 = candles[latestPricePeakIdx].high;
    const indHigh1 = indicator[prevPricePeakIdx];
    const indHigh2 = indicator[latestPricePeakIdx];

    if (priceHigh2 > priceHigh1 && indHigh2 < indHigh1 && !isNaN(indHigh1) && !isNaN(indHigh2)) {
      return "top";
    }
  }

  // 2. Bottom Divergence (底背离): Price makes lower low, indicator makes higher low
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
 * Calculates Fibonacci retracement levels based on recent highest and lowest.
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

  return ratios.map(item => ({
    label: item.label,
    price: Number((low + diff * item.r).toFixed(2)),
  }));
}

/**
 * Detects local peaks and troughs for geometry matching.
 */
function getPivots(candles: Candle[], leftRight: number = 5): { index: number; price: number; type: "high" | "low" }[] {
  const pivots: { index: number; price: number; type: "high" | "low" }[] = [];
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
 * Detects classic geometric patterns (W bottom, H&S, Cup & Handle, Rounding Top).
 */
export function detectPatterns(candles: Candle[]): {
  isDoubleBottom: boolean;
  isHeadAndShoulders: boolean;
  isCupAndHandle: boolean;
  isRoundingTop: boolean;
} {
  const pivots = getPivots(candles, 5);
  const n = pivots.length;
  const currentPrice = candles[candles.length - 1].close;

  const lows = pivots.filter(p => p.type === "low");
  const highs = pivots.filter(p => p.type === "high");

  let isDoubleBottom = false;
  let isHeadAndShoulders = false;
  let isCupAndHandle = false;
  let isRoundingTop = false;

  if (n >= 3) {
    // 1. Double Bottom (W底): Low0 -> High1 -> Low2, and currentPrice breaks High1 (neckline)
    // We check the latest few pivots
    if (lows.length >= 2 && highs.length >= 1) {
      const l2 = lows[lows.length - 1];
      const l1 = lows[lows.length - 2];
      
      // Find the high between l1 and l2
      const intermediateHighs = highs.filter(h => h.index > l1.index && h.index < l2.index);
      if (intermediateHighs.length > 0) {
        const h1 = intermediateHighs[intermediateHighs.length - 1];
        
        const priceDiff = Math.abs(l1.price - l2.price) / l1.price * 100;
        const timeDiff = l2.index - l1.index;

        // Double bottom rules: price diff within 3%, time separation >= 8 days, current price >= neckline * 0.98
        if (priceDiff <= 3 && timeDiff >= 8 && currentPrice >= h1.price * 0.98) {
          isDoubleBottom = true;
        }
      }
    }
  }

  if (n >= 5) {
    // 2. Head and Shoulders Top (头肩顶): Peak0(Shoulder) -> Trough1 -> Peak2(Head) -> Trough3 -> Peak4(Shoulder)
    if (highs.length >= 3) {
      const p4 = highs[highs.length - 1]; // Right Shoulder
      const p2 = highs[highs.length - 2]; // Head
      const p0 = highs[highs.length - 3]; // Left Shoulder

      if (p2.price > p0.price && p2.price > p4.price && Math.abs(p0.price - p4.price) / p0.price * 100 <= 5) {
        isHeadAndShoulders = true;
      }
    }

    // 3. Cup and Handle (杯柄突破): Rounded cup bottom, minor downward handle consolidation, breakout
    // We simplify by looking for a high (Cup Lip Left), low (Cup Bottom), high (Cup Lip Right), and handle pullback
    if (highs.length >= 2 && lows.length >= 2) {
      const hRight = highs[highs.length - 1];
      const hLeft = highs[highs.length - 2];
      const cupBottom = lows[lows.length - 2];
      const handlePullback = lows[lows.length - 1];

      // Cup conditions:
      // - hLeft and hRight are roughly equal (within 4%)
      // - cupBottom is significantly lower than both
      // - handlePullback is a minor dip below hRight (pullback <= 10%)
      const lipDiff = Math.abs(hLeft.price - hRight.price) / hLeft.price * 100;
      const cupDepth = (hLeft.price - cupBottom.price) / hLeft.price * 100;
      const handleDip = (hRight.price - handlePullback.price) / hRight.price * 100;

      if (lipDiff <= 4 && cupDepth >= 10 && handleDip > 0 && handleDip <= 10 && currentPrice >= hRight.price * 0.99) {
        isCupAndHandle = true;
      }
    }
  }

  // 4. Rounding Top (圆弧顶)
  // Check if recent 4-5 peaks show a curve: Peak1 < Peak2 > Peak3 > Peak4
  if (highs.length >= 4) {
    const h3 = highs[highs.length - 1].price;
    const h2 = highs[highs.length - 2].price;
    const h1 = highs[highs.length - 3].price;
    const h0 = highs[highs.length - 4].price;

    if (h1 > h0 && h2 > h1 && h3 < h2) {
      isRoundingTop = true;
    }
  }

  return { isDoubleBottom, isHeadAndShoulders, isCupAndHandle, isRoundingTop };
}

/**
 * Analyzes indicators, divergences, fibonacci, and geometric patterns.
 */
export function analyzePatterns(
  candles: Candle[],
  dif: number[],
  rsi: number[],
  k: number[]
): PatternResult {
  const { counts: tdSequential, latestSignal: tdSignal } = calculateTDSequential(candles);
  const fibonacciLevels = calculateFibonacci(candles);
  const { isDoubleBottom, isHeadAndShoulders, isCupAndHandle, isRoundingTop } = detectPatterns(candles);

  const macdDivergence = detectDivergence(candles, dif, 30);
  const rsiDivergence = detectDivergence(candles, rsi, 30);
  const kdjDivergence = detectDivergence(candles, k, 30);

  // Formulate description
  let desc = "";

  if (tdSignal !== "None") {
    desc += `神奇九转触发「${tdSignal === "Buy Setup 9" ? "买入九转（看多）" : "卖出九转（看空）"}」信号；`;
  } else {
    const latestCount = tdSequential[tdSequential.length - 1];
    if (Math.abs(latestCount) >= 5) {
      desc += `神奇九转序列目前为「${latestCount > 0 ? "上涨" : "下跌"}${Math.abs(latestCount)}」阶段；`;
    }
  }

  const divergences = [];
  if (macdDivergence !== "none") divergences.push(`MACD${macdDivergence === "top" ? "顶背离" : "底背离"}`);
  if (rsiDivergence !== "none") divergences.push(`RSI${rsiDivergence === "top" ? "顶背离" : "底背离"}`);
  if (kdjDivergence !== "none") divergences.push(`KDJ${kdjDivergence === "top" ? "顶背离" : "底背离"}`);

  if (divergences.length > 0) {
    desc += ` 指标检测到 ${divergences.join(" & ")}，多空能量发生偏移；`;
  }

  const shapes = [];
  if (isDoubleBottom) shapes.push("双底/W底突破");
  if (isHeadAndShoulders) shapes.push("头肩顶阻力结构");
  if (isCupAndHandle) shapes.push("杯柄突破");
  if (isRoundingTop) shapes.push("圆弧顶下行形态");

  if (shapes.length > 0) {
    desc += ` 经典形态方面显现出「${shapes.join(" | ")}」；`;
  } else {
    desc += " 经典形态暂无强烈的几何突破信号。";
  }

  return {
    tdSequential,
    tdSignal,
    fibonacciLevels,
    isDoubleBottom,
    isHeadAndShoulders,
    isCupAndHandle,
    isRoundingTop,
    macdDivergence,
    rsiDivergence,
    kdjDivergence,
    patternDescription: desc,
  };
}
