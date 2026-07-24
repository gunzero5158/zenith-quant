import { describe, expect, it } from "vitest";
import { EvidenceItem, EvidenceSnapshot, TradeLevel } from "../evidence";
import { calculateEntryAssessment } from "../scoring";

function evidence(
  id: string,
  family: EvidenceItem["family"],
  direction: EvidenceItem["direction"],
  state: string,
  values?: EvidenceItem["values"]
): EvidenceItem {
  return { id, family, direction, state, values, timeframe: "daily", label: id, description: id, provisional: false, reliability: 0.9 };
}

function snapshot(overrides: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot {
  return {
    version: "2.0",
    symbol: "300757.SZ",
    price: 100,
    dataQuality: {
      asOf: "2026-07-23T08:00:00.000Z",
      dailyBarComplete: true,
      weeklyBarComplete: true,
      dailySamples: 250,
      weeklySamples: 120,
      missingFamilies: [],
      scoreCap: 5,
      warnings: [],
    },
    items: [
      evidence("daily.atr.flat", "atr", "neutral", "flat", { value: 2, percentOfPrice: 2 }),
      evidence("daily.ema.bullish", "ema", "bullish", "bullish"),
      evidence("daily.macd.golden_cross", "macd", "bullish", "golden_cross"),
      evidence("daily.volume.neutral", "volume", "neutral", "neutral", { relativeVolume: 0.8, isLowVolumePullback: true }),
    ],
    levels: [
      { price: 98, kind: "support", source: "ema", strength: 0.8 },
      { price: 108, kind: "resistance", source: "horizontal", strength: 0.8 },
    ],
    weeklyRegime: "bullish",
    dailyPhase: "pullback",
    ...overrides,
  };
}

describe("gated entry assessment", () => {
  it("rates a healthy pullback above an extended high-volume rally", () => {
    const healthy = calculateEntryAssessment(snapshot());
    const extended = calculateEntryAssessment(snapshot({
      dailyPhase: "extended",
      levels: [
        { price: 90, kind: "support", source: "ema", strength: 0.7 },
        { price: 103, kind: "resistance", source: "horizontal", strength: 0.8 },
      ],
      items: [
        evidence("daily.atr.expanding", "atr", "neutral", "expanding", { value: 2, percentOfPrice: 2 }),
        evidence("daily.ema.bullish", "ema", "bullish", "bullish"),
        evidence("daily.volume.bullish", "volume", "bullish", "bullish", { relativeVolume: 2.2 }),
      ],
    }));
    expect(healthy.ruleScore).toBeGreaterThan(extended.ruleScore);
    expect(extended.rightStatus).toBe("too_late");
  });

  it("does not treat oversold oscillators in a falling knife as triggered left entry", () => {
    const result = calculateEntryAssessment(snapshot({
      weeklyRegime: "bearish",
      dailyPhase: "breakdown",
      items: [
        evidence("daily.atr.expanding", "atr", "neutral", "expanding", { value: 4, percentOfPrice: 4 }),
        evidence("daily.ema.bearish", "ema", "bearish", "bearish"),
        evidence("daily.rsi.oversold", "rsi", "bearish", "oversold", { value: 24 }),
        evidence("daily.kdj.low", "kdj", "bullish", "low"),
        evidence("daily.volume.bearish", "volume", "bearish", "bearish", { relativeVolume: 1.8 }),
      ],
      levels: [{ price: 92, kind: "support", source: "horizontal", strength: 0.5 }, { price: 112, kind: "resistance", source: "horizontal", strength: 0.6 }],
    }));
    expect(result.leftStatus).toBe("watch");
    expect(result.ruleScore).toBeLessThanOrEqual(2.9);
  });

  it("makes bearish volume and a confirmed top lower the actual score", () => {
    const neutral = calculateEntryAssessment(snapshot());
    const bearish = calculateEntryAssessment(snapshot({
      items: [
        ...snapshot().items,
        evidence("daily.volume.bearish", "volume", "bearish", "bearish", { relativeVolume: 1.8 }),
        evidence("daily.pattern.doubleTop.confirmed", "classicalPattern", "bearish", "confirmed"),
      ],
    }));
    expect(bearish.ruleScore).toBeLessThan(neutral.ruleScore);
  });

  it.each([
    ["missing stop", [] as TradeLevel[], 2.5],
    ["reward risk below one", [{ price: 98, kind: "support", source: "ema", strength: 0.8 }, { price: 101, kind: "resistance", source: "horizontal", strength: 0.8 }] as TradeLevel[], 2.4],
    ["reward risk below one point five", [{ price: 98, kind: "support", source: "ema", strength: 0.8 }, { price: 104, kind: "resistance", source: "horizontal", strength: 0.8 }] as TradeLevel[], 3.2],
  ])("applies the %s hard cap", (_name, levels, cap) => {
    const result = calculateEntryAssessment(snapshot({ levels }));
    expect(result.hardCap).toBeLessThanOrEqual(cap);
    expect(result.ruleScore).toBeLessThanOrEqual(cap);
  });

  it("caps an extended climax at 2.8", () => {
    const result = calculateEntryAssessment(snapshot({ dailyPhase: "extended" }));
    expect(result.hardCap).toBeLessThanOrEqual(2.8);
    expect(result.ruleScore).toBeLessThanOrEqual(2.8);
  });

  it("does not let holder-only strength or duplicate divergence sources inflate entry score", () => {
    const base = calculateEntryAssessment(snapshot());
    const noisy = calculateEntryAssessment(snapshot({
      items: [
        ...snapshot().items,
        evidence("daily.holder.strong_trend", "ema", "bullish", "holder_only"),
        evidence("daily.momentum.bottom_divergence", "macd", "bullish", "bottom_divergence", { sources: "macd,rsi,kdj" }),
        evidence("daily.momentum.bottom_divergence.copy", "rsi", "bullish", "bottom_divergence", { sources: "rsi" }),
      ],
    }));
    expect(noisy.ruleScore - base.ruleScore).toBeLessThanOrEqual(0.3);
  });
});
