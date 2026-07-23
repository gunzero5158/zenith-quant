import { CandlestickPatternSignal } from "./candlestickPatterns";
import { ChanLunResult } from "./chanlun";
import {
  DataQuality,
  EvidenceDirection,
  EvidenceItem,
  EvidenceSnapshot,
  SIGNAL_FAMILIES,
  SignalFamily,
  Timeframe,
  TradeLevel,
} from "./evidence";
import { FibonacciAnalysis, PatternSignal } from "./patterns";
import {
  AtrSignal,
  BollSignal,
  EmaSignal,
  IchimokuSignal,
  KdjSignal,
  MacdSignal,
  RsiSignal,
} from "./technicalSignals";
import { VolumeAnalysisResult } from "./volumeForce";

export interface TechnicalFrameEvidence {
  ema?: EmaSignal;
  boll?: BollSignal;
  ichimoku?: IchimokuSignal;
  macd?: MacdSignal;
  kdj?: KdjSignal;
  rsi?: RsiSignal;
  atr?: AtrSignal;
  volume?: VolumeAnalysisResult;
}

export interface PatternEvidenceInput {
  activePatterns?: PatternSignal[];
  fibonacci?: FibonacciAnalysis;
  macdDivergence?: "top" | "bottom" | "none";
  rsiDivergence?: "top" | "bottom" | "none";
  kdjDivergence?: "top" | "bottom" | "none";
  tdSequential?: number[];
  tdSignal?: string;
  latestCount?: number;
  latestSetup?: "buy" | "sell" | "none";
  barsSinceSetup9?: number;
}

export interface ElliottEvidenceInput {
  state: string;
  direction?: EvidenceDirection;
  description: string;
}

export interface EvidenceBuilderInput {
  symbol: string;
  price: number;
  dataQuality: DataQuality;
  daily?: TechnicalFrameEvidence;
  weekly?: TechnicalFrameEvidence;
  patterns?: PatternEvidenceInput;
  candlesticks?: CandlestickPatternSignal[];
  chanlun?: Partial<ChanLunResult>;
  elliottWave?: ElliottEvidenceInput;
  levels?: TradeLevel[];
}

function reliability(provisional: boolean, available = true): number {
  if (!available) return 0;
  return provisional ? 0.65 : 0.9;
}

function item(
  family: SignalFamily,
  timeframe: Timeframe,
  id: string,
  direction: EvidenceDirection,
  state: string,
  description: string,
  provisional: boolean,
  options: Pick<EvidenceItem, "barsSince" | "values" | "invalidation"> = {}
): EvidenceItem {
  return {
    id,
    family,
    timeframe,
    direction,
    state,
    label: id,
    description,
    provisional,
    reliability: reliability(provisional),
    ...options,
  };
}

function directionFromRelation(relation: "bullish" | "bearish" | "neutral"): EvidenceDirection {
  return relation;
}

function addTechnicalFrame(items: EvidenceItem[], frame: TechnicalFrameEvidence | undefined, timeframe: Timeframe, provisional: boolean): void {
  if (!frame) return;

  if (frame.ema?.available) {
    items.push(item("ema", timeframe, `${timeframe}.ema.${frame.ema.order}`, frame.ema.order === "mixed" || frame.ema.order === "unknown" ? "neutral" : frame.ema.order, frame.ema.order, `EMA order is ${frame.ema.order}; price is ${frame.ema.pricePosition}.`, provisional, {
      values: { order: frame.ema.order, pricePosition: frame.ema.pricePosition },
    }));
  }
  if (frame.boll?.available) {
    const direction: EvidenceDirection = frame.boll.position === "above_upper" ? "bullish" : frame.boll.position === "below_lower" ? "bearish" : "neutral";
    items.push(item("boll", timeframe, `${timeframe}.boll.${frame.boll.position}`, direction, frame.boll.position, `BOLL position ${frame.boll.position}, bandwidth ${frame.boll.bandwidthTrend}.`, provisional, {
      values: { percentB: frame.boll.percentB ?? 0, bandwidth: frame.boll.bandwidth ?? 0, bandwidthTrend: frame.boll.bandwidthTrend },
    }));
  }
  if (frame.ichimoku?.available) {
    const direction: EvidenceDirection = frame.ichimoku.priceVsCloud === "above" && frame.ichimoku.lineRelation === "bullish"
      ? "bullish"
      : frame.ichimoku.priceVsCloud === "below" && frame.ichimoku.lineRelation === "bearish"
        ? "bearish"
        : "neutral";
    const state = frame.ichimoku.cross !== "none" ? `${frame.ichimoku.cross}_cross` : frame.ichimoku.priceVsCloud;
    items.push(item("ichimoku", timeframe, `${timeframe}.ichimoku.${state}`, direction, state, `Price is ${frame.ichimoku.priceVsCloud} the cloud; lines are ${frame.ichimoku.lineRelation}.`, provisional, {
      barsSince: frame.ichimoku.barsSinceCross,
      values: { cloudBias: frame.ichimoku.cloudBias, lineRelation: frame.ichimoku.lineRelation },
    }));
  }
  if (frame.macd?.available) {
    const state = frame.macd.cross !== "none" ? `${frame.macd.cross}_cross` : frame.macd.relation;
    items.push(item("macd", timeframe, `${timeframe}.macd.${state}`, directionFromRelation(frame.macd.relation), state, `MACD is ${frame.macd.relation} in ${frame.macd.zone}; histogram is ${frame.macd.histogramTrend}.`, provisional, {
      barsSince: frame.macd.barsSinceCross,
      values: { zone: frame.macd.zone, histogramTrend: frame.macd.histogramTrend },
    }));
  }
  if (frame.kdj?.available) {
    const state = frame.kdj.cross !== "none" ? `${frame.kdj.cross}_cross` : frame.kdj.relation;
    items.push(item("kdj", timeframe, `${timeframe}.kdj.${state}`, directionFromRelation(frame.kdj.relation), state, `KDJ is ${frame.kdj.relation} in the ${frame.kdj.zone} zone.`, provisional, {
      barsSince: frame.kdj.barsSinceCross,
      values: { zone: frame.kdj.zone, jState: frame.kdj.jState },
    }));
  }
  if (frame.rsi?.available) {
    const direction: EvidenceDirection = frame.rsi.thresholdCross.startsWith("up_") || frame.rsi.zone === "neutral_strong"
      ? "bullish"
      : frame.rsi.thresholdCross.startsWith("down_") || frame.rsi.zone === "oversold"
        ? "bearish"
        : "neutral";
    const state = frame.rsi.thresholdCross !== "none" ? frame.rsi.thresholdCross : frame.rsi.zone;
    items.push(item("rsi", timeframe, `${timeframe}.rsi.${state}`, direction, state, `RSI14 is ${frame.rsi.value} in ${frame.rsi.zone}; slope ${frame.rsi.slope}.`, provisional, {
      barsSince: frame.rsi.barsSinceCross,
      values: { value: frame.rsi.value ?? 0, slope: frame.rsi.slope },
    }));
  }
  if (frame.atr?.available) {
    items.push(item("atr", timeframe, `${timeframe}.atr.${frame.atr.direction}`, "neutral", frame.atr.direction, `ATR is ${frame.atr.percentOfPrice}% of price and ${frame.atr.direction}.`, provisional, {
      values: { value: frame.atr.value ?? 0, percentOfPrice: frame.atr.percentOfPrice ?? 0 },
    }));
  }

  const volume = frame.volume;
  if (volume) {
    const volumeDirection = volume.volumeDirection ?? "neutral";
    items.push(item("volume", timeframe, `${timeframe}.volume.${volumeDirection}`, volumeDirection, volumeDirection, `Relative volume is ${volume.relativeVolume ?? 0}; low-volume pullback=${Boolean(volume.isLowVolumePullback)}.`, provisional, {
      values: { relativeVolume: volume.relativeVolume ?? 0, isLowVolumePullback: Boolean(volume.isLowVolumePullback) },
    }));
    const cmfValue = [...volume.cmf].reverse().find(Number.isFinite);
    const cmfDirection: EvidenceDirection = (cmfValue ?? 0) > 0.1 ? "bullish" : (cmfValue ?? 0) < -0.1 ? "bearish" : "neutral";
    items.push(item("cmf", timeframe, `${timeframe}.cmf.${volume.cmfTrend ?? "flat"}`, cmfDirection, volume.cmfTrend ?? "flat", `CMF is ${cmfValue ?? "unavailable"}; trend ${volume.cmfTrend ?? "flat"}.`, provisional, {
      values: { value: cmfValue ?? 0, trend: volume.cmfTrend ?? "flat" },
    }));
    const obvDirection: EvidenceDirection = volume.obvTrend === "rising" ? "bullish" : volume.obvTrend === "falling" ? "bearish" : "neutral";
    items.push(item("obv", timeframe, `${timeframe}.obv.${volume.obvTrend ?? "flat"}`, obvDirection, volume.obvTrend ?? "flat", `OBV trend is ${volume.obvTrend ?? "flat"}.`, provisional));
  }
}

function addPatternEvidence(items: EvidenceItem[], input: EvidenceBuilderInput): void {
  const provisional = !input.dataQuality.dailyBarComplete;
  const patterns = input.patterns;
  if (!patterns) return;

  const divergenceSources = [
    patterns.macdDivergence === "bottom" ? "macd" : undefined,
    patterns.rsiDivergence === "bottom" ? "rsi" : undefined,
    patterns.kdjDivergence === "bottom" ? "kdj" : undefined,
  ].filter(Boolean) as string[];
  if (divergenceSources.length > 0) {
    items.push(item("macd", "daily", "daily.momentum.bottom_divergence", "bullish", "bottom_divergence", "Momentum indicators show a bullish divergence cluster.", provisional, {
      values: { sources: divergenceSources.join(",") },
    }));
  }
  const topSources = [
    patterns.macdDivergence === "top" ? "macd" : undefined,
    patterns.rsiDivergence === "top" ? "rsi" : undefined,
    patterns.kdjDivergence === "top" ? "kdj" : undefined,
  ].filter(Boolean) as string[];
  if (topSources.length > 0) {
    items.push(item("macd", "daily", "daily.momentum.top_divergence", "bearish", "top_divergence", "Momentum indicators show a bearish divergence cluster.", provisional, {
      values: { sources: topSources.join(",") },
    }));
  }

  for (const pattern of patterns.activePatterns ?? []) {
    items.push(item("classicalPattern", "daily", `daily.pattern.${pattern.key}.${pattern.status ?? "forming"}`, pattern.bias, pattern.status ?? "forming", pattern.description, provisional, {
      barsSince: pattern.barsSinceStatus,
      values: {
        confidence: pattern.confidence,
        volumeConfirmation: pattern.volumeConfirmation ?? "unconfirmed",
        triggerPrice: pattern.triggerPrice ?? 0,
        targetPrice: pattern.targetPrice ?? 0,
        invalidationPrice: pattern.invalidationPrice ?? 0,
      },
    }));
  }
  if (patterns.latestSetup && patterns.latestSetup !== "none" && patterns.barsSinceSetup9 !== undefined) {
    const direction: EvidenceDirection = patterns.latestSetup === "buy" ? "bullish" : "bearish";
    items.push(item("tdSequential", "daily", `daily.td.${patterns.latestSetup}_setup_9`, direction, `${patterns.latestSetup}_setup_9`, `TD ${patterns.latestSetup} Setup 9 occurred ${patterns.barsSinceSetup9} bars ago.`, provisional, {
      barsSince: patterns.barsSinceSetup9,
      values: { latestCount: patterns.latestCount ?? 0 },
    }));
  }
}

function addOtherEvidence(items: EvidenceItem[], input: EvidenceBuilderInput): void {
  const provisional = !input.dataQuality.dailyBarComplete;
  for (const signal of input.candlesticks ?? []) {
    items.push(item("candlestick", "daily", `daily.candlestick.${signal.id}`, signal.bias, signal.state, signal.description, provisional, {
      barsSince: signal.barsSince,
      values: { location: signal.location, confidence: signal.confidence },
    }));
  }
  if (input.chanlun) {
    const direction: EvidenceDirection = input.chanlun.formingFractal === "bottom"
      ? "bullish"
      : input.chanlun.formingFractal === "top"
        ? "bearish"
        : "neutral";
    const state = input.chanlun.formingFractal && input.chanlun.formingFractal !== "none"
      ? `forming_${input.chanlun.formingFractal}`
      : `${input.chanlun.currentStrokeDirection ?? "unknown"}_stroke`;
    items.push(item("chanlun", "daily", `daily.chanlun.${state}`, direction, state, input.chanlun.chanlunDescription ?? "Chanlun structure is unavailable.", provisional, {
      values: input.chanlun.centralZone ? {
        zoneLow: input.chanlun.centralZone.low,
        zoneHigh: input.chanlun.centralZone.high,
        pricePosition: input.chanlun.centralZone.pricePosition,
      } : undefined,
    }));
  }
  if (input.elliottWave) {
    items.push(item("elliottWave", "daily", `daily.elliott.${input.elliottWave.state}`, input.elliottWave.direction ?? "neutral", input.elliottWave.state, input.elliottWave.description, provisional));
  }
}

function collectLevels(input: EvidenceBuilderInput): TradeLevel[] {
  const levels: TradeLevel[] = [...(input.levels ?? [])];
  for (const level of input.patterns?.fibonacci?.levels ?? []) {
    if (!Number.isFinite(level.price)) continue;
    levels.push({
      price: level.price,
      kind: level.price < input.price ? "support" : "resistance",
      source: "fibonacci",
      strength: level.label === "50.0%" || level.label === "61.8%" ? 0.7 : 0.55,
    });
  }
  for (const pattern of input.patterns?.activePatterns ?? []) {
    if (Number.isFinite(pattern.triggerPrice)) {
      levels.push({ price: pattern.triggerPrice!, kind: pattern.bias === "bullish" ? "resistance" : "support", source: "pattern", strength: pattern.confidence });
    }
    if (Number.isFinite(pattern.targetPrice)) {
      levels.push({ price: pattern.targetPrice!, kind: "target", source: "pattern", strength: pattern.confidence });
    }
    if (Number.isFinite(pattern.invalidationPrice)) {
      levels.push({ price: pattern.invalidationPrice!, kind: "stop", source: "pattern", strength: pattern.confidence });
    }
  }
  const seen = new Set<string>();
  return levels.filter((level) => {
    if (!Number.isFinite(level.price)) return false;
    const key = `${level.source}:${level.kind}:${level.price.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function weeklyRegime(items: EvidenceItem[]): EvidenceSnapshot["weeklyRegime"] {
  const weekly = items.filter((candidate) => candidate.timeframe === "weekly" && ["ema", "macd", "rsi", "ichimoku", "volume"].includes(candidate.family));
  const score = weekly.reduce((sum, candidate) => sum + (candidate.direction === "bullish" ? 1 : candidate.direction === "bearish" ? -1 : 0), 0);
  return score >= 2 ? "bullish" : score <= -2 ? "bearish" : "neutral";
}

function dailyPhase(input: EvidenceBuilderInput, items: EvidenceItem[]): EvidenceSnapshot["dailyPhase"] {
  const ema = input.daily?.ema;
  const boll = input.daily?.boll;
  const bullishBreakout = items.some((candidate) => candidate.timeframe === "daily" && candidate.direction === "bullish" && candidate.state === "confirmed") && input.daily?.volume?.volumeDirection === "bullish";
  const bearishBreakdown = ema?.pricePosition === "below_all" && (ema.order === "bearish" || input.daily?.macd?.relation === "bearish");
  if (bearishBreakdown) return "breakdown";
  if (boll?.position === "above_upper" || (input.candlesticks ?? []).some((signal) => signal.state === "extended")) return "extended";
  if (bullishBreakout) return "breakout";
  if (ema?.order === "bullish" && input.daily?.volume?.isLowVolumePullback) return "pullback";
  if (items.some((candidate) => candidate.id === "daily.momentum.bottom_divergence" || (candidate.family === "candlestick" && candidate.direction === "bullish"))) return "base";
  return "range";
}

function ensureFamilyCoverage(items: EvidenceItem[], input: EvidenceBuilderInput): void {
  const present = new Set(items.map((candidate) => candidate.family));
  for (const family of SIGNAL_FAMILIES) {
    if (present.has(family)) continue;
    const insufficient = input.dataQuality.missingFamilies.includes(family);
    const provisional = !input.dataQuality.dailyBarComplete;
    items.push({
      id: `daily.${family}.${insufficient ? "insufficient" : "neutral"}`,
      family,
      timeframe: "daily",
      direction: "neutral",
      state: insufficient ? "insufficient" : "neutral",
      label: insufficient ? "Insufficient data" : "No active signal",
      description: insufficient ? `Insufficient samples for ${family}.` : `No active ${family} signal.`,
      provisional,
      reliability: reliability(provisional, !insufficient),
    });
  }
}

export function buildEvidenceSnapshot(input: EvidenceBuilderInput): EvidenceSnapshot {
  const items: EvidenceItem[] = [];
  addTechnicalFrame(items, input.daily, "daily", !input.dataQuality.dailyBarComplete);
  addTechnicalFrame(items, input.weekly, "weekly", !input.dataQuality.weeklyBarComplete);
  addPatternEvidence(items, input);
  addOtherEvidence(items, input);
  ensureFamilyCoverage(items, input);
  return {
    version: "2.0",
    symbol: input.symbol,
    price: input.price,
    dataQuality: input.dataQuality,
    items,
    levels: collectLevels(input),
    weeklyRegime: weeklyRegime(items),
    dailyPhase: dailyPhase(input, items),
  };
}
