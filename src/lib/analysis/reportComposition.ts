import { StructuredReport } from "./fallbackReport";
import { sanitizeUserVisibleAnalysisText } from "./publicAnalysisText";
import type { EntryAssessment } from "./scoring";

export interface AiReportFields {
  overview?: unknown;
  technicalAnalysis?: unknown;
  strategyCommentary?: unknown;
  decisionCheck?: unknown;
}

const AI_HEADINGS: Record<string, string> = {
  "zh-CN": "AI补充判断",
  "zh-TW": "AI補充判斷",
  en: "AI follow-up",
  ja: "AI補足判断",
};

function nonEmptyText(value: unknown, evidenceIds: Iterable<string>): string | undefined {
  if (typeof value !== "string") return undefined;
  const sanitized = sanitizeUserVisibleAnalysisText(value, evidenceIds);
  return sanitized || undefined;
}

export function composeAiReport(
  ai: AiReportFields,
  localReport: StructuredReport,
  language: string,
  evidenceIds: Iterable<string> = [],
  assessment?: Pick<EntryAssessment, "opportunity">
): StructuredReport {
  const opportunity = assessment?.opportunity;
  const check = ai.decisionCheck as Record<string, unknown> | undefined;
  // The model must acknowledge the immutable decision before its action-bearing
  // prose can replace the local summary. Keep technical synthesis on mismatch.
  const aligned = !opportunity || (check !== null && typeof check === "object"
    && check.status === opportunity.status
    && check.planId === opportunity.plan.id
    && check.stop === (opportunity.plan.stop ?? null)
    && check.target === (opportunity.plan.target ?? null));
  const strategyCommentary = aligned ? nonEmptyText(ai.strategyCommentary, evidenceIds) : undefined;
  const recommendation = strategyCommentary
    ? `${localReport.recommendation}\n\n### ${AI_HEADINGS[language] ?? AI_HEADINGS["zh-CN"]}\n${strategyCommentary}`
    : localReport.recommendation;
  const correction = language === "en" ? "AI decision fields did not match the rule plan; the summary and actions below use the local decision."
    : language === "ja" ? "AIの判断項目がルール計画と一致しないため、概要と行動はローカル判断を使用しています。"
      : "AI未正确核对规则计划，以下综述与执行策略采用本地判断；技术解读保留。";

  return {
    overview: aligned ? nonEmptyText(ai.overview, evidenceIds) ?? localReport.overview : `${correction}\n\n${localReport.overview}`,
    recommendation,
    technicalAnalysis: nonEmptyText(ai.technicalAnalysis, evidenceIds) ?? localReport.technicalAnalysis,
  };
}
