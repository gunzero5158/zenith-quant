import { describe, expect, it } from "vitest";

import { buildYahooChartCandles } from "../yahooChartCandles";

// APP on 2026-09-23: Yahoo returned the 09-22 bar with a null close while meta held the 328.73 close.
const timestamps = [1790083800 - 86400, 1790083800];
const quote = {
  open: [309.69, 333.57],
  high: [336.94, 333.57],
  low: [306.8, 323.68],
  close: [330.17, null],
  volume: [5991100, 3368623],
};

describe("buildYahooChartCandles", () => {
  it("completes a trailing bar with a null close from the market quote", () => {
    const candles = buildYahooChartCandles(timestamps, quote, {
      regularMarketPrice: 328.73,
      regularMarketTime: 1790107200,
    });

    expect(candles).toHaveLength(2);
    expect(candles[1]).toEqual({
      date: "2026-09-22",
      open: 333.57,
      high: 333.57,
      low: 323.68,
      close: 328.73,
      volume: 3368623,
    });
  });

  it("fills missing trailing fields from meta and keeps high/low consistent", () => {
    const candles = buildYahooChartCandles(
      timestamps,
      { ...quote, open: [309.69, null], high: [336.94, null], low: [306.8, null], volume: [5991100, null] },
      {
        regularMarketPrice: 328.73,
        regularMarketTime: 1790107200,
        regularMarketDayHigh: 333.57,
        regularMarketDayLow: 323.68,
        regularMarketVolume: 3368623,
      },
    );

    expect(candles[1]).toMatchObject({ open: 328.73, high: 333.57, low: 323.68, close: 328.73, volume: 3368623 });
  });

  it("does not use the quote when it predates the trailing bar", () => {
    const candles = buildYahooChartCandles(timestamps, quote, {
      regularMarketPrice: 328.73,
      regularMarketTime: timestamps[1] - 1,
    });

    expect(candles.map((candle) => candle.date)).toEqual(["2026-09-21"]);
  });

  it("still skips incomplete bars that are not the latest one", () => {
    const candles = buildYahooChartCandles(
      timestamps,
      { ...quote, close: [null, 328.73] },
      { regularMarketPrice: 328.73, regularMarketTime: 1790107200 },
    );

    expect(candles.map((candle) => candle.date)).toEqual(["2026-09-22"]);
  });
});
