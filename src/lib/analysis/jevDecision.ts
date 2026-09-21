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
  state: Record<string, unknown>;
  questions: Record<string, JevQuestion>;
  stopCandidates: JevLevelCandidate[];
  targetCandidates: JevLevelCandidate[];
}

export interface JevDecision {
  outlook: AiMarketOutlook;
  outlookProbabilities: Record<AiMarketOutlook, number>;
  finalScore: number;
  confidence: number;
  scoreConfidence: number;
  conflictProbability: number;
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
const SETUP_STATUSES: readonly JevSetupStatus[] = ["not_formed", "watch", "triggered", "too_late"];

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

  const setupCriteria = (side: "left" | "right"): Record<JevSetupStatus, string> => side === "left"
    ? {
      not_formed: "No left-side (buy the dip / early reversal) setup exists: price is not near meaningful support and there are no reversal or oversold signals.",
      watch: "A left-side setup is developing: price is approaching or sitting at support, or reversal signals are appearing, but confirmation or a clear stop is still missing.",
      triggered: "A left-side entry is executable now: price is at support with reversal evidence, and a nearby support level can serve as a stop.",
      too_late: "The left-side opportunity has passed: price already rebounded far from support, or support has broken down.",
    }
    : {
      not_formed: "No right-side (breakout / trend confirmation) setup exists: there is no breakout, no confirmed uptrend, and no nearby trigger level.",
      watch: "A right-side setup is developing: price is near a breakout level or the trend is improving, but the breakout or retest is not yet confirmed.",
      triggered: "A right-side entry is executable now: breakout or trend continuation is confirmed by evidence and price is still close enough to the breakout area to enter.",
      too_late: "The right-side move is already extended: price is far above the breakout area or overbought, so chasing has poor reward-to-risk.",
    };

  const questions: Record<string, JevQuestion> = {
    outlook: {
      type: "choice",
      instructions: "Based on `evidence` and `priceAction`, what is the most likely price direction of this stock over the next 5-20 trading days?",
      criteria: {
        bullish: "Evidence across trend, momentum, volume and structure favors higher prices.",
        neutral: "Evidence is mixed or range-bound; there is no clear directional edge.",
        bearish: "Evidence across trend, momentum, volume and structure favors lower prices.",
      },
    },
    entryQuality: {
      type: "score",
      instructions: "How attractive is opening a new long position in this stock right now? Trend direction and entry quality are different judgments: a strong uptrend can still be a poor entry if price is extended.",
      criteria: [
        "No defensible long case: evidence is clearly bearish or the structure is broken.",
        "Poor entry: mostly negative evidence, or price is badly located with no usable support.",
        "Below average: some constructive evidence but outweighed by risks or a missing setup.",
        "No clear edge to slightly favorable: balanced evidence, a setup is forming but unconfirmed.",
        "Good entry: evidence agrees across several families and timeframes, with a defined nearby support.",
        "Exceptional entry: strong agreement across timeframes, confirmed trigger, close stop and open upside.",
      ],
    },
    leftStatus: {
      type: "choice",
      instructions: "What is the status of a left-side long entry (buying weakness near support before the reversal is confirmed)?",
      criteria: setupCriteria("left"),
    },
    rightStatus: {
      type: "choice",
      instructions: "What is the status of a right-side long entry (buying strength after a breakout or trend confirmation)?",
      criteria: setupCriteria("right"),
    },
    preferredSetup: {
      type: "choice",
      instructions: "If a new long position were opened now, which entry style fits the evidence best?",
      criteria: {
        left: "Left-side: buy near support in anticipation of a reversal.",
        right: "Right-side: buy the confirmed breakout or the retest of it.",
        none: "Neither: the evidence does not justify opening a new long position now.",
      },
    },
    holderAction: {
      type: "choice",
      instructions: "What should an investor who already holds this stock do?",
      criteria: {
        hold: "Keep holding: the trend is intact and there is no pressing risk.",
        hold_protect: "Keep holding but tighten a protective stop: the trend is intact yet risks or extension are rising.",
        reduce: "Reduce the position: evidence is deteriorating or price is at strong resistance with weakening momentum.",
        exit: "Exit the position: the structure has broken down or evidence is clearly bearish.",
      },
    },
    leftEntryAction: {
      type: "choice",
      instructions: "What should an investor who wants a left-side entry do now?",
      criteria: {
        wait: "Wait: a left-side setup may come, but conditions are not met yet.",
        probe: "Open a small probing position now near support with a defined stop.",
        not_applicable: "Left-side entry does not apply: there is no support-based setup, or the chance has passed.",
      },
    },
    rightAddAction: {
      type: "choice",
      instructions: "What should an investor who wants a right-side entry or add do now?",
      criteria: {
        wait_breakout: "Wait for a confirmed breakout above resistance before acting.",
        add_on_retest: "Buy or add now on the confirmed breakout or its successful retest.",
        avoid_chasing: "Do not chase: price is already extended above the breakout area.",
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
    evidenceConflict: {
      type: "noul",
      instructions: "The evidence contains major conflicts: important indicator families or the daily and weekly timeframes point in opposite directions.",
    },
  };

  if (stopCandidates.length > 0) {
    questions.stopLevel = {
      type: "choice",
      instructions: "Which support level is the most defensible protective stop for a long position: close enough to limit the loss, yet strong enough not to be hit by normal volatility?",
      criteria: {
        ...Object.fromEntries(stopCandidates.map((candidate) => [candidate.key, candidate.description])),
        [NO_LEVEL]: "None of the levels is a defensible stop.",
      },
    };
  }
  if (targetCandidates.length > 0) {
    questions.targetLevel = {
      type: "choice",
      instructions: "Which resistance level is the most realistic first profit target for a long position over the next 5-20 trading days?",
      criteria: {
        ...Object.fromEntries(targetCandidates.map((candidate) => [candidate.key, candidate.description])),
        [NO_LEVEL]: "None of the levels is a realistic target.",
      },
    };
  }

  return { state, questions, stopCandidates, targetCandidates };
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

export function resolveJevDecision(
  rawAnswers: unknown,
  request: Pick<JevDecisionRequest, "stopCandidates" | "targetCandidates">
): JevDecision {
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
    throw new Error("Jev response has no answers object");
  }
  const answers = rawAnswers as Record<string, unknown>;
  const adjustments: string[] = [];

  const outlook = choiceAnswer(answers, "outlook", ["bullish", "neutral", "bearish"] as const);
  const entry = answers.entryQuality as Partial<JevScoreAnswer> | undefined;
  if (!entry || typeof entry.score !== "number" || !Number.isFinite(entry.score)) {
    throw new Error('Jev answer "entryQuality" is missing a numeric score');
  }
  const conflict = answers.evidenceConflict as Partial<JevNoulAnswer> | undefined;

  const left = choiceAnswer(answers, "leftStatus", SETUP_STATUSES);
  const right = choiceAnswer(answers, "rightStatus", SETUP_STATUSES);
  let leftStatus = left.choice;
  let rightStatus = right.choice;
  const leftProbability = left.probabilities.triggered ?? 0;
  const rightProbability = right.probabilities.triggered ?? 0;
  const preferred = choiceAnswer(answers, "preferredSetup", ["left", "right", "none"] as const).choice;
  let holderAction = choiceAnswer(answers, "holderAction", ["hold", "hold_protect", "reduce", "exit"] as const).choice;
  let leftEntryAction = choiceAnswer(answers, "leftEntryAction", ["wait", "probe", "not_applicable"] as const).choice;
  let rightAddAction = choiceAnswer(answers, "rightAddAction", ["wait_breakout", "add_on_retest", "avoid_chasing"] as const).choice;
  const stopTrigger = choiceAnswer(answers, "stopTrigger", ["close", "intraday"] as const).choice;

  const stop = candidatePrice(answers, "stopLevel", request.stopCandidates);
  let target = candidatePrice(answers, "targetLevel", request.targetCandidates);
  if (stop === undefined && target !== undefined) {
    target = undefined;
    adjustments.push("Dropped the target because no defensible stop was selected.");
  }

  // Parallel answers are independent, so an actionable entry must be backed by
  // every related answer; otherwise it is downgraded to the waiting state.
  const riskComplete = stop !== undefined && target !== undefined;
  let leftActionable = riskComplete && leftStatus === "triggered" && leftEntryAction === "probe";
  let rightActionable = riskComplete && rightStatus === "triggered" && rightAddAction === "add_on_retest";
  if (leftActionable && rightActionable) {
    const keepLeft = preferred === "left" || (preferred === "none" && leftProbability >= rightProbability);
    if (keepLeft) rightActionable = false;
    else leftActionable = false;
    adjustments.push(`Both entries looked actionable; kept the ${keepLeft ? "left" : "right"}-side setup only.`);
  }

  if (!leftActionable) {
    if (leftStatus === "triggered") {
      leftStatus = "watch";
      adjustments.push("Left-side status lowered from triggered to watch: the entry action or the stop-target pair did not confirm it.");
    }
    if (leftEntryAction === "probe") {
      leftEntryAction = "wait";
      adjustments.push("Left-side probe changed to wait: the setup status or the stop-target pair did not confirm it.");
    }
  }
  if (!rightActionable) {
    if (rightStatus === "triggered") {
      rightStatus = "watch";
      adjustments.push("Right-side status lowered from triggered to watch: the entry action or the stop-target pair did not confirm it.");
    }
    if (rightAddAction === "add_on_retest") {
      rightAddAction = "wait_breakout";
      adjustments.push("Right-side add changed to wait for breakout: the setup status or the stop-target pair did not confirm it.");
    }
  }
  if (holderAction === "hold_protect" && stop === undefined) {
    holderAction = "hold";
    adjustments.push("Protective hold changed to hold: no defensible stop was selected.");
  }

  const probability = (option: AiMarketOutlook) => outlook.probabilities[option] ?? 0;
  return {
    outlook: outlook.choice,
    outlookProbabilities: { bullish: probability("bullish"), neutral: probability("neutral"), bearish: probability("bearish") },
    finalScore: Number(Math.min(5, Math.max(0, entry.score)).toFixed(1)),
    confidence: outlook.confidence,
    scoreConfidence: typeof entry.confidence === "number" && Number.isFinite(entry.confidence)
      ? Math.min(1, Math.max(0, entry.confidence))
      : 0,
    conflictProbability: typeof conflict?.noul === "number" && Number.isFinite(conflict.noul)
      ? Math.min(1, Math.max(0, conflict.noul))
      : 0,
    leftStatus,
    rightStatus,
    activeSetup: leftActionable ? "left" : rightActionable ? "right" : "none",
    holderAction,
    leftEntryAction,
    rightAddAction,
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
