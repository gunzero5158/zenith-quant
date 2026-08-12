import { describe, expect, it } from "vitest";
import {
  getAnalysisMarketDataPriority,
  getQuoteMarketDataPriority,
  isHongKongSymbol,
} from "../marketDataPriority";

describe("market data provider priority", () => {
  it("places both Yahoo providers after Tonghuashun for A-shares", () => {
    expect(getAnalysisMarketDataPriority("600519.SS", true)).toEqual([
      "eastmoney",
      "tonghuashun",
      "yahoo",
      "yahoo-chart",
      "optional-provider",
      "tencent",
    ]);
  });

  it("swaps Tencent and Tonghuashun positions for HK analysis", () => {
    expect(getAnalysisMarketDataPriority("0700.HK", false)).toEqual([
      "yahoo",
      "yahoo-chart",
      "eastmoney",
      "tencent",
      "optional-provider",
      "tonghuashun",
    ]);
  });

  it("recognizes normalized HK symbols for quote routing", () => {
    expect(isHongKongSymbol("0700.HK")).toBe(true);
    expect(isHongKongSymbol("AAPL")).toBe(false);
  });

  it("places Tonghuashun after Tencent for HK watchlist quotes", () => {
    expect(getQuoteMarketDataPriority("0700.HK")).toEqual([
      "kabutan",
      "ashare-realtime",
      "eastmoney",
      "yahoo",
      "optional-provider",
      "tencent",
      "tonghuashun",
    ]);
  });
});
