import { StructuredReport } from "./fallbackReport";
import { sanitizeUserVisibleAnalysisText } from "./publicAnalysisText";

export interface AiReportFields {
  overview?: unknown;
  technicalAnalysis?: unknown;
  strategyCommentary?: unknown;
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
  evidenceIds: Iterable<string> = []
): StructuredReport {
  const strategyCommentary = nonEmptyText(ai.strategyCommentary, evidenceIds);
  const recommendation = strategyCommentary
    ? `${localReport.recommendation}\n\n### ${AI_HEADINGS[language] ?? AI_HEADINGS["zh-CN"]}\n${strategyCommentary}`
    : localReport.recommendation;

  return {
    overview: nonEmptyText(ai.overview, evidenceIds) ?? localReport.overview,
    recommendation,
    technicalAnalysis: nonEmptyText(ai.technicalAnalysis, evidenceIds) ?? localReport.technicalAnalysis,
  };
}
