import { describe, expect, it } from "vitest";
import { DEFAULT_ANALYSIS_MODE, isAnalysisMode } from "../analysisMode";

describe("analysis mode", () => {
  it("keeps rules plus AI as the backwards-compatible default", () => {
    expect(DEFAULT_ANALYSIS_MODE).toBe("rule-ai");
  });

  it("accepts only the two supported modes", () => {
    expect(isAnalysisMode("rule-ai")).toBe(true);
    expect(isAnalysisMode("ai-native")).toBe(true);
    expect(isAnalysisMode("rules")).toBe(false);
    expect(isAnalysisMode(undefined)).toBe(false);
  });
});
