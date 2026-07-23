import { describe, expect, it } from "vitest";
import { runAnalysisEngine } from "../analysisEngine";
import { buildEvidenceAnalystPrompt } from "../analysisPrompt";
import { Candle } from "../indicators";

function tradingDays(count: number): Candle[] {
  const candles: Candle[] = [];
  const start = new Date("2026-04-01T00:00:00Z");
  let cursor = new Date(start);
  while (candles.length < count) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) {
      const index = candles.length;
      const close = 90 + index * 0.25 + Math.sin(index / 4);
      candles.push({
        date: cursor.toISOString().slice(0, 10),
        open: close - 0.4,
        high: close + 1,
        low: close - 1,
        close,
        volume: 1000 + index * 10,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  candles[candles.length - 3] = { ...candles.at(-3)!, date: "2026-07-20", close: 108, high: 109, low: 105 };
  candles[candles.length - 2] = { ...candles.at(-2)!, date: "2026-07-21", open: 108, close: 111, high: 112, low: 107 };
  candles[candles.length - 1] = { ...candles.at(-1)!, date: "2026-07-23", open: 111, close: 114, high: 115, low: 110 };
  return candles;
}

describe("pure analysis engine", () => {
  it("builds one coherent realtime snapshot for indicators, score, strategy, and report", () => {
    const result = runAnalysisEngine({
      symbol: "300757.SZ",
      dailyCandles: tradingDays(80),
      weeklyCandles: [
        { date: "2026-07-13", open: 100, high: 110, low: 95, close: 105, volume: 5000 },
        { date: "2026-07-20", open: 105, high: 108, low: 101, close: 102, volume: 2000 },
      ],
      asOf: "2026-07-23T06:00:00.000Z",
      language: "zh-CN",
    });

    expect(result.weeklyCandles.at(-1)?.close).toBe(114);
    expect(result.snapshot.price).toBe(114);
    expect(result.entryAssessment.ruleScore).toBe(result.legacyScore.totalScore);
    expect(result.localReport.recommendation).toContain(result.strategyAdvice.exitStop.text);
    expect(result.snapshot.dataQuality.dailyBarComplete).toBe(false);

    const prompt = buildEvidenceAnalystPrompt({
      snapshot: result.snapshot,
      entryAssessment: result.entryAssessment,
      strategyAdvice: result.strategyAdvice,
      dailyCandles: result.dailyCandles,
      weeklyCandles: result.weeklyCandles,
      language: "zh-CN",
      currencySymbol: "¥",
    });
    expect(prompt).toContain("MACD, KDJ, RSI");
    expect(prompt).toContain("Ichimoku");
    expect(prompt).toContain("Fibonacci");
    expect(prompt).toContain("TD Sequential");
    expect(prompt).toContain("weeklyBarComplete");
    expect(prompt).toContain(result.snapshot.items[0].id);
    expect(prompt).toContain('"hardCap"');
  });
});
