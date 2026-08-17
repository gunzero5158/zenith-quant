export const ANALYSIS_MODES = ["rule-ai", "ai-native"] as const;

export type AnalysisMode = (typeof ANALYSIS_MODES)[number];

export const DEFAULT_ANALYSIS_MODE: AnalysisMode = "rule-ai";

export function isAnalysisMode(value: unknown): value is AnalysisMode {
  return typeof value === "string" && ANALYSIS_MODES.includes(value as AnalysisMode);
}

export function canUseMockMarketData(mode: AnalysisMode, useFallback: boolean | undefined): boolean {
  return mode === "rule-ai" && useFallback === true;
}
