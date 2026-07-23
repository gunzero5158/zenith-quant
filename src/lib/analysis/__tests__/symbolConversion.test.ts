import { describe, expect, it } from "vitest";
import {
  aShareCodeToSuffixedSymbol,
  convertSymbolToEastMoneySecid,
  convertSymbolToEastMoneyAShareSecid,
  getEastMoneySecidCandidates,
  isShanghaiAShareCode,
} from "../symbolConversion";
import { buildWeeklyCandles, mergeCurrentWeekFromDaily } from "../weeklyCandles";
import { Candle } from "../indicators";

describe("isShanghaiAShareCode / aShareCodeToSuffixedSymbol", () => {
  it("classifies Shanghai codes: main board, STAR market and B-shares", () => {
    expect(isShanghaiAShareCode("600519")).toBe(true); // main board
    expect(isShanghaiAShareCode("605111")).toBe(true); // newer main-board range
    expect(isShanghaiAShareCode("688048")).toBe(true); // STAR market
    expect(isShanghaiAShareCode("900948")).toBe(true); // Shanghai B-share
  });

  it("classifies Shenzhen codes: main board, ChiNext and B-shares", () => {
    expect(isShanghaiAShareCode("000001")).toBe(false);
    expect(isShanghaiAShareCode("002594")).toBe(false);
    expect(isShanghaiAShareCode("300059")).toBe(false);
    expect(isShanghaiAShareCode("200596")).toBe(false); // Shenzhen B-share
  });

  it("suffixes 900xxx Shanghai B-shares as .SS (regression: loose '6' rule sent them to .SZ)", () => {
    expect(aShareCodeToSuffixedSymbol("900948")).toBe("900948.SS");
    expect(aShareCodeToSuffixedSymbol("600519")).toBe("600519.SS");
    expect(aShareCodeToSuffixedSymbol("000001")).toBe("000001.SZ");
  });
});

describe("convertSymbolToEastMoneySecid", () => {
  it("converts A-share, HK and US symbols", () => {
    expect(convertSymbolToEastMoneySecid("600519.SS")).toBe("1.600519");
    expect(convertSymbolToEastMoneySecid("688001.SH")).toBe("1.688001");
    expect(convertSymbolToEastMoneySecid("000001.SZ")).toBe("0.000001");
    expect(convertSymbolToEastMoneySecid("600519")).toBe("1.600519");
    expect(convertSymbolToEastMoneySecid("900948")).toBe("1.900948");
    expect(convertSymbolToEastMoneySecid("300059")).toBe("0.300059");
    expect(convertSymbolToEastMoneySecid("0700.HK")).toBe("116.00700");
    expect(convertSymbolToEastMoneySecid("AAPL")).toBe("105.AAPL");
    expect(convertSymbolToEastMoneySecid("!invalid!")).toBeNull();
  });

  it("returns all US market candidates", () => {
    expect(getEastMoneySecidCandidates("AAPL")).toEqual(["105.AAPL", "106.AAPL", "107.AAPL"]);
    expect(getEastMoneySecidCandidates("600519")).toEqual(["1.600519"]);
  });

  it("A-share-only variant rejects HK/US symbols", () => {
    expect(convertSymbolToEastMoneyAShareSecid("600519")).toBe("1.600519");
    expect(convertSymbolToEastMoneyAShareSecid("0700.HK")).toBeNull();
    expect(convertSymbolToEastMoneyAShareSecid("AAPL")).toBeNull();
  });
});

describe("buildWeeklyCandles", () => {
  it("aggregates daily candles into Monday-keyed weekly candles", () => {
    const daily: Candle[] = [
      // Week of 2026-06-29 (Mon)
      { date: "2026-06-29", open: 10, high: 11, low: 9.8, close: 10.5, volume: 100 },
      { date: "2026-06-30", open: 10.5, high: 12, low: 10.2, close: 11.5, volume: 150 },
      { date: "2026-07-03", open: 11.5, high: 11.8, low: 10.9, close: 11.2, volume: 120 },
      // Week of 2026-07-06 (Mon)
      { date: "2026-07-06", open: 11.2, high: 11.9, low: 11.0, close: 11.7, volume: 90 },
    ];

    const weekly = buildWeeklyCandles(daily);

    expect(weekly).toHaveLength(2);
    expect(weekly[0]).toEqual({
      date: "2026-06-29",
      open: 10,      // first day's open
      high: 12,      // max high
      low: 9.8,      // min low
      close: 11.2,   // last day's close
      volume: 370,   // summed
    });
    expect(weekly[1].date).toBe("2026-07-06");
    expect(weekly[1].close).toBe(11.7);
  });

  it("sorts weeks ascending regardless of input order", () => {
    const daily: Candle[] = [
      { date: "2026-07-06", open: 2, high: 2, low: 2, close: 2, volume: 1 },
      { date: "2026-06-29", open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ];

    const weekly = buildWeeklyCandles(daily);
    expect(weekly.map((c) => c.date)).toEqual(["2026-06-29", "2026-07-06"]);
  });

  it("replaces the provider current week with the week rebuilt from realtime daily bars", () => {
    const provider: Candle[] = [
      { date: "2026-07-13", open: 100, high: 110, low: 95, close: 105, volume: 5000 },
      { date: "2026-07-20", open: 105, high: 108, low: 101, close: 102, volume: 2000 },
    ];
    const daily: Candle[] = [
      { date: "2026-07-20", open: 105, high: 109, low: 103, close: 108, volume: 1000 },
      { date: "2026-07-21", open: 108, high: 112, low: 107, close: 111, volume: 1500 },
      { date: "2026-07-22", open: 111, high: 115, low: 110, close: 114, volume: 1800 },
    ];

    expect(mergeCurrentWeekFromDaily(provider, daily).at(-1)).toEqual({
      date: "2026-07-20",
      open: 105,
      high: 115,
      low: 103,
      close: 114,
      volume: 4300,
    });
  });
});
