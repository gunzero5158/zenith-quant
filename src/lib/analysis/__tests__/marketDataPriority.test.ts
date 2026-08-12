import { describe, expect, it } from "vitest";
import {
  getMarketDataPriority,
  getMarketRegion,
  getRealtimeQuotePriority,
} from "../marketDataPriority";

describe("market data provider priorities", () => {
  it.each([
    ["600519.SS", "a-share"],
    ["000001.SZ", "a-share"],
    ["0700.HK", "hong-kong"],
    ["7203.T", "japan"],
    ["AAPL", "united-states"],
  ] as const)("classifies %s as %s", (symbol, market) => {
    expect(getMarketRegion(symbol)).toBe(market);
  });

  it.each([
    ["600519.SS", ["eastmoney", "tonghuashun", "tencent", "yahoo", "yahoo-chart", "optional-provider"]],
    ["0700.HK", ["eastmoney", "tencent", "yahoo", "yahoo-chart", "tonghuashun", "optional-provider"]],
    ["7203.T", ["yahoo", "yahoo-chart", "kabutan", "optional-provider"]],
    ["AAPL", ["yahoo", "yahoo-chart", "tencent", "eastmoney", "tonghuashun", "optional-provider"]],
  ] as const)("uses the requested order for %s", (symbol, expected) => {
    expect(getMarketDataPriority(symbol)).toEqual(expected);
  });

  it.each([
    ["600519.SS", ["eastmoney", "tonghuashun", "tencent", "yahoo", "optional-provider"]],
    ["0700.HK", ["eastmoney", "tencent", "yahoo", "tonghuashun", "optional-provider"]],
    ["7203.T", ["yahoo", "kabutan", "optional-provider"]],
    ["AAPL", ["yahoo", "tencent", "eastmoney", "tonghuashun", "optional-provider"]],
  ] as const)("uses the matching realtime order for %s", (symbol, expected) => {
    expect(getRealtimeQuotePriority(symbol)).toEqual(expected);
  });
});
