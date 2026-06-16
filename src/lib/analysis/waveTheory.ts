import { Candle } from "./indicators";

export interface WaveAnalysisResult {
  currentWave: string;           // E.g. "Wave 3 (Upward Impulse)", "Wave C (Downward Correction)"
  waveDescription: string;       // Text summary of the wave structure
  wavePoints: { index: number; price: number; type: "high" | "low"; label: string }[];
  waveScoreContribution: number;  // Bulish: +0.5, Neutral: 0, Bearish: -0.2
}

interface PivotPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

/**
 * Finds alternating swing highs and swing lows to construct wave legs.
 */
function findAlternatingPivots(candles: Candle[], leftRight: number = 7): PivotPoint[] {
  const pivots: PivotPoint[] = [];
  const len = candles.length;

  let lastPivotType: "high" | "low" | null = null;

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

    if (isHigh && isLow) {
      // If both, pick the one that alternates
      if (lastPivotType === "high") {
        isHigh = false;
      } else {
        isLow = false;
      }
    }

    if (isHigh && lastPivotType !== "high") {
      pivots.push({ index: i, price: high, type: "high" });
      lastPivotType = "high";
    } else if (isLow && lastPivotType !== "low") {
      pivots.push({ index: i, price: low, type: "low" });
      lastPivotType = "low";
    }
  }

  return pivots;
}

/**
 * Simplified Elliot Wave analysis based on recent swing pivots.
 */
export function analyzeWaveTheory(candles: Candle[]): WaveAnalysisResult {
  const windowDays = Math.min(candles.length, 120);
  const recentCandles = candles.slice(-windowDays);
  
  // Find pivots in the last 120 candles using a coarser window (e.g. 7 days) to see major waves
  const rawPivots = findAlternatingPivots(recentCandles, 7);
  
  // Re-index raw pivots relative to the original candles array
  const startIndex = candles.length - windowDays;
  const pivots = rawPivots.map(p => ({
    index: p.index + startIndex,
    price: p.price,
    type: p.type
  }));

  const wavePoints: { index: number; price: number; type: "high" | "low"; label: string }[] = [];

  if (pivots.length < 3) {
    return {
      currentWave: "盘整/无明显波浪结构 (Consolidation)",
      waveDescription: "当前价格波动较小，未能探测到符合艾略特波浪理论的经典大级别波动波段。",
      wavePoints: [],
      waveScoreContribution: 0
    };
  }

  // We look at the last few pivots to match wave structures.
  // Let's analyze the last 5 pivots if available.
  const nPivots = pivots.length;
  
  // Let's assume pivots are sorted chronologically
  // We can look backwards from the latest pivot.
  // Try to find a 5-wave impulse sequence ending near the latest pivot or currently forming.
  // A standard bullish impulse wave: Low0 -> High1 -> Low2 -> High3 -> Low4 -> High5
  
  // Let's check the latest 4-5 pivots to see what structure matches
  let currentWave = "上升浪/下跌浪交替段 (Alternate Wave)";
  let waveDescription = "市场处于普通的价格波动波段，暂未形成标准艾略特 5 浪或 3 浪形态。";
  let waveScoreContribution = 0;

  // Let's search for a forming impulse: Low(0) -> High(1) -> Low(2) -> High(3)
  // Where Low(2) > Low(0) and High(3) > High(1)
  // This indicates a forming Wave 3!
  
  // Helper to get pivots from end
  const getFromEnd = (offset: number) => pivots[nPivots - 1 - offset];

  // Let's check if the latest pivot is low and we are currently rising, or latest is high and we are currently falling
  const currentPrice = candles[candles.length - 1].close;

  if (nPivots >= 4) {
    const p3 = getFromEnd(0); // Latest pivot
    const p2 = getFromEnd(1);
    const p1 = getFromEnd(2);
    const p0 = getFromEnd(3);

    // Case 1: p0(Low) -> p1(High) -> p2(Low) -> p3(High)
    if (p0.type === "low" && p1.type === "high" && p2.type === "low" && p3.type === "high") {
      const wave3Len = p3.price - p2.price;

      // Rules: 
      // 1. Wave 2 does not retrace below Wave 1 start
      // 2. Wave 3 goes above Wave 1 high
      if (p2.price > p0.price && p3.price > p1.price) {
        wavePoints.push(
          { ...p0, label: "浪(0)" },
          { ...p1, label: "浪(1)顶" },
          { ...p2, label: "浪(2)底" },
          { ...p3, label: "浪(3)顶" }
        );

        if (currentPrice < p3.price && currentPrice > p2.price) {
          currentWave = "第 4 浪回调 (Wave 4 Correction)";
          waveDescription = `价格已完成 3 浪上升（涨幅 $${wave3Len.toFixed(2)}），当前可能处于 4 浪回调中。只要价格不跌破 1 浪顶 $${p1.price}，回调仍是良性的多头买点。`;
          waveScoreContribution = 0.2; // Bullish pullback
        } else if (currentPrice >= p3.price) {
          currentWave = "第 5 浪冲顶 (Wave 5 Final Push)";
          waveDescription = `价格突破了 3 浪高点 $${p3.price}，疑似处于 5 浪最后的冲顶阶段。虽然趋势强劲，但需警惕动能耗尽和背离风险。`;
          waveScoreContribution = 0.3; // High momentum, but mature
        }
      }
    }
    
    // Case 2: p0(High) -> p1(Low) -> p2(High) -> p3(Low)
    // This is a bearish decline or corrective structure
    else if (p0.type === "high" && p1.type === "low" && p2.type === "high" && p3.type === "low") {
      if (p2.price < p0.price && p3.price < p1.price) {
        wavePoints.push(
          { ...p0, label: "A浪起点" },
          { ...p1, label: "A浪底" },
          { ...p2, label: "B浪反弹顶" },
          { ...p3, label: "C浪回调底" }
        );

        if (currentPrice > p3.price) {
          currentWave = "C浪筑底反弹段 (Post-C Wave Rebound)";
          waveDescription = `经历标准的 A-B-C 三浪下跌调整后，C 浪在 $${p3.price} 处探底。当前价格开始回升，暗示下跌浪结束，可能开启新一轮 1 浪上涨。`;
          waveScoreContribution = 0.5; // Strong buying signal (completed correction)
        } else {
          currentWave = "C 浪加速下跌 (Wave C Decline)";
          waveDescription = `目前处于大级别的 C 浪调整段，下行创出新低 $${p3.price}，趋势偏空，建议观望。`;
          waveScoreContribution = -0.2;
        }
      }
    }
  }

  // If no 4-pivot patterns match, check if we are forming Wave 3 (extremely bullish)
  if (wavePoints.length === 0 && nPivots >= 3) {
    const p2 = getFromEnd(0); // Latest pivot
    const p1 = getFromEnd(1);
    const p0 = getFromEnd(2);

    // p0(Low) -> p1(High) -> p2(Low), and current price is rising above p1.price
    if (p0.type === "low" && p1.type === "high" && p2.type === "low") {
      if (p2.price > p0.price && currentPrice > p1.price) {
        wavePoints.push(
          { ...p0, label: "浪(0)" },
          { ...p1, label: "浪(1)顶" },
          { ...p2, label: "浪(2)底" }
        );
        currentWave = "第 3 浪主升浪 (Wave 3 Impulse)";
        waveDescription = `系统探测到标准的 3 浪主升启动：1 浪冲高至 $${p1.price}，2 浪在 $${p2.price} 获得支撑（未破 1 浪起点），当前收盘价 $${currentPrice} 突破 1 浪高点，确认进入爆发力最强的第 3 浪主升段。`;
        waveScoreContribution = 0.5; // Maximum bullish wave score
      } else if (p2.price > p0.price && currentPrice <= p1.price && currentPrice > p2.price) {
        wavePoints.push(
          { ...p0, label: "浪(0)" },
          { ...p1, label: "浪(1)顶" },
          { ...p2, label: "浪(2)底" }
        );
        currentWave = "第 2 浪筑底蓄势 (Wave 2 Bottoming)";
        waveDescription = `处于 1 浪反弹后的 2 浪横盘整理蓄势段。只要价格站稳在 2 浪底 $${p2.price} 之上，随时可能爆发突破 1 浪顶的高动能 3 浪。`;
        waveScoreContribution = 0.1;
      }
    }
  }

  // If still empty, output default alternating description based on latest leg
  if (wavePoints.length === 0) {
    const latest = getFromEnd(0);
    const prev = getFromEnd(1);
    wavePoints.push(
      { ...prev, label: prev.type === "high" ? "波峰" : "波谷" },
      { ...latest, label: latest.type === "high" ? "阻力峰值" : "支撑谷值" }
    );

    if (latest.type === "low") {
      currentWave = "波段反弹段 (Swing Pullback Rebound)";
      waveDescription = `近期在 $${latest.price} 处见底回升。当前处于从波谷向上的反弹小波段中，上涨空间取决于上方阻力位。`;
      waveScoreContribution = 0.1;
    } else {
      currentWave = "波段回调段 (Swing Correction Pullback)";
      waveDescription = `近期在 $${latest.price} 处冲高回落。当前处于从波峰向下的短线回调小波段中，等待下方均线或前期极值点支撑。`;
      waveScoreContribution = -0.1;
    }
  }

  return {
    currentWave,
    waveDescription,
    wavePoints,
    waveScoreContribution
  };
}
