import { describe, expect, it } from "vitest";
import { EvidenceItem, EvidenceSnapshot, TradeLevel } from "../evidence";
import { calculateEntryAssessment } from "../scoring";

function evidence(
  id: string,
  family: EvidenceItem["family"],
  direction: EvidenceItem["direction"],
  state: string,
  values?: EvidenceItem["values"],
  barsSince?: number,
  provisional = false
): EvidenceItem {
  return {
    id,
    family,
    direction,
    state,
    values,
    barsSince,
    timeframe: "daily",
    label: id,
    description: id,
    provisional,
    reliability: provisional ? 0.65 : 0.9,
  };
}

const atr = () => evidence("daily.atr.flat", "atr", "neutral", "flat", { value: 2, percentOfPrice: 2 });
const freshMacd = () => evidence("daily.macd.golden_cross", "macd", "bullish", "golden_cross", undefined, 1);
const lowVolumePullback = () => evidence("daily.volume.neutral", "volume", "neutral", "neutral", {
  relativeVolume: 0.8,
  isLowVolumePullback: true,
  hasVolumeBreakout: false,
});

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
      atr(),
      evidence("daily.ema.bullish", "ema", "bullish", "bullish"),
      freshMacd(),
      lowVolumePullback(),
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
  it("rates a healthy pullback above an expired breakout", () => {
    const healthy = calculateEntryAssessment(snapshot());
    const expired = calculateEntryAssessment(snapshot({
      dailyPhase: "extended",
      levels: [
        { price: 96, kind: "support", source: "horizontal", strength: 0.8 },
        { price: 108, kind: "resistance", source: "horizontal", strength: 0.8 },
      ],
      items: [
        atr(),
        evidence("daily.ema.bullish", "ema", "bullish", "bullish"),
        evidence("daily.volume.bullish", "volume", "bullish", "bullish", { relativeVolume: 2.2, hasVolumeBreakout: true }),
      ],
    }));
    expect(healthy.leftStatus).toBe("triggered");
    expect(expired.rightStatus).toBe("too_late");
    expect(healthy.ruleScore).toBeGreaterThan(expired.ruleScore);
  });

  it("does not treat oversold oscillators in a falling knife as triggered left entry", () => {
    const result = calculateEntryAssessment(snapshot({
      weeklyRegime: "bearish",
      dailyPhase: "breakdown",
      items: [
        evidence("daily.atr.expanding", "atr", "neutral", "expanding", { value: 4, percentOfPrice: 4 }),
        evidence("daily.ema.bearish", "ema", "bearish", "bearish"),
        evidence("daily.rsi.oversold", "rsi", "bearish", "oversold", { value: 24 }),
        evidence("daily.kdj.bearish", "kdj", "bearish", "bearish", { zone: "low" }),
        evidence("daily.volume.bearish", "volume", "bearish", "bearish", { relativeVolume: 1.8 }),
      ],
      levels: [{ price: 92, kind: "support", source: "horizontal", strength: 0.5 }, { price: 112, kind: "resistance", source: "horizontal", strength: 0.6 }],
    }));
    expect(result.leftStatus).toBe("watch");
    expect(result.ruleScore).toBeLessThanOrEqual(2.9);
  });

  it("requires a fresh confirmation instead of treating an old cross as current", () => {
    const result = calculateEntryAssessment(snapshot({
      items: [atr(), lowVolumePullback(), evidence("daily.macd.golden_cross", "macd", "bullish", "golden_cross", undefined, 5)],
    }));
    expect(result.leftStatus).toBe("watch");
  });

  it("does not invent ATR distance or an ATR stop when ATR is unavailable", () => {
    const result = calculateEntryAssessment(snapshot({
      items: [freshMacd(), lowVolumePullback()],
    }));
    expect(result.riskPlan.stop).toBeUndefined();
    expect(result.leftStatus).toBe("not_formed");
    expect(result.hardCap).toBeLessThanOrEqual(2.5);
  });

  it("uses TD Buy 6-8 as low-weight watch evidence, not as a trigger", () => {
    const result = calculateEntryAssessment(snapshot({
      dailyPhase: "range",
      items: [atr(), evidence("daily.td.buy_setup_building", "tdSequential", "bullish", "building", { setup: "buy", stage: 6, completed: false })],
    }));
    expect(result.leftStatus).toBe("watch");
    expect(result.pathScores.left).toBeLessThanOrEqual(3.2);
  });

  it("marks a valid intraday TD reversal as provisional until the daily bar closes", () => {
    const items = [atr(), freshMacd(), evidence("daily.td.buy_setup_completed", "tdSequential", "bullish", "completed", { setup: "buy", stage: 9, completed: true }, 0, true)];
    const result = calculateEntryAssessment(snapshot({
      dataQuality: { ...snapshot().dataQuality, dailyBarComplete: false },
      items,
    }));
    expect(result.leftStatus).toBe("provisional");
    expect(result.activeSetup).toBe("left");
  });

  it("allows a typed horizontal breakout without requiring a classical pattern", () => {
    const baseItems = [
      atr(),
      evidence("daily.volume.bullish", "volume", "bullish", "bullish", { relativeVolume: 1.8, hasVolumeBreakout: true }),
    ];
    const baseSnapshot = snapshot({
      dailyPhase: "breakout",
      items: baseItems,
      levels: [
        { price: 99, kind: "support", source: "horizontal", strength: 0.8 },
        { price: 108, kind: "resistance", source: "horizontal", strength: 0.8 },
      ],
    });
    const confirmed = calculateEntryAssessment(baseSnapshot);
    const withSellNine = calculateEntryAssessment({
      ...baseSnapshot,
      items: [...baseItems, evidence("daily.td.sell_setup_completed", "tdSequential", "bearish", "completed", { setup: "sell", stage: 9, completed: true })],
    });
    expect(confirmed.rightStatus).toBe("triggered");
    expect(withSellNine.rightStatus).toBe("triggered");
    expect(withSellNine.pathScores.right).toBeLessThan(confirmed.pathScores.right);
  });

  it("penalizes price/OBV divergence without double-counting CMF and OBV", () => {
    const levels: TradeLevel[] = [
      { price: 99, kind: "support", source: "horizontal", strength: 0.8 },
      { price: 108, kind: "resistance", source: "horizontal", strength: 0.8 },
    ];
    const items = [
      atr(),
      evidence("daily.volume.bullish", "volume", "bullish", "bullish", { hasVolumeBreakout: true, hasPriceVolumeDivergence: false }),
      evidence("daily.cmf.rising", "cmf", "bullish", "rising"),
      evidence("daily.obv.rising", "obv", "bullish", "rising"),
    ];
    const aligned = calculateEntryAssessment(snapshot({ dailyPhase: "breakout", levels, items }));
    const divergent = calculateEntryAssessment(snapshot({
      dailyPhase: "breakout",
      levels,
      items: items.map((item) => item.family === "volume" ? { ...item, values: { ...item.values, hasPriceVolumeDivergence: true } } : item),
    }));
    expect(divergent.pathScores.right).toBeLessThan(aligned.pathScores.right);
  });

  it("reduces unfinished weekly context instead of awarding full resonance", () => {
    const complete = calculateEntryAssessment(snapshot());
    const provisional = calculateEntryAssessment(snapshot({
      dataQuality: { ...snapshot().dataQuality, weeklyBarComplete: false },
    }));
    expect(provisional.pathScores.left).toBeLessThan(complete.pathScores.left);
  });

  it("treats a forming Chanlun bottom as watch evidence rather than confirmation", () => {
    const result = calculateEntryAssessment(snapshot({
      dailyPhase: "range",
      items: [atr(), evidence("daily.chanlun.forming_bottom", "chanlun", "bullish", "forming_bottom")],
    }));
    expect(result.leftStatus).toBe("watch");
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
    ["missing target", [{ price: 98, kind: "support", source: "ema", strength: 0.8 }] as TradeLevel[], 2.8],
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
    expect(noisy.ruleScore - base.ruleScore).toBeCloseTo(0.3, 5);
  });
});
