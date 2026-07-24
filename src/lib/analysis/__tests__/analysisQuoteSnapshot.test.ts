import { describe, expect, it } from "vitest";

import {
  applyAnalysisQuoteSnapshot,
  parseAnalysisQuoteSnapshot,
} from "../analysisQuoteSnapshot";

describe("analysis quote snapshot", () => {
  it("accepts a finite quote only for the requested symbol", () => {
    expect(parseAnalysisQuoteSnapshot({
      symbol: "688048.ss",
      price: 297.49,
      change: 1.52,
    }, "688048.SS")).toEqual({
      symbol: "688048.SS",
      price: 297.49,
      change: 1.52,
    });

    expect(parseAnalysisQuoteSnapshot({
      symbol: "600519.SS",
      price: 297.49,
      change: 1.52,
    }, "688048.SS")).toBeNull();
    expect(parseAnalysisQuoteSnapshot({
      symbol: "688048.SS",
      price: -1,
      change: 1.52,
    }, "688048.SS")).toBeNull();
  });

  it("overrides display fields while retaining full realtime candle metadata", () => {
    const quote = applyAnalysisQuoteSnapshot({
      source: "tonghuashun",
      price: 295.37,
      changePercent: 0.8,
      date: "2026-07-24",
      open: 290,
      high: 301,
      low: 288,
      previousClose: 293,
      volume: 1000,
    }, {
      symbol: "688048.SS",
      price: 297.49,
      change: 1.52,
    }, "2026-07-24");

    expect(quote).toEqual({
      source: "tonghuashun",
      price: 297.49,
      changePercent: 1.52,
      date: "2026-07-24",
      open: 290,
      high: 301,
      low: 288,
      previousClose: 293,
      volume: 1000,
    });
  });

  it("creates a current-day quote when the server provider is unavailable", () => {
    expect(applyAnalysisQuoteSnapshot(null, {
      symbol: "688048.SS",
      price: 297.49,
      change: 1.52,
    }, "2026-07-24")).toEqual({
      source: "quote-api",
      price: 297.49,
      changePercent: 1.52,
      date: "2026-07-24",
    });
  });
});
