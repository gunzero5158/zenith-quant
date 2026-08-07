import { describe, expect, it } from "vitest";
import { buildEvidenceSnapshot, EvidenceBuilderInput } from "../evidenceBuilder";
import { SIGNAL_FAMILIES } from "../evidence";
import { VolumeAnalysisResult } from "../volumeForce";

function volume(overrides: Partial<VolumeAnalysisResult> = {}): VolumeAnalysisResult {
  return {
    obv: [0, 1],
    cmf: [0, 0.1],
    volume20SMA: [100, 100],
    isVolumeExpanding: false,
    hasVolumeBreakout: false,
    hasPriceVolumeDivergence: false,
    relativeVolume: 1,
    volumeDirection: "neutral",
    cmfTrend: "flat",
    obvTrend: "flat",
    isLowVolumePullback: false,
    volumeDescription: "test",
    ...overrides,
  };
}

function fixture(overrides: Partial<EvidenceBuilderInput> = {}): EvidenceBuilderInput {
  return {
    symbol: "300757.SZ",
    price: 100,
    dataQuality: {
      asOf: "2026-07-23T06:00:00.000Z",
      latestDailyDate: "2026-07-23",
      latestWeeklyDate: "2026-07-20",
      dailyBarComplete: false,
      weeklyBarComplete: false,
      dailySamples: 250,
      weeklySamples: 120,
      missingFamilies: [],
      scoreCap: 5,
      warnings: [],
    },
    ...overrides,
  };
}

describe("unified evidence snapshot", () => {
  it("emits every catalog family as active, neutral, or insufficient", () => {
    const snapshot = buildEvidenceSnapshot(fixture());
    expect(new Set(snapshot.items.map((item) => item.family))).toEqual(new Set(SIGNAL_FAMILIES));
  });

  it("combines three bottom divergences into one momentum score candidate", () => {
    const snapshot = buildEvidenceSnapshot(fixture({
      patterns: {
        macdDivergence: "bottom",
        rsiDivergence: "bottom",
        kdjDivergence: "bottom",
      },
    }));
    const divergences = snapshot.items.filter((item) => item.id === "daily.momentum.bottom_divergence");
    expect(divergences).toHaveLength(1);
    expect(divergences[0].values).toMatchObject({ sources: "macd,rsi,kdj" });
  });

  it("keeps EMA, VPVR, Fibonacci, and horizontal levels typed", () => {
    const snapshot = buildEvidenceSnapshot(fixture({
      levels: [
        { price: 98, kind: "support", source: "ema", strength: 0.6 },
        { price: 96, kind: "support", source: "vpvr", strength: 0.8 },
        { price: 94, kind: "support", source: "horizontal", strength: 0.7 },
      ],
      patterns: {
        fibonacci: {
          anchorStartIndex: 70,
          anchorEndIndex: 102,
          direction: "up",
          levels: [{ label: "61.8%", price: 92 }],
        },
      },
    }));

    expect(snapshot.levels.map((level) => level.source)).toEqual(
      expect.arrayContaining(["ema", "vpvr", "fibonacci", "horizontal"])
    );
  });

  it("emits an in-progress TD setup from stage 6 onward", () => {
    const snapshot = buildEvidenceSnapshot(fixture({ patterns: { latestCount: -7 } }));
    expect(snapshot.items.find((item) => item.id === "daily.td.buy_setup_building")).toMatchObject({
      state: "building",
      direction: "bullish",
      values: { setup: "buy", stage: 7, completed: false },
    });
  });

  it("preserves breakout facts in the unified volume evidence", () => {
    const snapshot = buildEvidenceSnapshot(fixture({
      daily: { volume: volume({ hasVolumeBreakout: true, isVolumeExpanding: true, volumeDirection: "bullish" }) },
    }));
    expect(snapshot.items.find((item) => item.family === "volume")?.values).toMatchObject({
      hasVolumeBreakout: true,
      isVolumeExpanding: true,
    });
  });

  it("does not classify BOLL above-upper as extended without corroboration", () => {
    const snapshot = buildEvidenceSnapshot(fixture({
      daily: {
        boll: { available: true, provisional: true, position: "above_upper", percentB: 106, bandwidth: 8, bandwidthTrend: "flat" },
        rsi: { available: true, provisional: true, value: 64, zone: "neutral_strong", thresholdCross: "none", slope: "rising" },
        volume: volume(),
      },
    }));
    expect(snapshot.dailyPhase).toBe("range");
  });

  it("recognizes a volume-confirmed horizontal breakout without a classical pattern", () => {
    const snapshot = buildEvidenceSnapshot(fixture({
      daily: {
        atr: { available: true, provisional: true, value: 2, percentOfPrice: 2, direction: "flat" },
        volume: volume({ hasVolumeBreakout: true, volumeDirection: "bullish", relativeVolume: 1.8 }),
      },
      levels: [{ price: 99, kind: "support", source: "horizontal", strength: 0.8 }],
    }));
    expect(snapshot.dailyPhase).toBe("breakout");
  });

  it("does not build a risk plan from a failed pattern", () => {
    const snapshot = buildEvidenceSnapshot(fixture({
      patterns: {
        activePatterns: [{
          key: "doubleBottom",
          name: "Double bottom",
          bias: "bullish",
          confidence: 0.8,
          description: "failed",
          status: "failed",
          triggerPrice: 101,
          targetPrice: 112,
          invalidationPrice: 94,
        }],
      },
    }));
    expect(snapshot.levels.filter((level) => level.source === "pattern")).toHaveLength(0);
  });
});
