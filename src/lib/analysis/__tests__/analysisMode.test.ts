import { describe, expect, it } from "vitest";
import { canUseMockMarketData, DEFAULT_ANALYSIS_MODE, isAnalysisMode } from "../analysisMode";

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

  it("allows mock candles only for an explicitly enabled local rule fallback", () => {
    expect(canUseMockMarketData("rule-ai", true)).toBe(true);
    expect(canUseMockMarketData("rule-ai", false)).toBe(false);
    expect(canUseMockMarketData("rule-ai", undefined)).toBe(false);
    expect(canUseMockMarketData("ai-native", true)).toBe(false);
  });
});
