import type { Candle } from "./indicators";
import type { EvidenceSnapshot, ScenarioStatus, TradeLevel } from "./evidence";
import type { AiMarketOutlook, AiStrategyAdvice } from "./aiAnalysisResult";

// Jev (TypeSafe System One) answers typed questions with calibrated
// probabilities instead of prose. It is weak at arithmetic and degrades with
// irrelevant context, so the state below carries named categories computed in
// code, and every price is offered as an enumerated candidate, never generated.

export type JevSetupStatus = Exclude<ScenarioStatus, "provisional">;
type HolderAction = AiStrategyAdvice["holder"]["action"];
type LeftEntryAction = AiStrategyAdvice["leftEntry"]["action"];
type RightAddAction = AiStrategyAdvice["rightAdd"]["action"];
type StopTrigger = AiStrategyAdvice["exitStop"]["trigger"];

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } };

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface JevScoreAnswer {
  type: "score";
  score: number;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface JevNoulAnswer {
  type: "noul";
  noul: number;
}

export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer;

export interface JevLevelCandidate {
  key: string;
  price: number;
  description: string;
}

export interface JevDecisionRequest {
  price: number;
  state: Record<string, unknown>;
  primaryQuestions: Record<string, JevQuestion>;
  stopCandidates: JevLevelCandidate[];
  targetCandidates: JevLevelCandidate[];
}

export type JevSetupStage =
  | "none"
  | "breakdown"
  | "left_watch"
  | "left_triggered"
  | "range_watch"
  | "rebound_underway"
  | "right_watch"
  | "right_triggered"
  | "extended";

export interface JevPrimaryDecision {
  outlook: AiMarketOutlook;
  outlookProbabilities: Record<AiMarketOutlook, number>;
  confidence: number;
  setupStage: JevSetupStage;
  stageConfidence: number;
  conflictProbability: number;
  adjustments: string[];
}

export interface JevDecision {
  outlook: AiMarketOutlook;
  outlookProbabilities: Record<AiMarketOutlook, number>;
  finalScore: number;
  confidence: number;
  scoreConfidence: number;
  conflictProbability: number;
  setupStage: JevSetupStage;
  stageConfidence: number;
  leftStatus: JevSetupStatus;
  rightStatus: JevSetupStatus;
  activeSetup: "left" | "right" | "none";
  holderAction: HolderAction;
  leftEntryAction: LeftEntryAction;
  rightAddAction: RightAddAction;
  stopTrigger: StopTrigger;
  stop?: number;
  target?: number;
  /** Consistency corrections applied in code because parallel Jev answers are independent. */
  adjustments: string[];
}

const MAX_LEVEL_CANDIDATES = 8;
const NO_LEVEL = "none";
const MIN_EXECUTABLE_REWARD_RISK = 1.2;

interface SetupStageDefinition {
  description: string;
  left: JevSetupStatus;
  right: JevSetupStatus;
  leftAction: LeftEntryAction;
  rightAction: RightAddAction;
  /** The stage to fall back to when an executable entry is not backed by the other decisions. */
  withoutEntry?: JevSetupStage;
}

// Left and right status are one judgment, not two: a trade develops from the
// left-side chance to the right-side chance, so each stage fixes a coherent pair.
const SETUP_STAGES: Record<JevSetupStage, SetupStageDefinition> = {
  none: {
    description: "No setup: price is not near meaningful support, shows no reversal signals, and is not near a breakout.",
    left: "not_formed", right: "not_formed", leftAction: "not_applicable", rightAction: "wait_breakout",
  },
  breakdown: {
    description: "Breakdown: support has failed or the structure is clearly bearish; no long setup exists until a new base forms.",
    left: "not_formed", right: "not_formed", leftAction: "not_applicable", rightAction: "wait_breakout",
  },
  left_watch: {
    description: "Left-side developing: price is approaching or sitting at support, or reversal signals are appearing, but confirmation is still missing. No breakout is in play.",
    left: "watch", right: "not_formed", leftAction: "wait", rightAction: "wait_breakout",
  },
  left_triggered: {
    description: "Left-side executable: price is at support with reversal evidence and a nearby support can serve as a stop. The breakout has not happened yet.",
    left: "triggered", right: "not_formed", leftAction: "probe", rightAction: "wait_breakout",
    withoutEntry: "left_watch",
  },
  range_watch: {
    description: "Tight range: price is squeezed between nearby support and nearby resistance, so both a dip entry and a breakout entry are being watched and neither is confirmed.",
    left: "watch", right: "watch", leftAction: "wait", rightAction: "wait_breakout",
  },
  rebound_underway: {
    description: "Rebound underway: price already bounced away from support, so the dip entry has passed, but it is not yet close to a breakout level.",
    left: "too_late", right: "not_formed", leftAction: "not_applicable", rightAction: "wait_breakout",
  },
  right_watch: {
    description: "Right-side developing: price is pressing against a breakout level or the trend is improving, but the breakout or its retest is not confirmed. The dip entry has passed.",
    left: "too_late", right: "watch", leftAction: "not_applicable", rightAction: "wait_breakout",
  },
  right_triggered: {
    description: "Right-side executable: the breakout or trend continuation is confirmed and price is still close enough to the breakout area to enter. The dip entry has passed.",
    left: "too_late", right: "triggered", leftAction: "not_applicable", rightAction: "add_on_retest",
    withoutEntry: "right_watch",
  },
  extended: {
    description: "Extended: price has run far above the breakout area or is overbought, so both the dip entry and the breakout entry have passed and chasing has poor reward-to-risk.",
    left: "too_late", right: "too_late", leftAction: "not_applicable", rightAction: "avoid_chasing",
  },
};

function dailyAtr(snapshot: EvidenceSnapshot): number | undefined {
  const atr = snapshot.items.find((item) => item.family === "atr" && item.timeframe === "daily")?.values?.value;
  return typeof atr === "number" && atr > 0 ? atr : undefined;
}

function distanceCategory(distance: number, atr: number | undefined, price: number): string {
  const units = atr ? distance / atr : (distance / price) * 100 / 2;
  if (units < 0.5) return "extremely close";
  if (units < 1.5) return "close";
  if (units < 3) return "moderate distance";
  return "far";
}

function strengthCategory(strength: number): string {
  if (strength >= 0.75) return "strong";
  if (strength >= 0.5) return "medium";
  return "weak";
}

function levelCandidates(
  snapshot: EvidenceSnapshot,
  side: "stop" | "target"
): JevLevelCandidate[] {
  const atr = dailyAtr(snapshot);
  const kinds: ReadonlyArray<TradeLevel["kind"]> = side === "stop" ? ["support", "stop"] : ["resistance", "target"];
  const prefix = side === "stop" ? "s" : "t";
  const seen = new Set<string>();

  return snapshot.levels
    .filter((level) => kinds.includes(level.kind) && Number.isFinite(level.price) && level.price > 0)
    .filter((level) => (side === "stop" ? level.price < snapshot.price : level.price > snapshot.price))
    .sort((left, right) => Math.abs(left.price - snapshot.price) - Math.abs(right.price - snapshot.price))
    .filter((level) => {
      const key = level.price.toFixed(2);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_LEVEL_CANDIDATES)
    .map((level, index) => {
      const distance = Math.abs(level.price - snapshot.price);
      const pct = ((distance / snapshot.price) * 100).toFixed(1);
      const relation = side === "stop" ? "below" : "above";
      const touches = typeof level.hits === "number" && level.hits > 1 ? `, touched ${level.hits} times` : "";
      return {
        key: `${prefix}${index + 1}`,
        price: level.price,
        description: `${level.price} is a ${strengthCategory(level.strength)} ${level.source} ${level.kind} level, ${pct}% ${relation} the current price (${distanceCategory(distance, atr, snapshot.price)})${touches}.`,
      };
    });
}

function moveCategory(changePct: number, strongThreshold: number): string {
  if (changePct >= strongThreshold) return "strongly up";
  if (changePct >= strongThreshold / 3) return "up";
  if (changePct <= -strongThreshold) return "strongly down";
  if (changePct <= -strongThreshold / 3) return "down";
  return "flat";
}

function priceAction(candles: Candle[], lookback: number, strongThreshold: number): string | undefined {
  if (candles.length <= lookback) return undefined;
  const last = candles[candles.length - 1].close;
  const base = candles[candles.length - 1 - lookback].close;
  if (!(base > 0) || !Number.isFinite(last)) return undefined;
  const changePct = ((last - base) / base) * 100;
  return `${moveCategory(changePct, strongThreshold)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%)`;
}

function rangePosition(candles: Candle[], lookback: number): string | undefined {
  const window = candles.slice(-lookback);
  if (window.length < lookback) return undefined;
  const high = Math.max(...window.map((candle) => candle.high));
  const low = Math.min(...window.map((candle) => candle.low));
  const last = window[window.length - 1].close;
  if (!(high > low)) return undefined;
  const position = (last - low) / (high - low);
  if (position >= 0.85) return "near the top of the range";
  if (position >= 0.6) return "upper half of the range";
  if (position > 0.4) return "middle of the range";
  if (position > 0.15) return "lower half of the range";
  return "near the bottom of the range";
}

function semanticValues(values: Record<string, number | string | boolean> | undefined): Record<string, string | boolean> | undefined {
  if (!values) return undefined;
  const entries = Object.entries(values).filter(
    (entry): entry is [string, string | boolean] => typeof entry[1] !== "number"
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

// Jev is trained primarily on English; wave and Chanlun prose is written in
// Chinese, so those items fall back to their machine-readable state instead.
const NON_ASCII = /[^\x20-\x7e]/;

function englishText(value: string): string | undefined {
  if (!NON_ASCII.test(value)) return value;
  const parenthesized = value.match(/\(([\x20-\x7e]+)\)/)?.[1]?.trim();
  if (parenthesized) return parenthesized;
  const stripped = value.replace(/[^\x20-\x7e]+/g, " ").replace(/\s+/g, " ").trim();
  return /[A-Za-z]{3,}/.test(stripped) && stripped.length <= 80 ? stripped : undefined;
}

export function buildJevDecisionRequest(input: {
  snapshot: EvidenceSnapshot;
  dailyCandles: Candle[];
  weeklyCandles: Candle[];
}): JevDecisionRequest {
  const { snapshot, dailyCandles, weeklyCandles } = input;
  const stopCandidates = levelCandidates(snapshot, "stop");
  const targetCandidates = levelCandidates(snapshot, "target");

  const evidence = snapshot.items
    // Placeholder items ("No active signal", "Insufficient data") are noise for the model.
    .filter((item) => item.reliability > 0 && item.label === item.id)
    .map((item) => ({
      family: item.family,
      timeframe: item.timeframe,
      direction: item.direction,
      state: englishText(item.state) ?? item.direction,
      description: englishText(item.description)
        ?? `${item.family} structure currently reads ${item.direction}${englishText(item.state) ? ` (${englishText(item.state)})` : ""}.`,
      ...(typeof item.barsSince === "number" ? { barsSinceSignal: item.barsSince } : {}),
      barStatus: item.provisional ? "provisional (bar not closed)" : "confirmed",
      ...(item.invalidation && englishText(item.invalidation) ? { invalidation: englishText(item.invalidation) } : {}),
      ...(semanticValues(item.values) ? { details: semanticValues(item.values) } : {}),
    }));

  const state = {
    task: "Technical-analysis evidence for one stock, used to judge a long-only swing trade over the next 5-20 trading days.",
    symbol: snapshot.symbol,
    currentPrice: snapshot.price,
    priceAction: {
      last5DailyBars: priceAction(dailyCandles, 5, 6) ?? "unknown",
      last20DailyBars: priceAction(dailyCandles, 20, 12) ?? "unknown",
      last12WeeklyBars: priceAction(weeklyCandles, 12, 20) ?? "unknown",
      positionIn60DayRange: rangePosition(dailyCandles, 60) ?? "unknown",
    },
    dataQuality: {
      dailyBar: snapshot.dataQuality.dailyBarComplete ? "closed" : "still forming",
      weeklyBar: snapshot.dataQuality.weeklyBarComplete ? "closed" : "still forming",
      missingIndicatorFamilies: snapshot.dataQuality.missingFamilies,
    },
    evidence,
    supportLevelsBelowPrice: stopCandidates.map((candidate) => candidate.description),
    resistanceLevelsAbovePrice: targetCandidates.map((candidate) => candidate.description),
  };

  const primaryQuestions: Record<string, JevQuestion> = {
    outlook: {
      type: "choice",
      instructions: "Based on `evidence` and `priceAction`, what is the most likely price direction of this stock over the next 5-20 trading days?",
      criteria: {
        bullish: "Evidence across trend, momentum, volume and structure favors higher prices.",
        neutral: "Evidence is mixed or range-bound; there is no clear directional edge.",
        bearish: "Evidence across trend, momentum, volume and structure favors lower prices.",
      },
    },
    setupStage: {
      type: "choice",
      instructions: "A long swing trade develops in order: first a left-side chance (buying weakness near support before the reversal is confirmed), later a right-side chance (buying strength after a breakout or trend confirmation). Which single stage describes this stock right now?",
      criteria: Object.fromEntries(
        (Object.keys(SETUP_STAGES) as JevSetupStage[]).map((stage) => [stage, SETUP_STAGES[stage].description])
      ),
    },
    evidenceConflict: {
      type: "noul",
      instructions: "The evidence contains major conflicts: important indicator families or the daily and weekly timeframes point in opposite directions.",
    },
  };

  return { price: snapshot.price, state, primaryQuestions, stopCandidates, targetCandidates };
}

/**
 * Parallel Jev answers cannot see each other, so judgments that depend on the
 * outlook and setup stage are asked in a second call that carries those
 * decisions in its state.
 */
export function buildJevFollowUpRequest(
  request: JevDecisionRequest,
  primary: JevPrimaryDecision
): { state: Record<string, unknown>; questions: Record<string, JevQuestion> } {
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const state = {
    ...request.state,
    decisionsSoFar: {
      outlook: `${primary.outlook} (probabilities: bullish ${pct(primary.outlookProbabilities.bullish)}, neutral ${pct(primary.outlookProbabilities.neutral)}, bearish ${pct(primary.outlookProbabilities.bearish)})`,
      setupStage: SETUP_STAGES[primary.setupStage].description,
    },
  };
  const consistent = "Answer consistently with `decisionsSoFar`.";

  const questions: Record<string, JevQuestion> = {
    entryQuality: {
      type: "score",
      instructions: `How attractive is opening a new long position in this stock right now? Trend direction and entry quality are different judgments: a strong uptrend can still be a poor entry if price is extended. ${consistent}`,
      criteria: [
        "No defensible long case: evidence is clearly bearish or the structure is broken.",
        "Poor entry: mostly negative evidence, or price is badly located with no usable support.",
        "Below average: some constructive evidence but outweighed by risks or a missing setup.",
        "No clear edge to slightly favorable: balanced evidence, a setup is forming but unconfirmed.",
        "Good entry: evidence agrees across several families and timeframes, with a defined nearby support.",
        "Exceptional entry: strong agreement across timeframes, confirmed trigger, close stop and open upside.",
      ],
    },
    holderAction: {
      type: "choice",
      instructions: `What should an investor who already holds this stock do? ${consistent}`,
      criteria: {
        hold: "Keep holding: the trend is intact and there is no pressing risk.",
        hold_protect: "Keep holding but tighten a protective stop: the trend is intact yet risks or extension are rising.",
        reduce: "Reduce the position: evidence is deteriorating or price is at strong resistance with weakening momentum.",
        exit: "Exit the position: the structure has broken down or evidence is clearly bearish.",
      },
    },
    stopTrigger: {
      type: "choice",
      instructions: "Should a protective stop be triggered on a daily close below the stop level, or immediately on an intraday break?",
      criteria: {
        close: "Daily close: volatility is normal and the level has been tested intraday before, so waiting for the close avoids false breaks.",
        intraday: "Intraday: the structure is fragile, volatility is high, or a break would signal an immediate breakdown.",
      },
    },
  };

  if (request.stopCandidates.length > 0) {
    questions.stopLevel = {
      type: "choice",
      instructions: `Which support level is the most defensible protective stop for a long position: close enough to limit the loss, yet strong enough not to be hit by normal volatility? ${consistent}`,
      criteria: {
        ...Object.fromEntries(request.stopCandidates.map((candidate) => [candidate.key, candidate.description])),
        [NO_LEVEL]: "None of the levels is a defensible stop.",
      },
    };
  }
  if (request.targetCandidates.length > 0) {
    questions.targetLevel = {
      type: "choice",
      instructions: `Which resistance level is the most realistic first profit target for a long position over the next 5-20 trading days? ${consistent}`,
      criteria: {
        ...Object.fromEntries(request.targetCandidates.map((candidate) => [candidate.key, candidate.description])),
        [NO_LEVEL]: "None of the levels is a realistic target.",
      },
    };
  }

  return { state, questions };
}

function answerMap(rawAnswers: unknown): Record<string, unknown> {
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
    throw new Error("Jev response has no answers object");
  }
  return rawAnswers as Record<string, unknown>;
}

function choiceAnswer<T extends string>(
  answers: Record<string, unknown>,
  key: string,
  allowed: readonly T[]
): { choice: T; probabilities: Record<string, number>; confidence: number } {
  const answer = answers[key] as Partial<JevChoiceAnswer> | undefined;
  if (!answer || typeof answer.choice !== "string" || !allowed.includes(answer.choice as T)) {
    throw new Error(`Jev answer "${key}" is missing or not one of: ${allowed.join(", ")}`);
  }
  const probabilities: Record<string, number> = {};
  if (answer.probabilities && typeof answer.probabilities === "object") {
    for (const [option, probability] of Object.entries(answer.probabilities)) {
      if (typeof probability === "number" && Number.isFinite(probability)) probabilities[option] = probability;
    }
  }
  const confidence = typeof answer.confidence === "number" && Number.isFinite(answer.confidence)
    ? Math.min(1, Math.max(0, answer.confidence))
    : 0;
  return { choice: answer.choice as T, probabilities, confidence };
}

function candidatePrice(
  answers: Record<string, unknown>,
  key: string,
  candidates: JevLevelCandidate[]
): number | undefined {
  if (candidates.length === 0) return undefined;
  const { choice } = choiceAnswer(answers, key, [...candidates.map((candidate) => candidate.key), NO_LEVEL]);
  return candidates.find((candidate) => candidate.key === choice)?.price;
}

export function resolveJevPrimaryDecision(rawAnswers: unknown): JevPrimaryDecision {
  const answers = answerMap(rawAnswers);
  const adjustments: string[] = [];
  const outlook = choiceAnswer(answers, "outlook", ["bullish", "neutral", "bearish"] as const);
  const stage = choiceAnswer(answers, "setupStage", Object.keys(SETUP_STAGES) as JevSetupStage[]);
  const conflict = answers.evidenceConflict as Partial<JevNoulAnswer> | undefined;

  let setupStage = stage.choice;
  const waitingStage = SETUP_STAGES[setupStage].withoutEntry;
  if (outlook.choice === "bearish" && waitingStage) {
    adjustments.push(`Setup stage lowered from ${setupStage} to ${waitingStage}: a long entry is not executable while the outlook is bearish.`);
    setupStage = waitingStage;
  }

  const probability = (option: AiMarketOutlook) => outlook.probabilities[option] ?? 0;
  return {
    outlook: outlook.choice,
    outlookProbabilities: { bullish: probability("bullish"), neutral: probability("neutral"), bearish: probability("bearish") },
    confidence: outlook.confidence,
    setupStage,
    stageConfidence: stage.confidence,
    conflictProbability: typeof conflict?.noul === "number" && Number.isFinite(conflict.noul)
      ? Math.min(1, Math.max(0, conflict.noul))
      : 0,
    adjustments,
  };
}

export function resolveJevDecision(
  primary: JevPrimaryDecision,
  rawFollowUpAnswers: unknown,
  request: Pick<JevDecisionRequest, "price" | "stopCandidates" | "targetCandidates">
): JevDecision {
  const answers = answerMap(rawFollowUpAnswers);
  const adjustments = [...primary.adjustments];

  const entry = answers.entryQuality as Partial<JevScoreAnswer> | undefined;
  if (!entry || typeof entry.score !== "number" || !Number.isFinite(entry.score)) {
    throw new Error('Jev answer "entryQuality" is missing a numeric score');
  }
  let holderAction = choiceAnswer(answers, "holderAction", ["hold", "hold_protect", "reduce", "exit"] as const).choice;
  const stopTrigger = choiceAnswer(answers, "stopTrigger", ["close", "intraday"] as const).choice;

  const stop = candidatePrice(answers, "stopLevel", request.stopCandidates);
  let target = candidatePrice(answers, "targetLevel", request.targetCandidates);
  if (stop === undefined && target !== undefined) {
    target = undefined;
    adjustments.push("Dropped the target because no defensible stop was selected.");
  }

  let setupStage = primary.setupStage;
  const waitingStage = SETUP_STAGES[setupStage].withoutEntry;
  if (waitingStage && (stop === undefined || target === undefined)) {
    adjustments.push(`Setup stage lowered from ${setupStage} to ${waitingStage}: an executable entry needs both a stop and a target.`);
    setupStage = waitingStage;
  } else if (waitingStage && stop !== undefined && target !== undefined) {
    // Jev cannot do arithmetic, so the payoff of its chosen pair is checked here
    // against the same threshold the rule engine uses for an executable entry.
    const rewardRisk = (target - request.price) / (request.price - stop);
    if (!(rewardRisk >= MIN_EXECUTABLE_REWARD_RISK)) {
      adjustments.push(`Setup stage lowered from ${setupStage} to ${waitingStage}: the chosen stop and target give a reward-to-risk of ${rewardRisk.toFixed(2)}, below ${MIN_EXECUTABLE_REWARD_RISK}.`);
      setupStage = waitingStage;
    }
  }
  if (holderAction === "hold_protect" && stop === undefined) {
    holderAction = "hold";
    adjustments.push("Protective hold changed to hold: no defensible stop was selected.");
  }

  const stage = SETUP_STAGES[setupStage];
  return {
    outlook: primary.outlook,
    outlookProbabilities: primary.outlookProbabilities,
    finalScore: Number(Math.min(5, Math.max(0, entry.score)).toFixed(1)),
    confidence: primary.confidence,
    scoreConfidence: typeof entry.confidence === "number" && Number.isFinite(entry.confidence)
      ? Math.min(1, Math.max(0, entry.confidence))
      : 0,
    conflictProbability: primary.conflictProbability,
    setupStage,
    stageConfidence: primary.stageConfidence,
    leftStatus: stage.left,
    rightStatus: stage.right,
    activeSetup: stage.left === "triggered" ? "left" : stage.right === "triggered" ? "right" : "none",
    holderAction,
    leftEntryAction: stage.leftAction,
    rightAddAction: stage.rightAction,
    stopTrigger,
    stop,
    target,
    adjustments,
  };
}

type AnalysisLanguage = "zh-CN" | "zh-TW" | "en" | "ja";

export function jevConfidenceReason(decision: JevDecision, language: AnalysisLanguage): string {
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const p = decision.outlookProbabilities;
  if (language === "en") {
    return `Jev calibrated probabilities: bullish ${pct(p.bullish)}, neutral ${pct(p.neutral)}, bearish ${pct(p.bearish)}. Entry-score confidence ${pct(decision.scoreConfidence)}; probability of major evidence conflict ${pct(decision.conflictProbability)}.`;
  }
  if (language === "ja") {
    return `Jev の較正済み確率：強気 ${pct(p.bullish)}、中立 ${pct(p.neutral)}、弱気 ${pct(p.bearish)}。エントリー評価の確信度 ${pct(decision.scoreConfidence)}、根拠が大きく対立している確率 ${pct(decision.conflictProbability)}。`;
  }
  if (language === "zh-TW") {
    return `Jev 校準機率：看多 ${pct(p.bullish)}、震盪 ${pct(p.neutral)}、看空 ${pct(p.bearish)}。入場評分置信度 ${pct(decision.scoreConfidence)}；證據存在重大矛盾的機率 ${pct(decision.conflictProbability)}。`;
  }
  return `Jev 校准概率：看多 ${pct(p.bullish)}、震荡 ${pct(p.neutral)}、看空 ${pct(p.bearish)}。入场评分置信度 ${pct(decision.scoreConfidence)}；证据存在重大矛盾的概率 ${pct(decision.conflictProbability)}。`;
}
