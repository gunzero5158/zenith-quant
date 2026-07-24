import { Candle } from "./indicators";
import { TradeLevel } from "./evidence";

export interface VolumeProfileNode {
  price: number;
  volume: number;
  volumeShare: number;
}

export interface VolumeProfileRange {
  poc: number;
  valueAreaHigh: number;
  valueAreaLow: number;
  nodes: VolumeProfileNode[];
}

export interface SupportResistanceResult {
  horizontalSupports: number[];    // Pivot-based support levels below current price
  horizontalResistances: number[];  // Pivot-based resistance levels above current price
  volumePOC: number;               // Point of Control (highest volume price)
  volumeSupportNodes: number[];    // High-volume bins below current price acting as support
  volumeResistanceNodes: number[];  // High-volume bins above current price acting as resistance
  volumeProfile: VolumeProfileRange;
  dynamicSupportEMA20: number;
  dynamicSupportEMA60: number;
  dynamicBOLLUpper: number;
  dynamicBOLLLower: number;
  typedLevels?: TradeLevel[];
  srDescription: string;
}

interface PivotRecord {
  price: number;
  index: number;
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

function findPivotRecords(candles: Candle[], leftRight: number = 5): { highs: PivotRecord[]; lows: PivotRecord[] } {
  const highs: PivotRecord[] = [];
  const lows: PivotRecord[] = [];
  for (let index = leftRight; index < candles.length - leftRight; index++) {
    const window = candles.slice(index - leftRight, index + leftRight + 1);
    if (window.every((candle, offset) => offset === leftRight || candle.high <= candles[index].high)) {
      highs.push({ price: candles[index].high, index });
    }
    if (window.every((candle, offset) => offset === leftRight || candle.low >= candles[index].low)) {
      lows.push({ price: candles[index].low, index });
    }
  }
  return { highs, lows };
}

function clusterPivotRecords(records: PivotRecord[], tolerancePercent = 1.5): Array<PivotRecord & { hits: number }> {
  const clusters: Array<{ records: PivotRecord[]; average: number }> = [];
  for (const record of [...records].sort((left, right) => left.price - right.price)) {
    const cluster = clusters.find((item) => Math.abs(record.price - item.average) / Math.max(item.average, Number.EPSILON) * 100 <= tolerancePercent);
    if (cluster) {
      cluster.records.push(record);
      cluster.average = cluster.records.reduce((sum, item) => sum + item.price, 0) / cluster.records.length;
    } else {
      clusters.push({ records: [record], average: record.price });
    }
  }
  return clusters.map((cluster) => ({
    price: Number(cluster.average.toFixed(2)),
    index: Math.max(...cluster.records.map((record) => record.index)),
    hits: cluster.records.length,
  }));
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
  const totalProfileVolume = bins.reduce((sum, bin) => sum + bin.volume, 0);
  const profileNodes = bins
    .map((bin) => ({
      price: Number(((bin.min + bin.max) / 2).toFixed(2)),
      volume: bin.volume,
      volumeShare: totalProfileVolume > 0 ? Number((bin.volume / totalProfileVolume).toFixed(4)) : 0,
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);

  const valueAreaTarget = totalProfileVolume * 0.7;
  let valueAreaVolume = bins[pocIdx]?.volume || 0;
  let valueAreaLowIdx = pocIdx;
  let valueAreaHighIdx = pocIdx;

  while (valueAreaVolume < valueAreaTarget && (valueAreaLowIdx > 0 || valueAreaHighIdx < numBins - 1)) {
    const lowerVol = valueAreaLowIdx > 0 ? bins[valueAreaLowIdx - 1].volume : -1;
    const upperVol = valueAreaHighIdx < numBins - 1 ? bins[valueAreaHighIdx + 1].volume : -1;
    if (upperVol >= lowerVol && valueAreaHighIdx < numBins - 1) {
      valueAreaHighIdx++;
      valueAreaVolume += bins[valueAreaHighIdx].volume;
    } else if (valueAreaLowIdx > 0) {
      valueAreaLowIdx--;
      valueAreaVolume += bins[valueAreaLowIdx].volume;
    } else {
      break;
    }
  }

  const volumeProfile: VolumeProfileRange = {
    poc: volumePOC,
    valueAreaHigh: Number(bins[valueAreaHighIdx].max.toFixed(2)),
    valueAreaLow: Number(bins[valueAreaLowIdx].min.toFixed(2)),
    nodes: profileNodes,
  };

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

  const pivotRecords = findPivotRecords(recentCandles, 5);
  const clusteredRecords = clusterPivotRecords([...pivotRecords.highs, ...pivotRecords.lows]);
  const typedLevels: TradeLevel[] = clusteredRecords.map((cluster) => ({
    price: cluster.price,
    kind: cluster.price < currentPrice ? "support" : "resistance",
    source: "horizontal",
    strength: Math.min(1, 0.35 + cluster.hits * 0.15),
    hits: cluster.hits,
    lastSeenIndex: candles.length - recentCandles.length + cluster.index,
  }));
  for (const price of [volumePOC, ...volumeSupportNodes.slice(0, 2), ...volumeResistanceNodes.slice(0, 2)]) {
    typedLevels.push({
      price,
      kind: price < currentPrice ? "support" : "resistance",
      source: "vpvr",
      strength: price === volumePOC ? 0.85 : 0.65,
    });
  }
  for (const [price, source, kind] of [
    [dynamicSupportEMA20, "ema", dynamicSupportEMA20 < currentPrice ? "support" : "resistance"],
    [dynamicSupportEMA60, "ema", dynamicSupportEMA60 < currentPrice ? "support" : "resistance"],
    [dynamicBOLLUpper, "boll", dynamicBOLLUpper < currentPrice ? "support" : "resistance"],
    [dynamicBOLLLower, "boll", dynamicBOLLLower < currentPrice ? "support" : "resistance"],
  ] as const) {
    typedLevels.push({ price, source, kind, strength: 0.55 });
  }

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
    volumeProfile,
    dynamicSupportEMA20,
    dynamicSupportEMA60,
    dynamicBOLLUpper,
    dynamicBOLLLower,
    typedLevels,
    srDescription: desc
  };
}
