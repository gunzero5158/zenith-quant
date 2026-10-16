import type { EvidenceItem, EvidenceSnapshot, ScenarioStatus, TradeLevel } from "./evidence";
import type { Candle } from "./indicators";

export const DECISION_VERSION = "opportunities-2";
export const MIN_ENTRY_REWARD_RISK = 1.2;
export type OpportunityKind = "rebound" | "pullback" | "breakout";
export type OpportunityStatus = ScenarioStatus | "invalidated";
export type ForecastHorizon = 3 | 5 | 10 | 20;

export interface PriceEvent {
  level: number;
  knownAt: string;
  observedAt: string;
  source: TradeLevel["source"];
  provisional: boolean;
}

/** Events compare the new bar with levels calculated WITHOUT that bar. */
export interface PriceActionFacts {
  knownAt: string;
  observedAt: string;
  previousClose: number;
  previousHigh: number;
  localTriggerHigh: number;
  recentLow: number;
  recentHigh: number;
  reversalLow: number;
  latestLow: number;
  latestHigh: number;
  localHighBreak: boolean;
  higherLow: boolean;
  supportHeld?: PriceEvent;
  supportReclaimed?: PriceEvent;
  supportBroken?: PriceEvent;
  resistanceBroken?: PriceEvent;
  provisional: boolean;
}

export interface CandidateTradePlan {
  id: string;
  kind: OpportunityKind;
  side: "left" | "right";
  horizon: ForecastHorizon;
  generatedAt: string;
  anchorKnownAt: string;
  entry: number;
  trigger?: number;
  priceConfirmed: boolean;
  confirmedAt?: string;
  confirmationAgeBars?: number;
  stop?: number;
  stopSource?: TradeLevel["source"];
  stopBasis?: "structure" | "volatility";
  target?: number;
  targetSource?: TradeLevel["source"];
  rewardRisk?: number;
  stopDistancePct?: number;
  stopTrigger: "close" | "intraday";
  minimumStopDistance: number;
  maxEntry: number;
  expiresAfterBars: number;
  evidenceIds: string[];
}

export interface OpportunityAssessment {
  kind: OpportunityKind;
  status: OpportunityStatus;
  horizon: ForecastHorizon;
  score: number;
  plan: CandidateTradePlan;
  reasons: string[];
}

export interface ForecastEvent {
  horizon: ForecastHorizon;
  referencePrice: number;
  bandPct: number;
  upperPrice: number;
  lowerPrice: number;
  definition: "close_return_band";
}

const dateKey = (date: Date | string) => date instanceof Date ? date.toISOString().slice(0, 10) : date.slice(0, 10);
const finitePositive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
export const pricePrecision = (price: number) => price < 10 ? 4 : 2;
export const roundPrice = (price: number) => Number(price.toFixed(pricePrecision(price)));

export function dailyAtr(snapshot: EvidenceSnapshot): number | undefined {
  const value = snapshot.items.find(item => item.timeframe === "daily" && item.family === "atr")?.values?.value;
  return finitePositive(value) ? value : undefined;
}

export function forecastEvent(snapshot: EvidenceSnapshot, horizon: ForecastHorizon): ForecastEvent {
  const atr = dailyAtr(snapshot);
  const bandPct = atr ? (atr / snapshot.price) * 150 : 3;
  return {
    horizon, referencePrice: snapshot.price, bandPct,
    upperPrice: snapshot.price * (1 + bandPct / 100),
    lowerPrice: snapshot.price * (1 - bandPct / 100),
    definition: "close_return_band",
  };
}

export function buildPriceActionFacts(
  candles: Candle[], priorLevels: TradeLevel[], atr: number | undefined, dailyBarComplete: boolean,
): PriceActionFacts | undefined {
  if (candles.length < 4) return undefined;
  const latest = candles.at(-1)!;
  const previous = candles.at(-2)!;
  const prior = candles.slice(-21, -1);
  const recentLow = Math.min(...prior.map(bar => bar.low));
  const recentHigh = Math.max(...prior.map(bar => bar.high));
  const localTriggerHigh = Math.max(...candles.slice(-4, -1).map(bar => bar.high));
  const tolerance = finitePositive(atr) ? atr * 0.15 : latest.close * 0.003;
  const knownAt = dateKey(previous.date);
  const observedAt = dateKey(latest.date);
  const provisional = !dailyBarComplete;
  const supportLevels: TradeLevel[] = [
    ...priorLevels.filter(level => level.kind === "support" && level.strength >= 0.65 && ["horizontal", "vpvr"].includes(level.source)),
    { price: recentLow, kind: "support", source: "price_action", strength: 0.65 } satisfies TradeLevel,
  ].filter(level => finitePositive(level.price));
  const resistanceLevels: TradeLevel[] = [
    ...priorLevels.filter(level => level.kind === "resistance" && level.strength >= 0.65 && ["horizontal", "vpvr"].includes(level.source)),
    { price: recentHigh, kind: "resistance", source: "price_action", strength: 0.65 } satisfies TradeLevel,
  ].filter(level => finitePositive(level.price));
  const testLevels = [...supportLevels, ...priorLevels.filter(level => level.kind === "support"
    && ["ema", "boll"].includes(level.source) && level.strength >= 0.45)];
  const event = (level: TradeLevel | undefined): PriceEvent | undefined => level ? {
    level: level.price, source: level.source, knownAt, observedAt, provisional,
  } : undefined;
  const closest = (levels: TradeLevel[]) => levels.sort((a, b) => Math.abs(a.price - latest.close) - Math.abs(b.price - latest.close))[0];
  return {
    knownAt, observedAt, previousClose: previous.close, previousHigh: previous.high, localTriggerHigh,
    recentLow, recentHigh, reversalLow: Math.min(...candles.slice(-3).map(bar => bar.low)),
    latestLow: latest.low, latestHigh: latest.high, provisional,
    localHighBreak: latest.close > localTriggerHigh + tolerance,
    higherLow: latest.low > previous.low && latest.close > previous.high,
    supportHeld: event(closest(testLevels.filter(level => previous.close >= level.price
      && latest.low >= level.price - tolerance && latest.low <= level.price + tolerance
      && latest.close > level.price + tolerance && latest.close > latest.open))),
    supportReclaimed: event(closest(supportLevels.filter(level => latest.low < level.price - tolerance
      && latest.close > level.price + tolerance && latest.close > latest.open))),
    supportBroken: event(closest(supportLevels.filter(level => previous.close >= level.price
      && latest.close < level.price - tolerance))),
    resistanceBroken: event(closest(resistanceLevels.filter(level => previous.close <= level.price
      && latest.close > level.price + tolerance))),
  };
}

export function priceActionEvidence(facts: PriceActionFacts): EvidenceItem[] {
  const events: Array<[string, PriceEvent | undefined, EvidenceItem["direction"]]> = [
    ["support_held", facts.supportHeld, "bullish"],
    ["support_reclaimed", facts.supportReclaimed, "bullish"],
    ["support_broken", facts.supportBroken, "bearish"],
    ["resistance_broken", facts.resistanceBroken, "bullish"],
    ["local_high_break", facts.localHighBreak ? { level: facts.localTriggerHigh, source: "price_action", ...facts } : undefined, "bullish"],
  ];
  return events.flatMap(([state, event, direction]) => event ? [{
    id: `daily.horizontal.${state}`, family: "horizontal" as const, timeframe: "daily" as const,
    label: `daily.horizontal.${state}`, state, direction, provisional: facts.provisional,
    reliability: facts.provisional ? 0.65 : 0.9, barsSince: 0,
    description: `${state} at ${event.level}; anchor known on ${event.knownAt}, observed on ${event.observedAt}.`,
    values: { level: event.level, knownAt: event.knownAt, observedAt: event.observedAt, source: event.source },
  }] : []);
}

export function improvementEvidence(snapshot: EvidenceSnapshot): EvidenceItem[] {
  return snapshot.items.filter(item => item.timeframe === "daily" && item.reliability > 0 && (
    (item.family === "macd" && ((Number(item.values?.histogram) < 0 && item.values?.histogramTrend === "contracting")
      || (item.state === "golden_cross" && (item.barsSince ?? Infinity) <= 2)))
    || (item.family === "rsi" && item.values?.slope === "rising")
    || (item.family === "kdj" && item.state === "golden_cross" && (item.barsSince ?? Infinity) <= 2)
    || (["cmf", "obv"].includes(item.family) && item.values?.trend === "rising")
    || (item.family === "volume" && item.direction === "bullish" && Number(item.values?.relativeVolume) >= 1)
  ));
}

export function hasReboundContext(snapshot: EvidenceSnapshot): boolean {
  const daily = snapshot.items.filter(item => item.timeframe === "daily" && item.reliability > 0);
  return daily.some(item => (item.family === "rsi" && Number(item.values?.value) <= 35)
    || (item.family === "kdj" && (item.values?.zone === "low" || item.values?.jState === "oversold"))
    || (item.family === "tdSequential" && item.values?.setup === "buy" && Number(item.values?.stage) >= 6)
    || item.id === "daily.momentum.bottom_divergence"
    || (item.family === "chanlun" && item.state === "forming_bottom"))
    || (daily.some(item => item.family === "ema" && item.values?.pricePosition === "below_all")
      && Boolean(snapshot.priceAction?.supportReclaimed || snapshot.priceAction?.localHighBreak));
}

/** Candidate numbers are computed locally; model decisions may choose none. */
export function buildTradePlans(snapshot: EvidenceSnapshot, candles: Candle[] = []): CandidateTradePlan[] {
  const atr = dailyAtr(snapshot);
  const facts = snapshot.priceAction;
  const daily = snapshot.items.filter(item => item.timeframe === "daily" && item.reliability > 0);
  const supportCandle = daily.find(item => item.family === "candlestick" && item.direction === "bullish"
    && item.state === "triggered" && item.values?.location === "support" && (item.barsSince ?? 0) <= 1);
  const confirmedPattern = daily.find(item => item.family === "classicalPattern" && item.direction === "bullish" && item.state === "confirmed");
  const confirmedVpvr = daily.find(item => item.family === "vpvr" && item.values?.breakoutVolumeConfirmed === true
    && Number(item.values?.barsSinceValueAreaBreakout) >= 0 && Number(item.values?.barsSinceValueAreaBreakout) <= 2);
  const breakoutLevel = facts?.resistanceBroken?.level
    ?? (finitePositive(confirmedPattern?.values?.triggerPrice) ? confirmedPattern.values.triggerPrice : undefined)
    ?? (finitePositive(confirmedVpvr?.values?.valueAreaHigh) ? confirmedVpvr.values.valueAreaHigh : undefined);
  const supports = snapshot.levels.filter(level => level.kind === "support" && level.strength >= 0.45 && level.price < snapshot.price)
    .sort((a, b) => b.price - a.price);
  const targets = snapshot.levels.filter(level => ["resistance", "target"].includes(level.kind)
    && level.strength >= 0.45 && level.price > snapshot.price).sort((a, b) => a.price - b.price);
  const target = targets[0]; // Never skip an inconvenient nearby obstacle to inflate R/R.
  const anchor = facts?.supportReclaimed ?? facts?.supportHeld;
  const reversalConfirmed = Boolean(anchor || facts?.localHighBreak || facts?.higherLow || supportCandle);
  const noiseFloor = atr ? atr * 0.5 : snapshot.price * 0.005;
  const buffer = atr ? atr * 0.25 : snapshot.price * 0.0025;
  const generatedAt = snapshot.dataQuality.asOf;
  return (["rebound", "pullback", "breakout"] as const).map(kind => {
    const isBreakout = kind === "breakout";
    const support = isBreakout && breakoutLevel ? { price: breakoutLevel, source: "price_action" as const } : supports[0];
    const structureLow = kind === "rebound" && reversalConfirmed && facts
      ? (anchor ? facts.latestLow : facts.reversalLow) : undefined;
    // A pattern invalidation belongs only to the breakout using that pattern's
    // trigger. It must not override a fresh rebound low or pullback support.
    const usesPattern = isBreakout && !facts?.resistanceBroken && confirmedPattern !== undefined
      && finitePositive(confirmedPattern.values?.triggerPrice)
      && breakoutLevel === confirmedPattern.values.triggerPrice;
    const patternStop = usesPattern ? confirmedPattern.values?.invalidationPrice : undefined;
    const explicitStop = finitePositive(patternStop) && patternStop < snapshot.price
      && snapshot.price - patternStop >= noiseFloor
      ? { price: patternStop, source: "pattern" as const } : undefined;
    let stop: number | undefined = structureLow !== undefined ? structureLow - buffer
      : explicitStop?.price ?? (support ? support.price - buffer : undefined);
    let stopSource: TradeLevel["source"] | undefined = structureLow !== undefined ? "price_action" : explicitStop?.source ?? support?.source;
    let stopBasis: CandidateTradePlan["stopBasis"] = "structure";
    if (stop !== undefined && snapshot.price - stop < noiseFloor) stop = snapshot.price - noiseFloor;
    if ((!finitePositive(stop) || stop >= snapshot.price) && atr) {
      stop = snapshot.price - atr * 1.5;
      stopSource = "atr";
      stopBasis = "volatility";
    }
    if (!finitePositive(stop) || stop >= snapshot.price) { stop = undefined; stopSource = undefined; }
    if (stop !== undefined) stop = roundPrice(stop);
    const targetPrice = target ? roundPrice(target.price) : undefined;
    const risk = stop !== undefined ? snapshot.price - stop : undefined;
    const trigger = isBreakout ? breakoutLevel ?? targets.find(level => level.kind === "resistance")?.price
      : anchor?.level ?? (facts?.higherLow ? facts.previousHigh : facts?.localTriggerHigh);
    const priceConfirmed = isBreakout ? Boolean(breakoutLevel && snapshot.price > breakoutLevel) : reversalConfirmed;
    const evaluationEntry = !priceConfirmed && finitePositive(trigger) ? Math.max(snapshot.price, trigger) : snapshot.price;
    const evaluationRisk = stop !== undefined ? evaluationEntry - stop : undefined;
    const confirmationAgeBars = !priceConfirmed ? undefined : isBreakout
      ? facts?.resistanceBroken ? 0
        : confirmedPattern && finitePositive(confirmedPattern.values?.triggerPrice) ? confirmedPattern.barsSince
          : confirmedVpvr ? Number(confirmedVpvr.values?.barsSinceValueAreaBreakout) : undefined
      : anchor || facts?.localHighBreak || facts?.higherLow ? 0 : supportCandle?.barsSince;
    const confirmedBar = confirmationAgeBars !== undefined && Number.isInteger(confirmationAgeBars)
      && confirmationAgeBars >= 0 ? candles.at(-1 - confirmationAgeBars) : undefined;
    const confirmedAt = confirmedBar ? dateKey(confirmedBar.date)
      : confirmationAgeBars === 0 ? facts?.observedAt ?? snapshot.dataQuality.latestDailyDate : undefined;
    const horizon: ForecastHorizon = kind === "rebound" ? 5 : 10;
    const maxEntry = stop !== undefined && targetPrice !== undefined
      ? (targetPrice + MIN_ENTRY_REWARD_RISK * stop) / (1 + MIN_ENTRY_REWARD_RISK) : snapshot.price;
    return {
      id: `${kind}:${facts?.knownAt ?? snapshot.dataQuality.latestDailyDate ?? generatedAt}:${trigger ?? "none"}`,
      kind, side: isBreakout ? "right" : "left", horizon, generatedAt,
      anchorKnownAt: facts?.knownAt ?? snapshot.dataQuality.latestDailyDate ?? generatedAt,
      entry: snapshot.price, trigger, priceConfirmed,
      confirmedAt, confirmationAgeBars,
      stop, stopSource, stopBasis,
      target: targetPrice, targetSource: target?.source,
      rewardRisk: evaluationRisk && targetPrice ? (targetPrice - evaluationEntry) / evaluationRisk : undefined,
      stopDistancePct: risk ? risk / snapshot.price * 100 : undefined,
      stopTrigger: kind === "rebound" ? "intraday" : "close",
      minimumStopDistance: noiseFloor, maxEntry, expiresAfterBars: horizon,
      evidenceIds: [...new Set([
        ...daily.filter(item => item.family === "horizontal" && item.barsSince === 0).map(item => item.id),
        ...(supportCandle ? [supportCandle.id] : []),
        ...(usesPattern ? [confirmedPattern.id] : []),
        ...(confirmedVpvr && isBreakout ? [confirmedVpvr.id] : []),
      ])],
    };
  });
}

export function planIsExecutable(plan: CandidateTradePlan | undefined, price = plan?.entry): boolean {
  if (!plan || !finitePositive(price) || !finitePositive(plan.stop) || !finitePositive(plan.target)) return false;
  // An unconfirmed plan must remain viable at its required confirmation price,
  // not just at the cheaper price observed before confirmation.
  const entry = !plan.priceConfirmed && finitePositive(plan.trigger) ? Math.max(price, plan.trigger) : price;
  const risk = entry - plan.stop;
  return risk >= plan.minimumStopDistance * 0.99 && plan.target > entry
    && (plan.target - entry) / risk >= MIN_ENTRY_REWARD_RISK;
}

export function currentTrend(snapshot: EvidenceSnapshot): { daily: "bullish" | "bearish" | "neutral"; weekly: "bullish" | "bearish" | "neutral" } {
  const ema = snapshot.items.find(item => item.timeframe === "daily" && item.family === "ema");
  const daily = ema?.values?.order === "bullish" || ema?.state === "bullish" ? "bullish"
    : ema?.values?.order === "bearish" || ema?.state === "bearish" ? "bearish" : "neutral";
  return { daily, weekly: snapshot.weeklyRegime };
}
