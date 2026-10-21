import type { EvidenceSnapshot, ScenarioStatus, TradeLevelKind } from "./evidence";
import type { ScoreDetail } from "./scoring";
import { currentTrend, DECISION_VERSION, forecastEvent } from "./opportunities";
import type { CandidateTradePlan, ForecastEvent, OpportunityAssessment } from "./opportunities";

export type AiMarketOutlook = "bullish" | "neutral" | "bearish";

export interface AiScoreReason {
  evidenceIds: string[];
  text: string;
}

export interface AiEntryAssessment {
  decisionVersion?: string;
  currentTrend?: ReturnType<typeof currentTrend>;
  forecast?: ForecastEvent;
  opportunity?: OpportunityAssessment;
  source: "ai";
  outlook: AiMarketOutlook;
  finalScore: number;
  confidence: number;
  confidenceReason: string;
  leftStatus: ScenarioStatus;
  rightStatus: ScenarioStatus;
  activeSetup: "left" | "right" | "none";
  riskPlan: Partial<CandidateTradePlan> & {
    stop?: number;
    target?: number;
    rewardRisk?: number;
    stopDistancePct?: number;
  };
  reasons: AiScoreReason[];
}

interface GroundedAdvice<Action extends string> {
  action: Action;
  evidenceIds: string[];
  text: string;
}

export interface AiStrategyAdvice {
  holder: GroundedAdvice<"hold" | "hold_protect" | "reduce" | "exit">;
  leftEntry: GroundedAdvice<"wait" | "probe" | "not_applicable">;
  rightAdd: GroundedAdvice<"wait_breakout" | "add_on_retest" | "avoid_chasing">;
  exitStop: {
    trigger: "close" | "intraday";
    evidenceIds: string[];
    text: string;
  };
}

export interface AiAnalysisResult {
  normalized?: boolean;
  overview: string;
  technicalAnalysis: string;
  strategyCommentary: string;
  scoreAssessment: AiEntryAssessment;
  strategyAdvice: AiStrategyAdvice;
}

type UnknownRecord = Record<string, unknown>;
type AnalysisLanguage = "zh-CN" | "zh-TW" | "en" | "ja";

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as UnknownRecord;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function visibleText(value: unknown, path: string, validEvidenceIds: ReadonlySet<string>): string {
  let result = text(value, path);
  result = result.replace(/`(?:daily|weekly)\.[^`\r\n]+`/gu, "");
  const evidenceIds = [...validEvidenceIds].sort((left, right) => right.length - left.length);
  for (const evidenceId of evidenceIds) {
    result = result.replace(new RegExp(escapeRegExp(evidenceId), "gu"), "");
  }

  const cleaned = result
    .replace(/\b(?:daily|weekly)\.[A-Za-z0-9_./-]+\b/gu, "")
    .replace(/\(\s*[,;，；、\s]*\)/gu, "")
    .replace(/（\s*[,;，；、\s]*）/gu, "")
    .replace(/\s+([,.;:!?，。；：！？])/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/[ \t]+\n/gu, "\n")
    .trim();

  if (!cleaned) throw new Error(`${path} must contain user-visible text`);
  return cleaned;
}

function numberInRange(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${path} must be between ${min} and ${max}`);
  }
  return value;
}

function normalizedConfidence(value: unknown): number {
  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    const text = value.trim();
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(%)?$/u);
    if (!match) {
      throw new Error("scoreAssessment.confidence must be a number between 0 and 1 or a percentage between 0 and 100");
    }
    parsed = Number(match[1]);
    if (match[2]) parsed /= 100;
  } else {
    throw new Error("scoreAssessment.confidence must be a number between 0 and 1 or a percentage between 0 and 100");
  }

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("scoreAssessment.confidence must be a number between 0 and 1 or a percentage between 0 and 100");
  }

  return parsed > 1 ? parsed / 100 : parsed;
}

function optionalPositiveNumber(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${path} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function validateEvidenceIds(
  value: unknown,
  path: string,
  validEvidenceIds: ReadonlySet<string>
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must contain at least one evidence ID`);
  }

  return [...new Set(value.map((id, index) => {
    const evidenceId = text(id, `${path}[${index}]`);
    if (!validEvidenceIds.has(evidenceId)) {
      throw new Error(`Unknown evidence ID: ${evidenceId}`);
    }
    return evidenceId;
  }))];
}

function adviceAction<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  validEvidenceIds: ReadonlySet<string>
): GroundedAdvice<T> {
  const item = record(value, path);
  return {
    action: oneOf(item.action, `${path}.action`, allowed),
    evidenceIds: validateEvidenceIds(item.evidenceIds, `${path}.evidenceIds`, validEvidenceIds),
    text: visibleText(item.text, `${path}.text`, validEvidenceIds),
  };
}

function validateStrategyAdvice(
  value: unknown,
  validEvidenceIds: ReadonlySet<string>
): AiStrategyAdvice {
  const strategy = record(value, "strategyAdvice");
  const exitStop = record(strategy.exitStop, "strategyAdvice.exitStop");
  return {
    holder: adviceAction(strategy.holder, "strategyAdvice.holder", ["hold", "hold_protect", "reduce", "exit"], validEvidenceIds),
    leftEntry: adviceAction(strategy.leftEntry, "strategyAdvice.leftEntry", ["wait", "probe", "not_applicable"], validEvidenceIds),
    rightAdd: adviceAction(strategy.rightAdd, "strategyAdvice.rightAdd", ["wait_breakout", "add_on_retest", "avoid_chasing"], validEvidenceIds),
    exitStop: {
      trigger: oneOf(exitStop.trigger, "strategyAdvice.exitStop.trigger", ["close", "intraday"]),
      evidenceIds: validateEvidenceIds(exitStop.evidenceIds, "strategyAdvice.exitStop.evidenceIds", validEvidenceIds),
      text: visibleText(exitStop.text, "strategyAdvice.exitStop.text", validEvidenceIds),
    },
  };
}

function matchesSuppliedLevel(
  value: number,
  allowedKinds: ReadonlySet<TradeLevelKind>,
  snapshot: EvidenceSnapshot
): boolean {
  return snapshot.levels.some((level) => {
    if (!allowedKinds.has(level.kind)) return false;
    const tolerance = Math.max(0.01, Math.abs(level.price) * 0.0001);
    return Math.abs(level.price - value) <= tolerance;
  }) || (snapshot.tradePlans ?? []).some(plan => {
    const price = allowedKinds.has("stop") ? plan.stop : plan.target;
    return price !== undefined && Math.abs(price - value) <= Math.max(0.01, Math.abs(price) * 0.0001);
  });
}

function validateRiskPlan(value: unknown, snapshot: EvidenceSnapshot): AiEntryAssessment["riskPlan"] {
  const riskPlan = record(value, "scoreAssessment.riskPlan");
  const stop = optionalPositiveNumber(riskPlan.stop, "scoreAssessment.riskPlan.stop");
  const target = optionalPositiveNumber(riskPlan.target, "scoreAssessment.riskPlan.target");

  if (stop !== undefined) {
    if (!(stop < snapshot.price)
      || !matchesSuppliedLevel(stop, new Set<TradeLevelKind>(["support", "stop"]), snapshot)) {
      throw new Error("riskPlan.stop must be a supplied support/stop below the current price");
    }
  }

  if (target !== undefined) {
    if (!(target > snapshot.price)
      || !matchesSuppliedLevel(target, new Set<TradeLevelKind>(["resistance", "target"]), snapshot)) {
      throw new Error("riskPlan.target must be a supplied resistance/target above the current price");
    }
  }

  const stopDistance = stop === undefined ? undefined : snapshot.price - stop;
  return {
    stop,
    target,
    stopDistancePct: stopDistance === undefined
      ? undefined
      : Number(((stopDistance / snapshot.price) * 100).toFixed(2)),
    rewardRisk: stopDistance === undefined || target === undefined
      ? undefined
      : Number(((target - snapshot.price) / stopDistance).toFixed(2)),
  };
}

function validateDecisionConsistency(
  assessment: AiEntryAssessment,
  strategy: AiStrategyAdvice
): void {
  if (assessment.activeSetup === "left") {
    if (assessment.leftStatus !== "triggered" || strategy.leftEntry.action !== "probe") {
      throw new Error("scoreAssessment.activeSetup=left requires a triggered leftStatus and probe action");
    }
  }
  if (assessment.activeSetup === "right") {
    if (assessment.rightStatus !== "triggered" || strategy.rightAdd.action !== "add_on_retest") {
      throw new Error("scoreAssessment.activeSetup=right requires a triggered rightStatus and add_on_retest action");
    }
  }
  if (strategy.leftEntry.action === "probe" && assessment.activeSetup !== "left") {
    throw new Error("strategyAdvice.leftEntry probe requires activeSetup=left");
  }
  if (strategy.rightAdd.action === "add_on_retest" && assessment.activeSetup !== "right") {
    throw new Error("strategyAdvice.rightAdd add_on_retest requires activeSetup=right");
  }

  const actionableEntry = strategy.leftEntry.action === "probe"
    || strategy.rightAdd.action === "add_on_retest";
  if (actionableEntry && (assessment.riskPlan.stop === undefined || assessment.riskPlan.target === undefined)) {
    throw new Error("An actionable entry requires both a grounded stop and target in scoreAssessment.riskPlan");
  }
  if (strategy.holder.action === "hold_protect" && assessment.riskPlan.stop === undefined) {
    throw new Error("A hold_protect recommendation requires a grounded stop in scoreAssessment.riskPlan");
  }
}

export function validateAiAnalysisResult(
  value: unknown,
  snapshot: EvidenceSnapshot,
  _language: AnalysisLanguage = "zh-CN"
): AiAnalysisResult {
  void _language; // Retained for callers; validation never generates localized fallback prose.
  const validEvidenceIds = new Set(snapshot.items.map((item) => item.id));
  const result = record(value, "result");
  const score = record(result.scoreAssessment, "scoreAssessment");
  if (!Array.isArray(score.reasons) || score.reasons.length === 0) {
    throw new Error("scoreAssessment.reasons must contain at least one reason");
  }

  const reasons = score.reasons.map((value, index): AiScoreReason => {
    const reason = record(value, `scoreAssessment.reasons[${index}]`);
    return {
      evidenceIds: validateEvidenceIds(
        reason.evidenceIds,
        `scoreAssessment.reasons[${index}].evidenceIds`,
        validEvidenceIds
      ),
      text: visibleText(reason.text, `scoreAssessment.reasons[${index}].text`, validEvidenceIds),
    };
  });

  const assessment: AiEntryAssessment = {
    source: "ai",
    outlook: oneOf(score.outlook, "scoreAssessment.outlook", ["bullish", "neutral", "bearish"]),
    finalScore: numberInRange(score.finalScore, "scoreAssessment.finalScore", 0, 5),
    confidence: normalizedConfidence(score.confidence),
    confidenceReason: visibleText(score.confidenceReason, "scoreAssessment.confidenceReason", validEvidenceIds),
    leftStatus: oneOf(score.leftStatus, "scoreAssessment.leftStatus", ["not_formed", "watch", "provisional", "triggered", "too_late"]),
    rightStatus: oneOf(score.rightStatus, "scoreAssessment.rightStatus", ["not_formed", "watch", "provisional", "triggered", "too_late"]),
    activeSetup: oneOf(score.activeSetup, "scoreAssessment.activeSetup", ["left", "right", "none"]),
    riskPlan: validateRiskPlan(score.riskPlan, snapshot),
    reasons,
  };
  {
    const selected = snapshot.tradePlans?.find(plan => plan.id === score.selectedPlanId);
    if (score.selectedPlanId != null && !selected) throw new Error("Unknown selectedPlanId");
    assessment.decisionVersion = DECISION_VERSION;
    const kind = score.opportunityKind == null ? selected?.kind
      : oneOf(score.opportunityKind, "opportunityKind", ["rebound", "pullback", "breakout"]);
    if (score.opportunityKind === null && !selected && assessment.activeSetup !== "none") {
      throw new Error("An active setup contradicts opportunityKind=null");
    }
    const horizon = kind === "rebound" ? 5 : kind ? 10 : selected?.horizon ?? 10;
    if (score.horizon !== undefined && score.horizon !== horizon) throw new Error("Forecast horizon contradicts opportunity kind");
    assessment.forecast = forecastEvent(snapshot, horizon);
    if (score.currentTrend !== undefined) {
      const trend = record(score.currentTrend, "currentTrend");
      assessment.currentTrend = {
        daily: oneOf(trend.daily, "currentTrend.daily", ["bullish", "neutral", "bearish"]),
        weekly: oneOf(trend.weekly, "currentTrend.weekly", ["bullish", "neutral", "bearish"]),
      };
    }
    const modelPlan: CandidateTradePlan | undefined = kind ? {
      id: selected?.id ?? `model:${kind}`, kind, side: kind === "breakout" ? "right" : "left", horizon,
      generatedAt: snapshot.dataQuality.asOf, anchorKnownAt: snapshot.dataQuality.latestDailyDate ?? snapshot.dataQuality.asOf,
      entry: snapshot.price, ...assessment.riskPlan,
      priceConfirmed: (kind === "breakout" ? assessment.rightStatus : assessment.leftStatus) === "triggered",
      stopTrigger: record(result.strategyAdvice, "strategyAdvice").exitStop
        ? oneOf(record(record(result.strategyAdvice, "strategyAdvice").exitStop, "exitStop").trigger, "exitStop.trigger", ["close", "intraday"]) : "close",
      minimumStopDistance: 0, maxEntry: snapshot.price, expiresAfterBars: horizon,
      evidenceIds: reasons.flatMap(reason => reason.evidenceIds),
    } : undefined;

    if (modelPlan) {
      assessment.opportunity = { kind: modelPlan.kind, horizon, score: assessment.finalScore,
        status: oneOf(score.opportunityStatus ?? (modelPlan.side === "left" ? score.leftStatus : score.rightStatus),
          "scoreAssessment.opportunityStatus", ["not_formed", "watch", "provisional", "triggered", "too_late", "invalidated"]),
        plan: modelPlan, reasons: reasons.map(reason => reason.text) };
      const opportunityStatus = assessment.opportunity.status === "invalidated" ? "not_formed" : assessment.opportunity.status;
      if ((modelPlan.side === "left" ? assessment.leftStatus : assessment.rightStatus) !== opportunityStatus) {
        throw new Error("Opportunity status must match the selected side status");
      }
      if (assessment.activeSetup !== "none" && assessment.activeSetup !== modelPlan.side) {
        throw new Error("Active setup must match the selected opportunity side");
      }
    }
  }
  const strategyAdvice = validateStrategyAdvice(result.strategyAdvice, validEvidenceIds);
  validateDecisionConsistency(assessment, strategyAdvice);
  return {
    normalized: false,
    overview: visibleText(result.overview, "overview", validEvidenceIds),
    technicalAnalysis: visibleText(result.technicalAnalysis, "technicalAnalysis", validEvidenceIds),
    strategyCommentary: visibleText(result.strategyCommentary, "strategyCommentary", validEvidenceIds),
    scoreAssessment: assessment,
    strategyAdvice,
  };
}

export function toLegacyAiScoreDetail(assessment: AiEntryAssessment): ScoreDetail {
  return {
    baseTrendScore: 0,
    momentumScore: 0,
    volumeScore: 0,
    patternsScore: 0,
    weeklyResonanceScore: 0,
    totalScore: assessment.finalScore,
    scoreReasons: assessment.reasons.map((reason) => reason.text),
  };
}
