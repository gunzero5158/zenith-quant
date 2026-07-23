export type AiScoreAlignment = "agree" | "more_cautious" | "more_constructive";

export interface AiScoreReason {
  evidenceIds: string[];
  text: string;
}

export interface AiScoreReview {
  adjustment: number;
  confidence: number;
  alignment: AiScoreAlignment;
  reasons: AiScoreReason[];
  conflicts: unknown[];
  changeConditions: unknown[];
}

export interface ValidatedAiScoreReview {
  review?: AiScoreReview;
  requestedAdjustment: number;
  appliedAdjustment: number;
  finalScore: number;
  validationWarnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundOne(value: number): number {
  return Number(value.toFixed(1));
}

function parseReasons(value: unknown, allowedIds: Set<string>, warnings: string[]): AiScoreReason[] {
  if (!Array.isArray(value)) {
    warnings.push("scoreReview.reasons must be an array");
    return [];
  }
  const reasons: AiScoreReason[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.text !== "string" || candidate.text.trim().length === 0 || !Array.isArray(candidate.evidenceIds)) {
      warnings.push("AI score reason is malformed");
      continue;
    }
    const evidenceIds = candidate.evidenceIds.filter((id): id is string => typeof id === "string");
    if (evidenceIds.length === 0 || evidenceIds.some((id) => !allowedIds.has(id))) {
      warnings.push("AI score reason cites unknown or empty evidence IDs");
      continue;
    }
    reasons.push({ evidenceIds, text: candidate.text.trim() });
  }
  return reasons;
}

export function validateAiScoreReview(
  value: unknown,
  evidenceIds: Iterable<string>,
  ruleScore: number,
  hardCap: number
): ValidatedAiScoreReview {
  const warnings: string[] = [];
  const safeRuleScore = Number.isFinite(ruleScore) ? ruleScore : 0;
  const safeHardCap = Number.isFinite(hardCap) ? Math.max(0, Math.min(5, hardCap)) : 5;
  if (!isRecord(value)) {
    return {
      requestedAdjustment: 0,
      appliedAdjustment: 0,
      finalScore: roundOne(Math.min(safeRuleScore, safeHardCap)),
      validationWarnings: ["scoreReview must be an object"],
    };
  }

  const adjustment = typeof value.adjustment === "number" && Number.isFinite(value.adjustment) ? value.adjustment : 0;
  if (!(typeof value.adjustment === "number" && Number.isFinite(value.adjustment))) warnings.push("scoreReview.adjustment must be finite");
  const confidence = value.confidence;
  const confidenceValid = typeof confidence === "number" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1;
  if (!confidenceValid) warnings.push("scoreReview.confidence must be between 0 and 1");
  const alignments: AiScoreAlignment[] = ["agree", "more_cautious", "more_constructive"];
  const alignmentValid = typeof value.alignment === "string" && alignments.includes(value.alignment as AiScoreAlignment);
  if (!alignmentValid) warnings.push("scoreReview.alignment is invalid");

  const reasons = parseReasons(value.reasons, new Set(evidenceIds), warnings);
  const conflicts = Array.isArray(value.conflicts) ? value.conflicts : [];
  const changeConditions = Array.isArray(value.changeConditions) ? value.changeConditions : [];
  if (!Array.isArray(value.conflicts)) warnings.push("scoreReview.conflicts must be an array");
  if (!Array.isArray(value.changeConditions)) warnings.push("scoreReview.changeConditions must be an array");

  const review: AiScoreReview | undefined = confidenceValid && alignmentValid
    ? {
        adjustment,
        confidence: confidence as number,
        alignment: value.alignment as AiScoreAlignment,
        reasons,
        conflicts,
        changeConditions,
      }
    : undefined;

  let appliedAdjustment = Math.max(-0.5, Math.min(0.5, adjustment));
  if (adjustment !== appliedAdjustment) warnings.push("AI score adjustment was clipped to +/-0.5");
  if (!review || (Math.abs(appliedAdjustment) > 0 && reasons.length === 0)) {
    if (Math.abs(appliedAdjustment) > 0) warnings.push("Nonzero AI adjustment requires at least one valid evidence-backed reason");
    appliedAdjustment = 0;
  }
  appliedAdjustment = roundOne(appliedAdjustment);
  const finalScore = roundOne(Math.max(0, Math.min(safeHardCap, safeRuleScore + appliedAdjustment)));
  return {
    review,
    requestedAdjustment: adjustment,
    appliedAdjustment,
    finalScore,
    validationWarnings: warnings,
  };
}
