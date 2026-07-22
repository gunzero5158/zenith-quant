import { describe, expect, it } from "vitest";
import {
  isAShareAnalysisCacheReusable,
  isAShareSymbol,
  type AShareAnalysisCacheCandidate,
} from "../analysisCache";

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
