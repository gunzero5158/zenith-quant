import { describe, expect, it } from "vitest";
import type { EvidenceSnapshot } from "../evidence";
import { buildAiNativeAnalystPrompt } from "../aiNativeAnalysisPrompt";

const snapshot: EvidenceSnapshot = {
  version: "2.0",
  symbol: "TEST",
  price: 100,
  dataQuality: {
    asOf: "2026-08-13T06:00:00.000Z",
    dailyBarComplete: true,
    weeklyBarComplete: false,
    dailySamples: 120,
    weeklySamples: 60,
    missingFamilies: [],
    scoreCap: 3.2,
    warnings: [],
  },
  items: [{
    id: "daily.ema.bullish",
    family: "ema",
    timeframe: "daily",
    direction: "bullish",
    state: "bullish",
    label: "EMA",
    description: "EMA order is bullish.",
    provisional: false,
    reliability: 0.9,
  }],
  levels: [
    { price: 95, kind: "support", source: "horizontal", strength: 0.8 },
    { price: 110, kind: "resistance", source: "horizontal", strength: 0.8 },
  ],
  weeklyRegime: "bearish",
  dailyPhase: "range",
};

describe("AI-native analyst prompt", () => {
  it("supplies objective evidence without leaking rule conclusions or caps", () => {
    const prompt = buildAiNativeAnalystPrompt({
      snapshot,
      dailyCandles: [],
      weeklyCandles: [],
      language: "zh-CN",
      currencySymbol: "¥",
    });

    expect(prompt).toContain("sole decision-maker");
    expect(prompt).toContain("daily.ema.bullish");
    expect(prompt).not.toContain('"weeklyRegime":"bearish"');
    expect(prompt).not.toContain('"dailyPhase":"range"');
    expect(prompt).not.toContain('"scoreCap":3.2');
    expect(prompt).not.toContain("ruleScore");
    expect(prompt).not.toContain("hardCap");
  });
});
