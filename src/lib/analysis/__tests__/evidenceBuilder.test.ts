import { describe, expect, it } from "vitest";
import { buildEvidenceSnapshot, EvidenceBuilderInput } from "../evidenceBuilder";
import { SIGNAL_FAMILIES } from "../evidence";

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
});
