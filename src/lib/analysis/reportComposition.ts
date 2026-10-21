import type { StructuredReport } from "./fallbackReport";
import { sanitizeUserVisibleAnalysisText } from "./publicAnalysisText";

/** No local fallback argument: missing model fields must be repaired by the model. */
export function composeAiReport(ai: {overview?: unknown; technicalAnalysis?: unknown; strategyCommentary?: unknown},
  evidenceIds: Iterable<string> = []): StructuredReport {
  const required = (value: unknown, key: string) => {
    if (typeof value !== "string") throw new Error(key + " must be non-empty model text");
    const text = sanitizeUserVisibleAnalysisText(value, evidenceIds);
    if (!text) throw new Error(key + " must be non-empty model text");
    return text;
  };
  return {
    overview: required(ai.overview, "overview"),
    technicalAnalysis: required(ai.technicalAnalysis, "technicalAnalysis"),
    recommendation: required(ai.strategyCommentary, "strategyCommentary"),
  };
}
