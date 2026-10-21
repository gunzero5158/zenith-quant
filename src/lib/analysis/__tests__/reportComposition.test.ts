import { describe, expect, it } from "vitest";
import { composeAiReport } from "../reportComposition";
describe("Independent AI report composition", () => {
  it("preserves model-authored sections without local recommendations", () => {
    expect(composeAiReport({overview:"Model overview",technicalAnalysis:"Model evidence",strategyCommentary:"Model strategy"}))
      .toEqual({overview:"Model overview",technicalAnalysis:"Model evidence",recommendation:"Model strategy"});
  });
  it.each(["overview","technicalAnalysis","strategyCommentary"])("rejects absent %s instead of filling with local text", key => {
    const value = {overview:"Model",technicalAnalysis:"Model",strategyCommentary:"Model",[key]:""};
    expect(() => composeAiReport(value)).toThrow(key);
  });
  it("strips machine identifiers without changing the conclusion", () => {
    expect(composeAiReport({overview:"Weak (`daily.ema.bearish`).",technicalAnalysis:"Momentum",strategyCommentary:"Wait"}).overview).toBe("Weak.");
  });
});
