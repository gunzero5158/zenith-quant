import { describe, expect, it } from "vitest";
import {
  analyzeAtr,
  analyzeBoll,
  analyzeEma,
  analyzeIchimoku,
  analyzeKdj,
  analyzeMacd,
  analyzeRsi,
} from "../technicalSignals";

describe("technical signal events", () => {
  it("distinguishes a fresh MACD golden cross from an existing bullish relation", () => {
    expect(analyzeMacd([-0.4, -0.1], [-0.3, -0.2], [-0.2, 0.2], 1, false)).toMatchObject({
      relation: "bullish",
      cross: "golden",
      barsSinceCross: 0,
      zone: "below_zero",
      histogramTrend: "expanding",
      provisional: false,
    });

    expect(analyzeMacd([0.1, 0.2, 0.3], [0, 0.1, 0.2], [0.2, 0.2, 0.2], 2, false)).toMatchObject({
      relation: "bullish",
      cross: "none",
    });
  });

  it("detects a KDJ high-zone death cross without relabeling an old bearish relation", () => {
    expect(analyzeKdj([85, 78], [82, 80], [91, 74], 1, true)).toMatchObject({
      relation: "bearish",
      cross: "death",
      barsSinceCross: 0,
      zone: "high",
      provisional: true,
    });

    expect(analyzeKdj([75, 70, 65], [80, 78, 74], [65, 54, 47], 2, false)).toMatchObject({
      relation: "bearish",
      cross: "none",
    });
  });

  it("detects RSI14 threshold crossings instead of treating zones as events", () => {
    expect(analyzeRsi([27, 32], 1, false)).toMatchObject({
      value: 32,
      zone: "neutral_weak",
      thresholdCross: "up_30",
      barsSinceCross: 0,
      slope: "rising",
    });
    expect(analyzeRsi([52, 48], 1, false)).toMatchObject({
      zone: "neutral_weak",
      thresholdCross: "down_50",
      slope: "falling",
    });
    expect(analyzeRsi([72, 73], 1, false).thresholdCross).toBe("none");
  });

  it("summarizes EMA order and slope from aligned values", () => {
    expect(analyzeEma({
      price: 110,
      ema5: [100, 103],
      ema10: [98, 101],
      ema20: [96, 99],
      ema60: [90, 92],
      index: 1,
      provisional: false,
    })).toMatchObject({
      order: "bullish",
      pricePosition: "above_all",
      slopes: { ema5: "rising", ema10: "rising", ema20: "rising", ema60: "rising" },
    });
  });

  it("reports BOLL position/width, ATR risk and Ichimoku cloud state", () => {
    expect(analyzeBoll({
      price: 108,
      middle: [100, 101],
      upper: [110, 111],
      lower: [90, 91],
      index: 1,
      provisional: false,
    })).toMatchObject({ position: "upper_half", bandwidthTrend: "flat" });

    expect(analyzeAtr([2, 2.5], 100, 1, false)).toMatchObject({
      value: 2.5,
      percentOfPrice: 2.5,
      direction: "expanding",
    });

    expect(analyzeIchimoku({
      price: 110,
      tenkan: [98, 104],
      kijun: [100, 102],
      spanA: [99, 103],
      spanB: [97, 101],
      index: 1,
      provisional: false,
    })).toMatchObject({
      priceVsCloud: "above",
      lineRelation: "bullish",
      cross: "golden",
      cloudBias: "bullish",
    });
  });

  it("returns insufficient when the requested index has no finite values", () => {
    expect(analyzeMacd([Number.NaN], [Number.NaN], [Number.NaN], 0, false).available).toBe(false);
    expect(analyzeRsi([], 0, false).available).toBe(false);
  });
});
