import { EvidenceItem, EvidenceSnapshot, ScenarioStatus, TradeLevel } from "./evidence";

export interface ScoreDetail {
  baseTrendScore: number;
  momentumScore: number;
  volumeScore: number;
  patternsScore: number;
  weeklyResonanceScore: number;
  totalScore: number;
  scoreReasons: string[];
}

export interface EntryDimensions {
  priceLocation: number;
  payoffQuality: number;
  setupMaturity: number;
  timeframeContext: number;
  confirmationQuality: number;
}

export interface EntryAssessment {
  ruleScore: number;
  aiAdjustment: number;
  finalScore: number;
  hardCap: number;
  dimensions: EntryDimensions;
  pathScores: { left: number; right: number };
  leftStatus: ScenarioStatus;
  rightStatus: ScenarioStatus;
  activeSetup: "left" | "right" | "none";
  riskPlan: { stop?: number; target?: number; rewardRisk?: number; stopDistancePct?: number };
  reasons: string[];
}

interface LocationContext {
  support?: TradeLevel;
  resistance?: TradeLevel;
  breakoutReference?: TradeLevel;
  supportDistanceAtr?: number;
  resistanceDistanceAtr?: number;
  breakoutDistanceAtr?: number;
}

const STATUS_SCORE_CAP: Record<ScenarioStatus, number> = {
  not_formed: 2.2,
  watch: 3.2,
  provisional: 4.2,
  triggered: 5,
  too_late: 2.4,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function roundScore(value: number): number {
  return Number(clamp(value, 0, 5).toFixed(1));
}

function dailyItems(snapshot: EvidenceSnapshot): EvidenceItem[] {
  return snapshot.items.filter((item) => (
    item.timeframe === "daily" && item.state !== "insufficient" && item.state !== "holder_only"
  ));
}

function atrValue(snapshot: EvidenceSnapshot): number | undefined {
  const value = dailyItems(snapshot)
    .find((item) => item.family === "atr" && typeof item.values?.value === "number")
    ?.values?.value;
  return typeof value === "number" && value > 0 ? value : undefined;
}

function nearestLevel(snapshot: EvidenceSnapshot, kind: "support" | "resistance"): TradeLevel | undefined {
  const candidates = snapshot.levels.filter((level) => (
    level.kind === kind &&
    level.strength >= 0.45 &&
    (kind === "support" ? level.price < snapshot.price : level.price > snapshot.price)
  ));
  return candidates.sort((left, right) => (
    kind === "support" ? right.price - left.price : left.price - right.price
  ))[0];
}

function patternTriggerLevels(items: EvidenceItem[], price: number): TradeLevel[] {
  return items
    .filter((item) => (
      item.family === "classicalPattern" &&
      item.direction === "bullish" &&
      item.state === "confirmed"
    ))
    .map((item) => ({ item, price: item.values?.triggerPrice }))
    .filter((candidate): candidate is { item: EvidenceItem; price: number } => (
      typeof candidate.price === "number" && candidate.price > 0 && candidate.price < price
    ))
    .map(({ item, price: triggerPrice }) => ({
      price: triggerPrice,
      kind: "support" as const,
      source: "pattern" as const,
      strength: typeof item.values?.confidence === "number" ? item.values.confidence : 0.65,
    }));
}

function locationContext(snapshot: EvidenceSnapshot, items: EvidenceItem[], atr?: number): LocationContext {
  const support = nearestLevel(snapshot, "support");
  const resistance = nearestLevel(snapshot, "resistance");
  const historicalBreakoutLevels = snapshot.levels.filter((level) => (
    atr !== undefined &&
    level.price < snapshot.price &&
    level.source === "horizontal" &&
    level.strength >= 0.65 &&
    snapshot.price - level.price <= atr * 2
  ));
  const breakoutReference = [...patternTriggerLevels(items, snapshot.price), ...historicalBreakoutLevels]
    .sort((left, right) => right.price - left.price)[0];

  return {
    support,
    resistance,
    breakoutReference,
    supportDistanceAtr: support && atr ? (snapshot.price - support.price) / atr : undefined,
    resistanceDistanceAtr: resistance && atr ? (resistance.price - snapshot.price) / atr : undefined,
    breakoutDistanceAtr: breakoutReference && atr ? (snapshot.price - breakoutReference.price) / atr : undefined,
  };
}

function buildRiskPlan(snapshot: EvidenceSnapshot): EntryAssessment["riskPlan"] {
  const price = snapshot.price;
  const atr = atrValue(snapshot);
  const explicitStop = snapshot.levels
    .filter((level) => level.kind === "stop" && level.price < price)
    .sort((left, right) => right.price - left.price)[0];
  const support = nearestLevel(snapshot, "support");
  const stop = explicitStop?.price ?? (support && atr ? support.price - atr * 0.5 : undefined);
  const target = snapshot.levels
    .filter((level) => (
      (level.kind === "target" || level.kind === "resistance") &&
      level.price > price &&
      (atr === undefined || level.price - price >= atr * 0.5)
    ))
    .sort((left, right) => left.price - right.price)[0]?.price;
  const risk = stop !== undefined ? price - stop : undefined;
  const rewardRisk = risk && risk > 0 && target !== undefined ? (target - price) / risk : undefined;

  return {
    stop: stop !== undefined ? Number(stop.toFixed(2)) : undefined,
    target: target !== undefined ? Number(target.toFixed(2)) : undefined,
    rewardRisk: rewardRisk !== undefined ? Number(rewardRisk.toFixed(2)) : undefined,
    stopDistancePct: risk !== undefined ? Number(((risk / price) * 100).toFixed(2)) : undefined,
  };
}

function leftLocationScore(context: LocationContext, reasons: string[]): number {
  const distance = context.supportDistanceAtr;
  if (distance === undefined || !context.support) {
    reasons.push("No reliable support is available for a left-side entry.");
    return 0.1;
  }
  if (distance <= 1.25) {
    reasons.push(`Price is ${distance.toFixed(1)} ATR above typed ${context.support.source} support.`);
    return 1;
  }
  if (distance <= 1.5) return 0.8;
  if (distance <= 2) return 0.55;
  if (distance <= 3) return 0.25;
  return 0.1;
}

function rightLocationScore(context: LocationContext, reasons: string[]): number {
  if (context.breakoutDistanceAtr !== undefined && context.breakoutReference) {
    const distance = context.breakoutDistanceAtr;
    reasons.push(`Price is ${distance.toFixed(1)} ATR above typed ${context.breakoutReference.source} breakout support.`);
    if (distance <= 0.75) return 1;
    if (distance <= 1.5) return 0.7;
    if (distance <= 2) return 0.35;
    return 0.1;
  }
  const distance = context.resistanceDistanceAtr;
  if (distance === undefined) return 0.1;
  if (distance <= 0.5) return 0.75;
  if (distance <= 1) return 0.45;
  if (distance <= 2) return 0.2;
  return 0.1;
}

function payoffScore(riskPlan: EntryAssessment["riskPlan"], reasons: string[]): number {
  const ratio = riskPlan.rewardRisk;
  if (ratio === undefined) {
    reasons.push("A complete stop/target payoff plan is unavailable.");
    return 0;
  }
  reasons.push(`Planned reward/risk is ${ratio.toFixed(2)}:1.`);
  return ratio >= 3 ? 1.25 : ratio >= 2 ? 1.05 : ratio >= 1.5 ? 0.8 : ratio >= 1 ? 0.4 : 0.1;
}

function isFreshBullishMomentum(item: EvidenceItem): boolean {
  return ["macd", "kdj", "rsi", "ichimoku"].includes(item.family) &&
    item.direction === "bullish" &&
    (item.state.includes("cross") || item.state.startsWith("up_")) &&
    typeof item.barsSince === "number" && item.barsSince <= 2;
}

function isBullishCandleAtSupport(item: EvidenceItem): boolean {
  return item.family === "candlestick" &&
    item.direction === "bullish" &&
    item.state === "triggered" &&
    item.values?.location === "support" &&
    (item.barsSince ?? 0) <= 1;
}

function tdStage(items: EvidenceItem[], setup: "buy" | "sell"): { stage: number; weight: number; completed: boolean } | undefined {
  const signal = items.find((item) => (
    item.family === "tdSequential" && item.values?.setup === setup && item.state !== "neutral"
  ));
  const stage = typeof signal?.values?.stage === "number" ? signal.values.stage : undefined;
  if (!signal || stage === undefined || stage < 6) return undefined;
  const baseWeight = stage >= 9 ? 0.18 : stage === 8 ? 0.1 : stage === 7 ? 0.06 : 0.03;
  return {
    stage,
    weight: baseWeight * (signal.provisional ? 0.5 : 1),
    completed: signal.values?.completed === true,
  };
}

function hasRsiOversold(items: EvidenceItem[]): boolean {
  return items.some((item) => item.family === "rsi" && (
    item.state === "oversold" || (typeof item.values?.value === "number" && item.values.value <= 30)
  ));
}

function hasKdjLow(items: EvidenceItem[]): boolean {
  return items.some((item) => item.family === "kdj" && (
    item.state === "low" || item.values?.zone === "low"
  ));
}

function leftSetupScore(snapshot: EvidenceSnapshot, items: EvidenceItem[], reasons: string[]): number {
  const phaseBase: Record<EvidenceSnapshot["dailyPhase"], number> = {
    base: 0.35,
    pullback: 0.35,
    range: 0.08,
    breakout: 0.05,
    extended: 0,
    breakdown: 0,
  };
  let score = phaseBase[snapshot.dailyPhase];
  const buyTd = tdStage(items, "buy");
  const bottomDivergence = items.some((item) => item.id === "daily.momentum.bottom_divergence");
  const exhaustionCluster = Math.max(
    buyTd?.weight ?? 0,
    bottomDivergence ? 0.32 : 0,
    hasRsiOversold(items) ? 0.16 : 0,
    hasKdjLow(items) ? 0.14 : 0
  );
  score += exhaustionCluster;

  if (buyTd) reasons.push(`TD Buy Setup is at stage ${buyTd.stage}${buyTd.completed ? " (completed)" : ""}; its capped exhaustion weight is ${buyTd.weight.toFixed(2)}.`);
  if (items.some((item) => item.family === "classicalPattern" && item.direction === "bullish" && ["near_trigger", "confirmed"].includes(item.state))) score += 0.25;
  if (items.some((item) => item.family === "chanlun" && item.state === "forming_bottom")) score += 0.15;

  if (items.some((item) => item.family === "classicalPattern" && item.direction === "bearish" && item.state === "confirmed")) {
    score -= 0.35;
    reasons.push("A confirmed bearish structure reduces left-side setup maturity.");
  }
  return clamp(score, 0, 1.25);
}

function rightSetupScore(snapshot: EvidenceSnapshot, items: EvidenceItem[], context: LocationContext, reasons: string[]): number {
  const phaseBase: Record<EvidenceSnapshot["dailyPhase"], number> = {
    breakout: 0.45,
    range: 0.12,
    pullback: 0.08,
    base: 0.05,
    extended: 0,
    breakdown: 0,
  };
  let score = phaseBase[snapshot.dailyPhase];
  const confirmedPattern = items.some((item) => item.family === "classicalPattern" && item.direction === "bullish" && item.state === "confirmed");
  const nearPattern = items.some((item) => item.family === "classicalPattern" && item.direction === "bullish" && item.state === "near_trigger");
  const volumeBreakout = items.some((item) => item.family === "volume" && item.values?.hasVolumeBreakout === true && item.direction === "bullish");
  if ((context.resistanceDistanceAtr ?? Infinity) <= 0.5) score += 0.2;
  if (confirmedPattern) score += 0.35;
  else if (nearPattern) score += 0.2;
  if (volumeBreakout) score += 0.3;
  if (items.some((item) => item.family === "chanlun" && item.state === "forming_top")) score -= 0.15;

  const sellTd = tdStage(items, "sell");
  if (sellTd) {
    score -= sellTd.weight;
    reasons.push(`TD Sell Setup is at stage ${sellTd.stage}${sellTd.completed ? " (completed)" : ""}; right-side chase quality is reduced by ${sellTd.weight.toFixed(2)}.`);
  }
  if (items.some((item) => item.family === "classicalPattern" && item.direction === "bearish" && item.state === "confirmed")) score -= 0.4;
  return clamp(score, 0, 1.25);
}

function timeframeScore(snapshot: EvidenceSnapshot, reasons: string[]): number {
  if (snapshot.dataQuality.weeklySamples < 35) {
    reasons.push("Weekly context is unavailable and receives no bonus.");
    return 0;
  }
  const completionWeight = snapshot.dataQuality.weeklyBarComplete ? 1 : 0.6;
  if (!snapshot.dataQuality.weeklyBarComplete) reasons.push("The current weekly context is provisional and receives reduced weight.");
  if (snapshot.weeklyRegime === "bullish") return 0.75 * completionWeight;
  if (snapshot.weeklyRegime === "neutral") return 0.35 * completionWeight;
  reasons.push("Weekly regime is bearish and suppresses new-entry confidence.");
  return 0;
}

function leftConfirmationScore(items: EvidenceItem[], reasons: string[]): number {
  const freshFamilies = new Set(items.filter(isFreshBullishMomentum).map((item) => item.family));
  let score = Math.min(0.3, freshFamilies.size * 0.15);
  if (items.some(isBullishCandleAtSupport)) score += 0.2;
  if (items.some((item) => item.family === "volume" && item.direction === "bearish")) {
    score -= 0.3;
    reasons.push("Bearish volume expansion weakens left-side confirmation.");
  }
  return clamp(score, 0, 0.75);
}

function rightConfirmationScore(items: EvidenceItem[], reasons: string[]): number {
  const bullishVolume = items.some((item) => item.family === "volume" && item.direction === "bullish");
  const heldRetest = items.some((item) => item.family === "volume" && item.values?.isLowVolumePullback === true);
  const bullishCmf = items.some((item) => item.family === "cmf" && item.direction === "bullish");
  const bullishObv = items.some((item) => item.family === "obv" && item.direction === "bullish");
  const priceVolumeDivergence = items.some((item) => item.family === "volume" && item.values?.hasPriceVolumeDivergence === true);
  let flowCluster = bullishVolume ? 0.3 : bullishCmf ? 0.2 : bullishObv ? 0.15 : 0;
  if (heldRetest) flowCluster = Math.max(flowCluster, 0.25);
  let score = flowCluster + (items.some(isFreshBullishMomentum) ? 0.15 : 0);

  if (priceVolumeDivergence) {
    score -= 0.2;
    reasons.push("Price/OBV divergence reduces right-side confirmation quality.");
  }

  if (items.some((item) => item.family === "volume" && item.direction === "bearish")) {
    score -= 0.35;
    reasons.push("Bearish volume expansion directly weakens right-side confirmation.");
  }
  return clamp(score, 0, 0.75);
}

function executablePayoff(riskPlan: EntryAssessment["riskPlan"]): boolean {
  return riskPlan.stop !== undefined && riskPlan.target !== undefined && (riskPlan.rewardRisk ?? 0) >= 1.2;
}

function scenarioStatuses(
  snapshot: EvidenceSnapshot,
  items: EvidenceItem[],
  context: LocationContext,
  riskPlan: EntryAssessment["riskPlan"]
): Pick<EntryAssessment, "leftStatus" | "rightStatus"> {
  const freshMomentum = items.some(isFreshBullishMomentum);
  const supportCandle = items.some(isBullishCandleAtSupport);
  const bottomDivergence = items.some((item) => item.id === "daily.momentum.bottom_divergence");
  const chanlunBottom = items.some((item) => item.family === "chanlun" && item.state === "forming_bottom");
  const lowVolumePullback = items.some((item) => item.family === "volume" && item.values?.isLowVolumePullback === true);
  const bullishPattern = items.some((item) => item.family === "classicalPattern" && item.direction === "bullish" && ["near_trigger", "confirmed"].includes(item.state));
  const confirmedBullishPattern = items.some((item) => item.family === "classicalPattern" && item.direction === "bullish" && item.state === "confirmed");
  const confirmedBearishPattern = items.some((item) => item.family === "classicalPattern" && item.direction === "bearish" && item.state === "confirmed");
  const buyTd = tdStage(items, "buy");

  const leftSetupPresent = Boolean(buyTd) || hasRsiOversold(items) || hasKdjLow(items) || bottomDivergence || chanlunBottom || lowVolumePullback || supportCandle || bullishPattern;
  const leftNearSupport = (context.supportDistanceAtr ?? Infinity) <= 2;
  const leftConfirmation = freshMomentum || supportCandle;
  const leftTrigger = leftSetupPresent &&
    (context.supportDistanceAtr ?? Infinity) <= 1.5 &&
    leftConfirmation &&
    snapshot.weeklyRegime !== "bearish" &&
    !["breakdown", "extended"].includes(snapshot.dailyPhase) &&
    executablePayoff(riskPlan);
  const leftOpportunityWasPresent = buyTd?.completed === true || bottomDivergence || supportCandle || confirmedBullishPattern;
  const leftExpired = leftOpportunityWasPresent && (
    ((context.supportDistanceAtr ?? 0) > 1.5 && (freshMomentum || snapshot.dailyPhase === "extended")) ||
    (riskPlan.rewardRisk !== undefined && riskPlan.rewardRisk < 1.2)
  );
  const leftStatus: ScenarioStatus = leftTrigger
    ? snapshot.dataQuality.dailyBarComplete ? "triggered" : "provisional"
    : leftExpired
      ? "too_late"
      : leftSetupPresent && leftNearSupport
        ? "watch"
        : "not_formed";

  const volumeBreakout = items.some((item) => item.family === "volume" && item.values?.hasVolumeBreakout === true && item.direction === "bullish");
  const bullishVolume = items.some((item) => item.family === "volume" && item.direction === "bullish");
  const positiveFlow = items.some((item) => ["cmf", "obv"].includes(item.family) && item.direction === "bullish");
  const heldRetest = lowVolumePullback && (context.breakoutDistanceAtr ?? Infinity) <= 0.75;
  const rightConfirmation = confirmedBullishPattern || volumeBreakout || (bullishVolume && positiveFlow) || heldRetest;
  const rightTrigger = context.breakoutReference !== undefined &&
    (context.breakoutDistanceAtr ?? Infinity) >= 0 &&
    (context.breakoutDistanceAtr ?? Infinity) <= 1.5 &&
    rightConfirmation &&
    !confirmedBearishPattern &&
    executablePayoff(riskPlan);
  const nearResistance = (context.resistanceDistanceAtr ?? Infinity) <= 0.5;
  const nearPattern = items.some((item) => item.family === "classicalPattern" && item.direction === "bullish" && item.state === "near_trigger");
  const rightSetupPresent = context.breakoutReference !== undefined && (confirmedBullishPattern || volumeBreakout || snapshot.dailyPhase === "breakout");
  const rightExpired = rightSetupPresent && (
    (context.breakoutDistanceAtr ?? 0) > 1.5 ||
    (riskPlan.rewardRisk !== undefined && riskPlan.rewardRisk < 1.2)
  );
  const rightStatus: ScenarioStatus = rightTrigger
    ? snapshot.dataQuality.dailyBarComplete ? "triggered" : "provisional"
    : rightExpired
      ? "too_late"
      : nearResistance || nearPattern || volumeBreakout
        ? "watch"
        : "not_formed";

  return { leftStatus, rightStatus };
}

function sharedHardCap(snapshot: EvidenceSnapshot, riskPlan: EntryAssessment["riskPlan"], reasons: string[]): number {
  let hardCap = Math.min(5, snapshot.dataQuality.scoreCap);
  if (riskPlan.stop === undefined) {
    hardCap = Math.min(hardCap, 2.5);
    reasons.push("No executable stop: score capped at 2.5.");
  }
  if (riskPlan.target === undefined) {
    hardCap = Math.min(hardCap, 2.8);
    reasons.push("No executable target: score capped at 2.8.");
  }
  if (riskPlan.rewardRisk !== undefined && riskPlan.rewardRisk < 1) {
    hardCap = Math.min(hardCap, 2.4);
    reasons.push("Reward/risk below 1.0: score capped at 2.4.");
  } else if (riskPlan.rewardRisk !== undefined && riskPlan.rewardRisk < 1.5) {
    hardCap = Math.min(hardCap, 3.2);
    reasons.push("Reward/risk below 1.5: score capped at 3.2.");
  }
  if (snapshot.dailyPhase === "extended") {
    hardCap = Math.min(hardCap, 2.8);
    reasons.push("Composite extension evidence caps new-entry quality at 2.8.");
  }
  if (snapshot.dailyPhase === "breakdown") hardCap = Math.min(hardCap, 2.9);
  return hardCap;
}

function pathScore(dimensions: EntryDimensions, status: ScenarioStatus, hardCap: number): number {
  const raw = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
  return roundScore(Math.min(raw, hardCap, STATUS_SCORE_CAP[status]));
}

export function calculateEntryAssessment(snapshot: EvidenceSnapshot): EntryAssessment {
  const reasons: string[] = [];
  const items = dailyItems(snapshot);
  const atr = atrValue(snapshot);
  const context = locationContext(snapshot, items, atr);
  const riskPlan = buildRiskPlan(snapshot);
  const payoffQuality = payoffScore(riskPlan, reasons);
  const timeframeContext = timeframeScore(snapshot, reasons);
  const leftDimensions: EntryDimensions = {
    priceLocation: leftLocationScore(context, reasons),
    payoffQuality,
    setupMaturity: leftSetupScore(snapshot, items, reasons),
    timeframeContext,
    confirmationQuality: leftConfirmationScore(items, reasons),
  };
  const rightDimensions: EntryDimensions = {
    priceLocation: rightLocationScore(context, reasons),
    payoffQuality,
    setupMaturity: rightSetupScore(snapshot, items, context, reasons),
    timeframeContext,
    confirmationQuality: rightConfirmationScore(items, reasons),
  };
  const statuses = scenarioStatuses(snapshot, items, context, riskPlan);
  const globalHardCap = sharedHardCap(snapshot, riskPlan, reasons);
  const pathScores = {
    left: pathScore(leftDimensions, statuses.leftStatus, globalHardCap),
    right: pathScore(rightDimensions, statuses.rightStatus, globalHardCap),
  };
  const activeSetup = ["triggered", "provisional"].includes(statuses.leftStatus) && pathScores.left >= pathScores.right
    ? "left"
    : ["triggered", "provisional"].includes(statuses.rightStatus)
      ? "right"
      : "none";
  const bestPath = pathScores.right > pathScores.left ? "right" : "left";
  const bestStatus = bestPath === "left" ? statuses.leftStatus : statuses.rightStatus;
  const ruleScore = pathScores[bestPath];
  const hardCap = Math.min(globalHardCap, STATUS_SCORE_CAP[bestStatus]);

  return {
    ruleScore,
    aiAdjustment: 0,
    finalScore: ruleScore,
    hardCap: Number(hardCap.toFixed(1)),
    dimensions: bestPath === "left" ? leftDimensions : rightDimensions,
    pathScores,
    ...statuses,
    activeSetup,
    riskPlan,
    reasons,
  };
}

export function toLegacyScoreDetail(assessment: EntryAssessment): ScoreDetail {
  return {
    baseTrendScore: assessment.dimensions.priceLocation + assessment.dimensions.payoffQuality,
    momentumScore: assessment.dimensions.setupMaturity,
    volumeScore: assessment.dimensions.confirmationQuality,
    patternsScore: 0,
    weeklyResonanceScore: assessment.dimensions.timeframeContext,
    totalScore: assessment.finalScore,
    scoreReasons: assessment.reasons,
  };
}
