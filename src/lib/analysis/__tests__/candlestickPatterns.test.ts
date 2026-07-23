import { describe, expect, it } from "vitest";
import { Candle } from "../indicators";
import { TradeLevel } from "../evidence";
import {
  CANDLESTICK_PATTERN_IDS,
  detectCandlestickPatterns,
} from "../candlestickPatterns";

const EXPECTED_IDS = [
  "hammer", "invertedHammer", "bullishEngulfing", "piercingLine", "morningStar", "bullishHarami",
  "hangingMan", "shootingStar", "bearishEngulfing", "darkCloudCover", "eveningStar", "bearishHarami",
  "threeWhiteSoldiers", "threeBlackCrows", "bullishMarubozu", "bearishMarubozu",
  "gapUp", "gapDown", "insideBar", "outsideBar", "doji", "spinningTop", "longUpperShadow", "longLowerShadow",
] as const;

function candle(open: number, high: number, low: number, close: number, index: number): Candle {
  return { date: `2026-07-${String(index + 1).padStart(2, "0")}`, open, high, low, close, volume: 1000 };
}

function support(price: number): TradeLevel {
  return { price, kind: "support", source: "horizontal", strength: 0.8 };
}

describe("contextual candlestick patterns", () => {
  it("keeps the approved pattern catalog exhaustive", () => {
    expect(CANDLESTICK_PATTERN_IDS).toEqual(EXPECTED_IDS);
  });

  it("detects a hammer only after decline and near support", () => {
    const decline = [
      candle(105, 106, 102, 103, 0), candle(103, 104, 99, 100, 1),
      candle(100, 101, 96, 97, 2), candle(97, 98, 93, 94, 3),
      candle(93.8, 95, 90, 94.7, 4),
    ];
    const result = detectCandlestickPatterns(decline, Array(5).fill(2), [support(91)]);
    expect(result[0]).toMatchObject({ id: "hammer", bias: "bullish", location: "support", barsSince: 0 });

    const rally = decline.map((item, index) => ({ ...item, open: 90 + index * 2, close: 91 + index * 2, high: 92 + index * 2, low: 89 + index * 2 }));
    rally[4] = candle(99, 100, 95, 99.7, 4);
    expect(detectCandlestickPatterns(rally, Array(5).fill(2), []).some((item) => item.id === "hammer")).toBe(false);
  });

  it("deduplicates neutral shadows when a contextual reversal owns the same bar", () => {
    const candles = [
      candle(105, 106, 102, 103, 0), candle(103, 104, 99, 100, 1),
      candle(100, 101, 96, 97, 2), candle(97, 98, 93, 94, 3),
      candle(93.8, 94.5, 90, 94.2, 4),
    ];
    const result = detectCandlestickPatterns(candles, Array(5).fill(2), [support(91)]);
    expect(result.filter((item) => item.endIndex === 4)).toHaveLength(1);
    expect(result[0].id).toBe("hammer");
  });

  it("detects two- and three-candle reversals", () => {
    const engulfing = [
      candle(105, 106, 101, 102, 0), candle(102, 103, 98, 99, 1),
      candle(99, 100, 95, 96, 2), candle(95, 101, 94, 100, 3),
    ];
    expect(detectCandlestickPatterns(engulfing, Array(4).fill(3), [support(95)])[0]?.id).toBe("bullishEngulfing");

    const morningStar = [
      candle(106, 107, 100, 101, 0), candle(101, 102, 99.5, 100.3, 1), candle(100, 106, 99, 105, 2),
    ];
    expect(detectCandlestickPatterns(morningStar, Array(3).fill(4), [support(100)])[0]?.id).toBe("morningStar");
  });

  it("downgrades three white soldiers to extended when far above EMA20", () => {
    const soldiers = [
      candle(100, 104.5, 99.5, 104, 0), candle(103, 108.5, 102.5, 108, 1), candle(107, 112.5, 106.5, 112, 2),
    ];
    const result = detectCandlestickPatterns(soldiers, Array(3).fill(2), [], { ema20: [100, 101, 102] });
    expect(result[0]).toMatchObject({ id: "threeWhiteSoldiers", state: "extended" });
  });
});
