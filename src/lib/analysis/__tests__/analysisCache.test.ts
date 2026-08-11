import { describe, expect, it } from "vitest";
import {
  ACTIVE_MARKET_ANALYSIS_MAX_AGE_MS,
  ANALYSIS_REPORT_CACHE_VERSION,
  isAnalysisCacheCompatible,
  isAnalysisCacheLanguageCompatible,
  isAnalysisCacheReusableByTime,
  isAnalysisCacheVersionCompatible,
  isAShareAnalysisCacheReusable,
  isAShareSymbol,
  isMarketTrading,
  isMarketDataCacheReusable,
  isSameMarketDate,
  type AShareAnalysisCacheCandidate,
} from "../analysisCache";

describe("analysis report cache language", () => {
  it("reuses reports only when the generated and requested languages match", () => {
    expect(isAnalysisCacheLanguageCompatible("zh-CN", "zh-CN")).toBe(true);
    expect(isAnalysisCacheLanguageCompatible("zh-CN", "en")).toBe(false);
    expect(isAnalysisCacheLanguageCompatible(undefined, "zh-CN")).toBe(false);
  });
});

describe("analysis report cache schema", () => {
  it("invalidates reports generated before user-visible evidence IDs were removed", () => {
    expect(isAnalysisCacheVersionCompatible(undefined)).toBe(false);
    expect(isAnalysisCacheVersionCompatible(1)).toBe(false);
    expect(isAnalysisCacheVersionCompatible(ANALYSIS_REPORT_CACHE_VERSION)).toBe(true);
  });

  it("checks schema and language together", () => {
    expect(isAnalysisCacheCompatible(ANALYSIS_REPORT_CACHE_VERSION, "en", "en")).toBe(true);
    expect(isAnalysisCacheCompatible(ANALYSIS_REPORT_CACHE_VERSION, "en", "ja")).toBe(false);
    expect(isAnalysisCacheCompatible(1, "en", "en")).toBe(false);
  });
});

const beijingTime = (value: string): number => Date.parse(`${value}+08:00`);

function candidate(
  overrides: Partial<AShareAnalysisCacheCandidate> = {}
): AShareAnalysisCacheCandidate {
  return {
    symbol: "300757.SZ",
    cacheTimestamp: beijingTime("2026-07-22T11:31:00"),
    nowTimestamp: beijingTime("2026-07-22T12:00:00"),
    cachedQuote: { price: 430.98, change: -2.05 },
    latestQuote: { price: 430.98, change: -2.05 },
    ...overrides,
  };
}

describe("A-share analysis cache policy", () => {
  it("recognizes supported A-share symbol formats", () => {
    expect(isAShareSymbol("300757.SZ")).toBe(true);
    expect(isAShareSymbol("600519.SS")).toBe(true);
    expect(isAShareSymbol("SZ300757")).toBe(true);
    expect(isAShareSymbol("300757")).toBe(true);
    expect(isAShareSymbol("0700.HK")).toBe(false);
  });

  it("rejects a lunch-break cache created before the morning session ended", () => {
    expect(isAShareAnalysisCacheReusable(candidate({
      cacheTimestamp: beijingTime("2026-07-22T11:29:59"),
    }))).toBe(false);

    expect(isAShareAnalysisCacheReusable(candidate({
      cacheTimestamp: beijingTime("2026-07-22T11:30:01"),
    }))).toBe(true);
  });

  it("rejects a post-close cache created before the afternoon session ended", () => {
    const afterClose = beijingTime("2026-07-22T15:10:00");

    expect(isAShareAnalysisCacheReusable(candidate({
      nowTimestamp: afterClose,
      cacheTimestamp: beijingTime("2026-07-22T14:59:59"),
    }))).toBe(false);

    expect(isAShareAnalysisCacheReusable(candidate({
      nowTimestamp: afterClose,
      cacheTimestamp: beijingTime("2026-07-22T15:00:01"),
    }))).toBe(true);
  });

  it("does not reuse analysis while the A-share market is trading", () => {
    expect(isAShareAnalysisCacheReusable(candidate({
      nowTimestamp: beijingTime("2026-07-22T14:00:00"),
      cacheTimestamp: beijingTime("2026-07-22T13:30:00"),
    }))).toBe(false);
  });

  it("accepts same-day pre-open and weekend caches when quotes match", () => {
    expect(isAShareAnalysisCacheReusable(candidate({
      nowTimestamp: beijingTime("2026-07-22T08:00:00"),
      cacheTimestamp: beijingTime("2026-07-22T07:30:00"),
    }))).toBe(true);

    expect(isAShareAnalysisCacheReusable(candidate({
      nowTimestamp: beijingTime("2026-07-25T12:00:00"),
      cacheTimestamp: beijingTime("2026-07-25T10:00:00"),
    }))).toBe(true);
  });

  it("rejects previous-day, future, and non-A-share cache candidates", () => {
    expect(isAShareAnalysisCacheReusable(candidate({
      nowTimestamp: beijingTime("2026-07-22T08:00:00"),
      cacheTimestamp: beijingTime("2026-07-21T16:00:00"),
    }))).toBe(false);

    expect(isAShareAnalysisCacheReusable(candidate({
      cacheTimestamp: beijingTime("2026-07-22T12:01:00"),
    }))).toBe(false);

    expect(isAShareAnalysisCacheReusable(candidate({ symbol: "0700.HK" }))).toBe(false);
  });

  it("rejects cached prices or changes that differ at display precision", () => {
    expect(isAShareAnalysisCacheReusable(candidate({
      cachedQuote: { price: 434.48, change: -1.25 },
    }))).toBe(false);

    expect(isAShareAnalysisCacheReusable(candidate({
      cachedQuote: { price: 430.98, change: -1.25 },
    }))).toBe(false);
  });

  it("accepts finite quote values that round to the same two decimals", () => {
    expect(isAShareAnalysisCacheReusable(candidate({
      cachedQuote: { price: 430.981, change: -2.051 },
      latestQuote: { price: 430.984, change: -2.054 },
    }))).toBe(true);
  });

  it("rejects non-finite quote values", () => {
    expect(isAShareAnalysisCacheReusable(candidate({
      latestQuote: { price: Number.NaN, change: -2.05 },
    }))).toBe(false);
  });
});

describe("market-aware analysis cache policy", () => {
  it.each([
    ["600519.SS", "2026-07-30T01:30:00.000Z", true],
    ["600519.SS", "2026-07-30T03:30:00.000Z", false],
    ["0700.HK", "2026-07-30T05:00:00.000Z", true],
    ["9984.T", "2026-07-30T06:29:00.000Z", true],
    ["9984.T", "2026-07-30T06:30:00.000Z", false],
    ["AAPL", "2026-07-30T13:30:00.000Z", true],
    ["AAPL", "2026-01-15T14:30:00.000Z", true],
  ])("detects the regular trading session for %s at %s", (symbol, iso, expected) => {
    expect(isMarketTrading(symbol, Date.parse(iso))).toBe(expected);
  });

  it("treats Hong Kong's closing auction as active through 16:10 local time", () => {
    expect(isMarketTrading("0700.HK", Date.parse("2026-07-30T08:09:00.000Z"))).toBe(true);
    expect(isMarketTrading("0700.HK", Date.parse("2026-07-30T08:10:00.000Z"))).toBe(false);
  });

  it("closes all supported markets on weekends", () => {
    expect(isMarketTrading("600519.SS", Date.parse("2026-08-01T02:00:00.000Z"))).toBe(false);
    expect(isMarketTrading("0700.HK", Date.parse("2026-08-01T02:00:00.000Z"))).toBe(false);
    expect(isMarketTrading("9984.T", Date.parse("2026-08-01T02:00:00.000Z"))).toBe(false);
    expect(isMarketTrading("AAPL", Date.parse("2026-08-01T15:00:00.000Z"))).toBe(false);
  });

  it("reuses an active-session analysis through exactly ten minutes", () => {
    const now = Date.parse("2026-07-30T14:00:00.000Z");
    expect(isAnalysisCacheReusableByTime("AAPL", now - ACTIVE_MARKET_ANALYSIS_MAX_AGE_MS, now)).toBe(true);
    expect(isAnalysisCacheReusableByTime("AAPL", now - ACTIVE_MARKET_ANALYSIS_MAX_AGE_MS - 1, now)).toBe(false);
  });

  it("rejects future timestamps and reuses same-market-day reports while closed", () => {
    const beforeUsOpen = Date.parse("2026-07-30T12:00:00.000Z");
    expect(isAnalysisCacheReusableByTime("AAPL", beforeUsOpen + 1, beforeUsOpen)).toBe(false);
    expect(isAnalysisCacheReusableByTime("AAPL", Date.parse("2026-07-30T05:00:00.000Z"), beforeUsOpen)).toBe(true);
  });

  it("compares dates in the exchange timezone instead of the browser timezone", () => {
    expect(isSameMarketDate(
      "AAPL",
      Date.parse("2026-07-30T03:59:00.000Z"),
      Date.parse("2026-07-30T04:01:00.000Z")
    )).toBe(false);
    expect(isSameMarketDate(
      "0700.HK",
      Date.parse("2026-07-29T23:59:00.000Z"),
      Date.parse("2026-07-30T00:01:00.000Z")
    )).toBe(true);
  });
});

describe("market-data cache policy", () => {
  it("reuses active-session data for ten minutes but not data from before the session", () => {
    const now = Date.parse("2026-07-30T14:00:00.000Z");
    expect(isMarketDataCacheReusable("AAPL", now - ACTIVE_MARKET_ANALYSIS_MAX_AGE_MS, now)).toBe(true);
    expect(isMarketDataCacheReusable("AAPL", now - ACTIVE_MARKET_ANALYSIS_MAX_AGE_MS - 1, now)).toBe(false);
    expect(isMarketDataCacheReusable(
      "AAPL",
      Date.parse("2026-07-30T13:29:00.000Z"),
      Date.parse("2026-07-30T13:31:00.000Z")
    )).toBe(false);
  });

  it("reuses a lunch-break snapshot only when it includes the completed morning session", () => {
    const lunch = Date.parse("2026-07-30T04:00:00.000Z");
    expect(isMarketDataCacheReusable("600519.SS", Date.parse("2026-07-30T03:30:00.000Z"), lunch)).toBe(true);
    expect(isMarketDataCacheReusable("600519.SS", Date.parse("2026-07-30T03:29:00.000Z"), lunch)).toBe(false);
  });

  it("keeps a completed close through the weekend and next pre-open", () => {
    const fridayClose = Date.parse("2026-07-31T20:01:00.000Z");
    expect(isMarketDataCacheReusable("AAPL", fridayClose, Date.parse("2026-08-02T12:00:00.000Z"))).toBe(true);
    expect(isMarketDataCacheReusable("AAPL", fridayClose, Date.parse("2026-08-03T13:00:00.000Z"))).toBe(true);
    expect(isMarketDataCacheReusable("AAPL", fridayClose, Date.parse("2026-08-03T13:30:00.000Z"))).toBe(false);
  });

  it("rejects a pre-close snapshot after the market closes", () => {
    expect(isMarketDataCacheReusable(
      "AAPL",
      Date.parse("2026-07-30T19:59:00.000Z"),
      Date.parse("2026-07-30T20:01:00.000Z")
    )).toBe(false);
  });
});
