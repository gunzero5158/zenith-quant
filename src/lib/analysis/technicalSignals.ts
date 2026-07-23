export type Direction = "rising" | "falling" | "flat";
export type Cross = "golden" | "death" | "none";

interface SignalBase {
  available: boolean;
  provisional: boolean;
}

function finiteAt(values: number[], index: number): number | undefined {
  const value = values[index];
  return Number.isFinite(value) ? value : undefined;
}

function direction(current?: number, previous?: number, tolerance = 1e-8): Direction {
  if (current === undefined || previous === undefined || Math.abs(current - previous) <= tolerance) return "flat";
  return current > previous ? "rising" : "falling";
}

function latestCross(
  left: number[],
  right: number[],
  index: number,
  lookback = 3
): { cross: Cross; barsSinceCross?: number } {
  const earliest = Math.max(1, index - lookback + 1);
  for (let cursor = index; cursor >= earliest; cursor--) {
    const previousLeft = finiteAt(left, cursor - 1);
    const previousRight = finiteAt(right, cursor - 1);
    const currentLeft = finiteAt(left, cursor);
    const currentRight = finiteAt(right, cursor);
    if ([previousLeft, previousRight, currentLeft, currentRight].some((value) => value === undefined)) continue;
    if (previousLeft! <= previousRight! && currentLeft! > currentRight!) {
      return { cross: "golden", barsSinceCross: index - cursor };
    }
    if (previousLeft! >= previousRight! && currentLeft! < currentRight!) {
      return { cross: "death", barsSinceCross: index - cursor };
    }
  }
  return { cross: "none" };
}

export interface MacdSignal extends SignalBase {
  relation: "bullish" | "bearish" | "neutral";
  cross: Cross;
  barsSinceCross?: number;
  zone: "above_zero" | "below_zero" | "mixed" | "unknown";
  histogramTrend: "expanding" | "contracting" | "flat" | "unknown";
  dif?: number;
  dea?: number;
  histogram?: number;
}

export function analyzeMacd(
  difValues: number[],
  deaValues: number[],
  histogramValues: number[],
  index: number,
  provisional: boolean
): MacdSignal {
  const dif = finiteAt(difValues, index);
  const dea = finiteAt(deaValues, index);
  const histogram = finiteAt(histogramValues, index);
  if (dif === undefined || dea === undefined || histogram === undefined) {
    return {
      available: false,
      provisional,
      relation: "neutral",
      cross: "none",
      zone: "unknown",
      histogramTrend: "unknown",
    };
  }

  const cross = latestCross(difValues, deaValues, index);
  const previousHistogram = finiteAt(histogramValues, index - 1);
  let histogramTrend: MacdSignal["histogramTrend"] = "flat";
  if (previousHistogram !== undefined) {
    const bullishStrength = histogram - previousHistogram;
    histogramTrend = Math.abs(bullishStrength) <= 1e-8
      ? "flat"
      : Math.abs(histogram) > Math.abs(previousHistogram) && Math.sign(histogram) === Math.sign(previousHistogram)
        ? "expanding"
        : Math.sign(histogram) !== Math.sign(previousHistogram)
          ? "expanding"
          : "contracting";
  }

  return {
    available: true,
    provisional,
    relation: dif > dea ? "bullish" : dif < dea ? "bearish" : "neutral",
    ...cross,
    zone: dif > 0 && dea > 0 ? "above_zero" : dif < 0 && dea < 0 ? "below_zero" : "mixed",
    histogramTrend,
    dif,
    dea,
    histogram,
  };
}

export interface KdjSignal extends SignalBase {
  relation: "bullish" | "bearish" | "neutral";
  cross: Cross;
  barsSinceCross?: number;
  zone: "low" | "middle" | "high" | "unknown";
  jState: "oversold" | "normal" | "overbought" | "unknown";
  k?: number;
  d?: number;
  j?: number;
}

export function analyzeKdj(
  kValues: number[],
  dValues: number[],
  jValues: number[],
  index: number,
  provisional: boolean
): KdjSignal {
  const k = finiteAt(kValues, index);
  const d = finiteAt(dValues, index);
  const j = finiteAt(jValues, index);
  if (k === undefined || d === undefined || j === undefined) {
    return {
      available: false,
      provisional,
      relation: "neutral",
      cross: "none",
      zone: "unknown",
      jState: "unknown",
    };
  }
  const cross = latestCross(kValues, dValues, index);
  const zoneBasis = (k + d) / 2;
  return {
    available: true,
    provisional,
    relation: k > d ? "bullish" : k < d ? "bearish" : "neutral",
    ...cross,
    zone: zoneBasis >= 70 ? "high" : zoneBasis <= 30 ? "low" : "middle",
    jState: j >= 100 ? "overbought" : j <= 0 ? "oversold" : "normal",
    k,
    d,
    j,
  };
}

export type RsiThresholdCross =
  | "up_30" | "down_30"
  | "up_50" | "down_50"
  | "up_70" | "down_70"
  | "none";

export interface RsiSignal extends SignalBase {
  value?: number;
  zone: "oversold" | "neutral_weak" | "neutral_strong" | "overbought" | "unknown";
  thresholdCross: RsiThresholdCross;
  barsSinceCross?: number;
  slope: Direction | "unknown";
}

function latestThresholdCross(values: number[], index: number, lookback = 3): {
  thresholdCross: RsiThresholdCross;
  barsSinceCross?: number;
} {
  const thresholds = [30, 50, 70] as const;
  const earliest = Math.max(1, index - lookback + 1);
  for (let cursor = index; cursor >= earliest; cursor--) {
    const previous = finiteAt(values, cursor - 1);
    const current = finiteAt(values, cursor);
    if (previous === undefined || current === undefined) continue;
    for (const threshold of thresholds) {
      if (previous <= threshold && current > threshold) {
        return { thresholdCross: `up_${threshold}`, barsSinceCross: index - cursor };
      }
      if (previous >= threshold && current < threshold) {
        return { thresholdCross: `down_${threshold}`, barsSinceCross: index - cursor };
      }
    }
  }
  return { thresholdCross: "none" };
}

export function analyzeRsi(values: number[], index: number, provisional: boolean): RsiSignal {
  const value = finiteAt(values, index);
  if (value === undefined) {
    return {
      available: false,
      provisional,
      zone: "unknown",
      thresholdCross: "none",
      slope: "unknown",
    };
  }
  return {
    available: true,
    provisional,
    value,
    zone: value <= 30 ? "oversold" : value < 50 ? "neutral_weak" : value < 70 ? "neutral_strong" : "overbought",
    ...latestThresholdCross(values, index),
    slope: direction(value, finiteAt(values, index - 1)),
  };
}

export interface EmaSignal extends SignalBase {
  order: "bullish" | "bearish" | "mixed" | "unknown";
  pricePosition: "above_all" | "below_all" | "inside" | "unknown";
  slopes: Record<"ema5" | "ema10" | "ema20" | "ema60", Direction | "unknown">;
  values: Partial<Record<"ema5" | "ema10" | "ema20" | "ema60", number>>;
}

interface EmaInput {
  price: number;
  ema5: number[];
  ema10: number[];
  ema20: number[];
  ema60: number[];
  index: number;
  provisional: boolean;
}

export function analyzeEma(input: EmaInput): EmaSignal {
  const series = { ema5: input.ema5, ema10: input.ema10, ema20: input.ema20, ema60: input.ema60 };
  const values = Object.fromEntries(
    Object.entries(series)
      .map(([key, value]) => [key, finiteAt(value, input.index)])
      .filter((entry) => entry[1] !== undefined)
  ) as EmaSignal["values"];
  const complete = [values.ema5, values.ema10, values.ema20, values.ema60].every((value) => value !== undefined);
  const slopes = Object.fromEntries(
    Object.entries(series).map(([key, value]) => {
      const current = finiteAt(value, input.index);
      const previous = finiteAt(value, input.index - 1);
      return [key, current === undefined ? "unknown" : direction(current, previous)];
    })
  ) as EmaSignal["slopes"];

  if (!complete || !Number.isFinite(input.price)) {
    return { available: false, provisional: input.provisional, order: "unknown", pricePosition: "unknown", slopes, values };
  }
  const ordered = [values.ema5!, values.ema10!, values.ema20!, values.ema60!];
  return {
    available: true,
    provisional: input.provisional,
    order: ordered.every((value, idx) => idx === 0 || ordered[idx - 1] > value)
      ? "bullish"
      : ordered.every((value, idx) => idx === 0 || ordered[idx - 1] < value)
        ? "bearish"
        : "mixed",
    pricePosition: input.price > Math.max(...ordered) ? "above_all" : input.price < Math.min(...ordered) ? "below_all" : "inside",
    slopes,
    values,
  };
}

export interface BollSignal extends SignalBase {
  position: "above_upper" | "upper_half" | "lower_half" | "below_lower" | "unknown";
  percentB?: number;
  bandwidth?: number;
  bandwidthTrend: Direction | "unknown";
}

interface BollInput {
  price: number;
  middle: number[];
  upper: number[];
  lower: number[];
  index: number;
  provisional: boolean;
}

export function analyzeBoll(input: BollInput): BollSignal {
  const middle = finiteAt(input.middle, input.index);
  const upper = finiteAt(input.upper, input.index);
  const lower = finiteAt(input.lower, input.index);
  if ([middle, upper, lower].some((value) => value === undefined) || !Number.isFinite(input.price) || upper === lower) {
    return { available: false, provisional: input.provisional, position: "unknown", bandwidthTrend: "unknown" };
  }
  const bandwidth = ((upper! - lower!) / middle!) * 100;
  const previousMiddle = finiteAt(input.middle, input.index - 1);
  const previousUpper = finiteAt(input.upper, input.index - 1);
  const previousLower = finiteAt(input.lower, input.index - 1);
  const previousBandwidth = previousMiddle && previousUpper !== undefined && previousLower !== undefined
    ? ((previousUpper - previousLower) / previousMiddle) * 100
    : undefined;
  return {
    available: true,
    provisional: input.provisional,
    position: input.price > upper! ? "above_upper" : input.price >= middle! ? "upper_half" : input.price >= lower! ? "lower_half" : "below_lower",
    percentB: Number((((input.price - lower!) / (upper! - lower!)) * 100).toFixed(2)),
    bandwidth: Number(bandwidth.toFixed(2)),
    bandwidthTrend: direction(bandwidth, previousBandwidth, 0.25),
  };
}

export interface AtrSignal extends SignalBase {
  value?: number;
  percentOfPrice?: number;
  direction: "expanding" | "contracting" | "flat" | "unknown";
}

export function analyzeAtr(values: number[], price: number, index: number, provisional: boolean): AtrSignal {
  const value = finiteAt(values, index);
  if (value === undefined || !Number.isFinite(price) || price <= 0) {
    return { available: false, provisional, direction: "unknown" };
  }
  const atrDirection = direction(value, finiteAt(values, index - 1));
  return {
    available: true,
    provisional,
    value,
    percentOfPrice: Number(((value / price) * 100).toFixed(2)),
    direction: atrDirection === "rising" ? "expanding" : atrDirection === "falling" ? "contracting" : "flat",
  };
}

export interface IchimokuSignal extends SignalBase {
  priceVsCloud: "above" | "inside" | "below" | "unknown";
  lineRelation: "bullish" | "bearish" | "neutral";
  cross: Cross;
  barsSinceCross?: number;
  cloudBias: "bullish" | "bearish" | "neutral" | "unknown";
  cloudTop?: number;
  cloudBottom?: number;
}

interface IchimokuInput {
  price: number;
  tenkan: number[];
  kijun: number[];
  spanA: number[];
  spanB: number[];
  index: number;
  provisional: boolean;
}

export function analyzeIchimoku(input: IchimokuInput): IchimokuSignal {
  const tenkan = finiteAt(input.tenkan, input.index);
  const kijun = finiteAt(input.kijun, input.index);
  const spanA = finiteAt(input.spanA, input.index);
  const spanB = finiteAt(input.spanB, input.index);
  if ([tenkan, kijun, spanA, spanB].some((value) => value === undefined) || !Number.isFinite(input.price)) {
    return {
      available: false,
      provisional: input.provisional,
      priceVsCloud: "unknown",
      lineRelation: "neutral",
      cross: "none",
      cloudBias: "unknown",
    };
  }
  const cloudTop = Math.max(spanA!, spanB!);
  const cloudBottom = Math.min(spanA!, spanB!);
  return {
    available: true,
    provisional: input.provisional,
    priceVsCloud: input.price > cloudTop ? "above" : input.price < cloudBottom ? "below" : "inside",
    lineRelation: tenkan! > kijun! ? "bullish" : tenkan! < kijun! ? "bearish" : "neutral",
    ...latestCross(input.tenkan, input.kijun, input.index),
    cloudBias: spanA! > spanB! ? "bullish" : spanA! < spanB! ? "bearish" : "neutral",
    cloudTop,
    cloudBottom,
  };
}
