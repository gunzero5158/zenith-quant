import { StructuredReport } from "./fallbackReport";

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

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function composeAiReport(
  ai: AiReportFields,
  localReport: StructuredReport,
  language: string
): StructuredReport {
  const strategyCommentary = nonEmptyText(ai.strategyCommentary);
  const recommendation = strategyCommentary
    ? `${localReport.recommendation}\n\n### ${AI_HEADINGS[language] ?? AI_HEADINGS["zh-CN"]}\n${strategyCommentary}`
    : localReport.recommendation;

  return {
    overview: nonEmptyText(ai.overview) ?? localReport.overview,
    recommendation,
    technicalAnalysis: nonEmptyText(ai.technicalAnalysis) ?? localReport.technicalAnalysis,
  };
}
