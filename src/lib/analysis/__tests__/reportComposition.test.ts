import { describe, expect, it } from "vitest";
import type { AiAnalysisResult } from "../aiAnalysisResult";
import { composeAiReport } from "../reportComposition";

const aiResult: AiAnalysisResult = {
  overview: "The setup is improving, but confirmation is incomplete.",
  technicalAnalysis: "### Momentum\nMACD is improving.",
  strategyCommentary: "The assessment changes if price loses support.",
  scoreAssessment: {
    source: "ai",
    outlook: "neutral",
    finalScore: 3.6,
    confidence: 0.74,
    confidenceReason: "Signals are constructive but not fully aligned.",
    leftStatus: "watch",
    rightStatus: "not_formed",
    activeSetup: "none",
    riskPlan: {},
    reasons: [{ evidenceIds: ["daily.macd.rising"], text: "Momentum is improving." }],
  },
  strategyAdvice: {
    holder: { action: "hold_protect", evidenceIds: ["daily.macd.rising"], text: "Hold with protection." },
    leftEntry: { action: "wait", evidenceIds: ["daily.macd.rising"], text: "Wait for a reversal trigger." },
    rightAdd: { action: "wait_breakout", evidenceIds: ["daily.macd.rising"], text: "Wait for a breakout." },
    exitStop: { trigger: "close", evidenceIds: ["daily.macd.rising"], text: "Exit on a close below support." },
  },
};

describe("AI-native report composition", () => {
  it("uses AI prose and all four AI strategy decisions without a local report", () => {
    const report = composeAiReport(aiResult, "en");

    expect(report.overview).toBe(aiResult.overview);
    expect(report.technicalAnalysis).toBe(aiResult.technicalAnalysis);
    expect(report.recommendation).toContain("Hold with protection.");
    expect(report.recommendation).toContain("Wait for a reversal trigger.");
    expect(report.recommendation).toContain("Wait for a breakout.");
    expect(report.recommendation).toContain("Exit on a close below support.");
    expect(report.recommendation).toContain(aiResult.strategyCommentary);
  });

  it("localizes the fixed strategy headings while leaving AI text unchanged", () => {
    const report = composeAiReport(aiResult, "zh-CN");

    expect(report.recommendation).toContain("### 持仓策略");
    expect(report.recommendation).toContain("### 左侧入场");
    expect(report.recommendation).toContain("### 右侧加仓");
    expect(report.recommendation).toContain("### 退出与止损");
    expect(report.recommendation).toContain("Hold with protection.");
  });
});
