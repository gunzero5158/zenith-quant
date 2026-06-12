import { Candle } from "./indicators";

export interface SupportResistanceResult {
  horizontalSupports: number[];    // Pivot-based support levels below current price
  horizontalResistances: number[];  // Pivot-based resistance levels above current price
  volumePOC: number;               // Point of Control (highest volume price)
  volumeSupportNodes: number[];    // High-volume bins below current price acting as support
  volumeResistanceNodes: number[];  // High-volume bins above current price acting as resistance
  dynamicSupportEMA20: number;
  dynamicSupportEMA60: number;
  dynamicBOLLUpper: number;
  dynamicBOLLLower: number;
  srDescription: string;
}

/**
 * Detects swing high and swing low pivot points.
 * A pivot is a point that is the local extreme within a window of size 2*leftRight + 1.
 */
function findPivots(candles: Candle[], leftRight: number = 5): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  const len = candles.length;

  for (let i = leftRight; i < len - leftRight; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    let isHigh = true;
    let isLow = true;

    for (let j = i - leftRight; j <= i + leftRight; j++) {
      if (j === i) continue;
      if (candles[j].high > currentHigh) isHigh = false;
      if (candles[j].low < currentLow) isLow = false;
    }

    if (isHigh) highs.push(currentHigh);
    if (isLow) lows.push(currentLow);
  }

  return { highs, lows };
}

/**
 * Simple density clustering algorithm for horizontal price levels.
 * Groups prices that are within a tolerance percentage of each other.
 */
function clusterPrices(prices: number[], tolerancePercent: number = 1.5): { price: number; hits: number }[] {
  if (prices.length === 0) return [];
  
  // Sort prices ascending
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: { sum: number; count: number; prices: number[] }[] = [];

  for (const price of sorted) {
    let matched = false;
    for (const cluster of clusters) {
      const avg = cluster.sum / cluster.count;
      if (Math.abs(price - avg) / avg * 100 <= tolerancePercent) {
        cluster.sum += price;
        cluster.count += 1;
        cluster.prices.push(price);
        matched = true;
        break;
      }
    }

    if (!matched) {
      clusters.push({ sum: price, count: 1, prices: [price] });
    }
  }

  return clusters
    .map(c => ({
      price: Number((c.sum / c.count).toFixed(2)),
      hits: c.count
    }))
    // Sort by number of hits descending
    .sort((a, b) => b.hits - a.hits);
}

/**
 * Calculates the Support and Resistance levels from pivot points, volume profile, and dynamic indicators.
 */
export function calculateSupportResistance(
  candles: Candle[],
  currentPrice: number,
  ema20Val: number,
  ema60Val: number,
  bollUpperVal: number,
  bollLowerVal: number
): SupportResistanceResult {
  const windowDays = Math.min(candles.length, 120);
  const recentCandles = candles.slice(-windowDays);

  // 1. Pivot-based Support and Resistance
  const { highs, lows } = findPivots(recentCandles, 5);
  const allPivots = [...highs, ...lows];
  const clusteredPivots = clusterPrices(allPivots, 1.5);

  // Separate clustered pivots into supports (below current price) and resistances (above)
  const horizontalSupports = clusteredPivots
    .filter(p => p.price < currentPrice)
    .map(p => p.price)
    .sort((a, b) => b - a) // Nearest support first
    .slice(0, 3);

  const horizontalResistances = clusteredPivots
    .filter(p => p.price > currentPrice)
    .map(p => p.price)
    .sort((a, b) => a - b) // Nearest resistance first
    .slice(0, 3);

  // 2. Volume Profile (筹码分布)
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const c of recentCandles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  }

  const numBins = 20;
  const binSize = (maxPrice - minPrice) / numBins;
  const bins = Array(numBins).fill(0).map((_, i) => ({
    min: minPrice + i * binSize,
    max: minPrice + (i + 1) * binSize,
    volume: 0,
  }));

  // Assign trading volume to price bins based on candle close
  for (const c of recentCandles) {
    const binIdx = Math.min(Math.floor((c.close - minPrice) / binSize), numBins - 1);
    if (binIdx >= 0 && binIdx < numBins) {
      bins[binIdx].volume += c.volume;
    }
  }

  // Find Point of Control (POC)
  let maxVolume = -1;
  let pocIdx = 0;
  for (let i = 0; i < numBins; i++) {
    if (bins[i].volume > maxVolume) {
      maxVolume = bins[i].volume;
      pocIdx = i;
    }
  }
  const volumePOC = Number(((bins[pocIdx].min + bins[pocIdx].max) / 2).toFixed(2));

  // Find other high-volume nodes (e.g. volume > 70% of maxVolume) as additional S/R
  const volumeSupportNodes: number[] = [];
  const volumeResistanceNodes: number[] = [];
  
  for (let i = 0; i < numBins; i++) {
    if (i !== pocIdx && bins[i].volume > maxVolume * 0.7) {
      const midPrice = (bins[i].min + bins[i].max) / 2;
      if (midPrice < currentPrice) {
        volumeSupportNodes.push(Number(midPrice.toFixed(2)));
      } else {
        volumeResistanceNodes.push(Number(midPrice.toFixed(2)));
      }
    }
  }

  // Clean up and sort
  volumeSupportNodes.sort((a, b) => b - a);
  volumeResistanceNodes.sort((a, b) => a - b);

  // 3. Dynamic Support & Resistance
  const dynamicSupportEMA20 = isNaN(ema20Val) ? currentPrice : Number(ema20Val.toFixed(2));
  const dynamicSupportEMA60 = isNaN(ema60Val) ? currentPrice : Number(ema60Val.toFixed(2));
  const dynamicBOLLUpper = isNaN(bollUpperVal) ? currentPrice : Number(bollUpperVal.toFixed(2));
  const dynamicBOLLLower = isNaN(bollLowerVal) ? currentPrice : Number(bollLowerVal.toFixed(2));

  // 4. Formulate S/R Description
  let desc = "";
  const nearSupport = horizontalSupports[0];
  const nearResistance = horizontalResistances[0];

  if (nearSupport) {
    const pct = ((currentPrice - nearSupport) / currentPrice * 100).toFixed(1);
    desc += `下方最近水平支撑位在 $${nearSupport}（距当前价约 ${pct}%）；`;
  } else {
    desc += `下方依托动态均线 EMA60 ($${dynamicSupportEMA60}) 提供支撑；`;
  }

  if (nearResistance) {
    const pct = ((nearResistance - currentPrice) / currentPrice * 100).toFixed(1);
    desc += `上方最近水平压力位在 $${nearResistance}（距当前价约 ${pct}%）。`;
  } else {
    desc += `上方临近布林上轨压力位 $${dynamicBOLLUpper}。`;
  }

  if (Math.abs(currentPrice - volumePOC) / currentPrice * 100 <= 2) {
    desc += ` 股票价格当前正处于筹码密集区峰值 (POC: $${volumePOC}) 附近，预计将有剧烈方向选择。`;
  } else if (currentPrice > volumePOC) {
    desc += ` 价格处于筹码密集峰值 $${volumePOC} 之上，筹码结构安全，POC转化为强底支撑。`;
  } else {
    desc += ` 价格处于筹码密集峰值 $${volumePOC} 之下，上方有较重筹码套牢盘压力。`;
  }

  return {
    horizontalSupports,
    horizontalResistances,
    volumePOC,
    volumeSupportNodes: volumeSupportNodes.slice(0, 2),
    volumeResistanceNodes: volumeResistanceNodes.slice(0, 2),
    dynamicSupportEMA20,
    dynamicSupportEMA60,
    dynamicBOLLUpper,
    dynamicBOLLLower,
    srDescription: desc
  };
}
