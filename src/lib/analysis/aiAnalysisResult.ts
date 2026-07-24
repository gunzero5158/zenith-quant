import type { ScenarioStatus } from "./evidence";
import type { ScoreDetail } from "./scoring";
import type { StrategyAdvice } from "./strategyAdvice";

export interface AiScoreReason {
  evidenceIds: string[];
  text: string;
}

export interface AiEntryAssessment {
  source: "ai";
  finalScore: number;
  confidence: number;
  leftStatus: ScenarioStatus;
  rightStatus: ScenarioStatus;
  activeSetup: "left" | "right" | "none";
  riskPlan: {
    stop?: number;
    target?: number;
    rewardRisk?: number;
    stopDistancePct?: number;
  };
  reasons: AiScoreReason[];
}

export interface AiAnalysisResult {
  overview: string;
  technicalAnalysis: string;
  strategyCommentary: string;
  scoreAssessment: AiEntryAssessment;
  strategyAdvice: StrategyAdvice;
}

type UnknownRecord = Record<string, unknown>;

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

  return result
    .replace(/\b(?:daily|weekly)\.[A-Za-z0-9_./-]+\b/gu, "")
    .replace(/[（(]\s*(?:[,，、;；]\s*)*[)）]/gu, "")
    .replace(/\s+([,，。.;；:：])/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/[ \t]+\n/gu, "\n")
    .trim();
}

function numberInRange(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${path} must be between ${min} and ${max}`);
  }
  return value;
}

function optionalNonNegativeNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a non-negative finite number`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${path} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function adviceAction<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  validEvidenceIds: ReadonlySet<string>
): { action: T; text: string } {
  const item = record(value, path);
  return {
    action: oneOf(item.action, `${path}.action`, allowed),
    text: visibleText(item.text, `${path}.text`, validEvidenceIds),
  };
}

function validateStrategyAdvice(value: unknown, validEvidenceIds: ReadonlySet<string>): StrategyAdvice {
  const strategy = record(value, "strategyAdvice");
  const exitStop = record(strategy.exitStop, "strategyAdvice.exitStop");
  return {
    holder: adviceAction(strategy.holder, "strategyAdvice.holder", ["hold", "hold_protect", "reduce", "exit"], validEvidenceIds),
    leftEntry: adviceAction(strategy.leftEntry, "strategyAdvice.leftEntry", ["wait", "probe", "not_applicable"], validEvidenceIds),
    rightAdd: adviceAction(strategy.rightAdd, "strategyAdvice.rightAdd", ["wait_breakout", "add_on_retest", "avoid_chasing"], validEvidenceIds),
    exitStop: {
      structuralStop: optionalNonNegativeNumber(exitStop.structuralStop, "strategyAdvice.exitStop.structuralStop"),
      atrStop: optionalNonNegativeNumber(exitStop.atrStop, "strategyAdvice.exitStop.atrStop"),
      trigger: oneOf(exitStop.trigger, "strategyAdvice.exitStop.trigger", ["close", "intraday"]),
      text: visibleText(exitStop.text, "strategyAdvice.exitStop.text", validEvidenceIds),
    },
  };
}

export function validateAiAnalysisResult(value: unknown, validEvidenceIds: ReadonlySet<string>): AiAnalysisResult {
  const result = record(value, "result");
  const score = record(result.scoreAssessment, "scoreAssessment");
  const riskPlan = record(score.riskPlan, "scoreAssessment.riskPlan");
  if (!Array.isArray(score.reasons) || score.reasons.length === 0) {
    throw new Error("scoreAssessment.reasons must contain at least one reason");
  }

  const reasons = score.reasons.map((value, index): AiScoreReason => {
    const reason = record(value, `scoreAssessment.reasons[${index}]`);
    if (!Array.isArray(reason.evidenceIds) || reason.evidenceIds.length === 0) {
      throw new Error(`scoreAssessment.reasons[${index}].evidenceIds must not be empty`);
    }
    const evidenceIds = reason.evidenceIds.map((id, evidenceIndex) => {
      const evidenceId = text(id, `scoreAssessment.reasons[${index}].evidenceIds[${evidenceIndex}]`);
      if (!validEvidenceIds.has(evidenceId)) {
        throw new Error(`Unknown evidence ID: ${evidenceId}`);
      }
      return evidenceId;
    });
    return {
      evidenceIds,
      text: visibleText(reason.text, `scoreAssessment.reasons[${index}].text`, validEvidenceIds),
    };
  });

  return {
    overview: visibleText(result.overview, "overview", validEvidenceIds),
    technicalAnalysis: visibleText(result.technicalAnalysis, "technicalAnalysis", validEvidenceIds),
    strategyCommentary: visibleText(result.strategyCommentary, "strategyCommentary", validEvidenceIds),
    scoreAssessment: {
      source: "ai",
      finalScore: numberInRange(score.finalScore, "scoreAssessment.finalScore", 0, 5),
      confidence: numberInRange(score.confidence, "scoreAssessment.confidence", 0, 1),
      leftStatus: oneOf(score.leftStatus, "scoreAssessment.leftStatus", ["not_formed", "watch", "triggered", "too_late"]),
      rightStatus: oneOf(score.rightStatus, "scoreAssessment.rightStatus", ["not_formed", "watch", "triggered", "too_late"]),
      activeSetup: oneOf(score.activeSetup, "scoreAssessment.activeSetup", ["left", "right", "none"]),
      riskPlan: {
        stop: optionalNonNegativeNumber(riskPlan.stop, "scoreAssessment.riskPlan.stop"),
        target: optionalNonNegativeNumber(riskPlan.target, "scoreAssessment.riskPlan.target"),
        rewardRisk: optionalNonNegativeNumber(riskPlan.rewardRisk, "scoreAssessment.riskPlan.rewardRisk"),
        stopDistancePct: optionalNonNegativeNumber(riskPlan.stopDistancePct, "scoreAssessment.riskPlan.stopDistancePct"),
      },
      reasons,
    },
    strategyAdvice: validateStrategyAdvice(result.strategyAdvice, validEvidenceIds),
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
