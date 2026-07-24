import { describe, expect, it } from "vitest";
import { SIGNAL_CATALOG } from "../evidence";
import { EvidenceBuilderInput, buildEvidenceSnapshot } from "../evidenceBuilder";
import { generateLocalReport } from "../fallbackReport";
import { calculateEntryAssessment } from "../scoring";
import { buildStrategyAdvice } from "../strategyAdvice";

function reportFixture() {
  const input: EvidenceBuilderInput = {
    symbol: "300757.SZ",
    price: 100,
    dataQuality: { asOf: "2026-07-23T08:00:00Z", dailyBarComplete: true, weeklyBarComplete: true, dailySamples: 250, weeklySamples: 120, missingFamilies: [], scoreCap: 5, warnings: [] },
    daily: {
      macd: { available: true, provisional: false, relation: "bearish", cross: "death", barsSinceCross: 0, zone: "above_zero", histogramTrend: "expanding", dif: 1, dea: 1.2, histogram: -0.4 },
      atr: { available: true, provisional: false, value: 2, percentOfPrice: 2, direction: "flat" },
    },
    levels: [{ price: 96, kind: "support", source: "horizontal", strength: 0.8 }, { price: 108, kind: "resistance", source: "horizontal", strength: 0.8 }],
  };
  const snapshot = buildEvidenceSnapshot(input);
  const entryAssessment = calculateEntryAssessment(snapshot);
  const strategyAdvice = buildStrategyAdvice(snapshot, entryAssessment);
  return { snapshot, entryAssessment, strategyAdvice };
}

describe("evidence-based local report", () => {
  it("describes actual evidence instead of inferring indicators from total score", () => {
    const report = generateLocalReport(reportFixture(), "zh-CN");
    expect(report.technicalAnalysis).toContain("MACD死叉");
    expect(report.technicalAnalysis).not.toContain("MACD金叉");
  });

  it("covers every signal catalog section without AI", () => {
    const report = generateLocalReport(reportFixture(), "zh-CN");
    for (const section of new Set(SIGNAL_CATALOG.map((item) => item.reportSection))) {
      expect(report.technicalAnalysis).toContain(section);
    }
  });

  it("keeps score composition out of the report overview", () => {
    const report = generateLocalReport(reportFixture(), "zh-CN");
    expect(report.overview).not.toContain("规则基础分");
    expect(report.overview).not.toContain("AI +");
    expect(report.overview).not.toContain("最终综合分");
  });

  it("localizes the fallback overview price line", () => {
    expect(generateLocalReport(reportFixture(), "zh-CN").overview).toContain("当前价格 100.00");
    expect(generateLocalReport(reportFixture(), "zh-TW").overview).toContain("目前價格 100.00");
    expect(generateLocalReport(reportFixture(), "en").overview).toContain("Current price 100.00");
    expect(generateLocalReport(reportFixture(), "ja").overview).toContain("現在値 100.00");
  });
});
