import { describe, expect, it } from "vitest";
import {
  convertSymbolToEastMoneyAShareSecid,
  mergeRealtimeQuoteIntoDailyCandles,
  parseEastMoneyRealtimeQuote,
  parseSinaRealtimeQuote,
} from "@/lib/analysis/ashareRealtime";

describe("A-share realtime quote helpers", () => {
  it("converts only A-share symbols to EastMoney secids", () => {
    expect(convertSymbolToEastMoneyAShareSecid("600519")).toBe("1.600519");
    expect(convertSymbolToEastMoneyAShareSecid("688048.SS")).toBe("1.688048");
    expect(convertSymbolToEastMoneyAShareSecid("000001.SZ")).toBe("0.000001");
    expect(convertSymbolToEastMoneyAShareSecid("0700.HK")).toBeNull();
    expect(convertSymbolToEastMoneyAShareSecid("AAPL")).toBeNull();
  });

  it("parses EastMoney realtime quote fields as current A-share price", () => {
    const quote = parseEastMoneyRealtimeQuote({
      data: {
        f43: 142000,
        f44: 143000,
        f45: 139000,
        f46: 141000,
        f47: 123456,
        f58: "MOUTAI",
        f60: 140000,
        f86: 20260706150000,
        f170: 143,
      },
    });

    expect(quote).toEqual({
      source: "eastmoney-realtime",
      name: "MOUTAI",
      price: 1420,
      open: 1410,
      high: 1430,
      low: 1390,
      previousClose: 1400,
      volume: 123456,
      date: "2026-07-06",
      changePercent: 1.43,
    });
  });

  it("parses Sina realtime quote text as current A-share price", () => {
    const fields = Array(32).fill("");
    fields[0] = "MOUTAI";
    fields[1] = "1410.00";
    fields[2] = "1400.00";
    fields[3] = "1420.00";
    fields[4] = "1430.00";
    fields[5] = "1390.00";
    fields[8] = "123456";
    fields[30] = "2026-07-06";
    fields[31] = "15:00:00";

    const quote = parseSinaRealtimeQuote(`var hq_str_sh600519="${fields.join(",")}";`);

    expect(quote?.source).toBe("sina-realtime");
    expect(quote?.name).toBe("MOUTAI");
    expect(quote?.price).toBe(1420);
    expect(quote?.date).toBe("2026-07-06");
    expect(quote?.changePercent).toBeCloseTo(1.4286, 4);
  });

  it("appends a current-day candle when the daily K-line stops at the previous trading day", () => {
    const merged = mergeRealtimeQuoteIntoDailyCandles(
      [
        { date: "2026-07-02", open: 10, high: 11, low: 9.5, close: 10.2, volume: 1000 },
        { date: "2026-07-03", open: 10.2, high: 10.8, low: 10, close: 10.5, volume: 1200 },
      ],
      {
        source: "sina-realtime",
        price: 11.2,
        open: 10.8,
        high: 11.5,
        low: 10.7,
        previousClose: 10.5,
        volume: 1300,
        date: "2026-07-06",
        changePercent: 6.67,
      }
    );

    expect(merged).toHaveLength(3);
    expect(merged[2]).toEqual({
      date: "2026-07-06",
      open: 10.8,
      high: 11.5,
      low: 10.7,
      close: 11.2,
      volume: 1300,
    });
  });

  it("replaces the last candle when the realtime quote is for the same trading day", () => {
    const merged = mergeRealtimeQuoteIntoDailyCandles(
      [
        { date: "2026-07-03", open: 10.2, high: 10.8, low: 10, close: 10.5, volume: 1200 },
        { date: "2026-07-06", open: 10.6, high: 10.9, low: 10.4, close: 10.7, volume: 800 },
      ],
      {
        source: "eastmoney-realtime",
        price: 11.2,
        open: 10.8,
        high: 11.5,
        low: 10.7,
        previousClose: 10.5,
        volume: 1300,
        date: "2026-07-06",
        changePercent: 6.67,
      }
    );

    expect(merged).toHaveLength(2);
    expect(merged[1]).toEqual({
      date: "2026-07-06",
      open: 10.8,
      high: 11.5,
      low: 10.7,
      close: 11.2,
      volume: 1300,
    });
  });
});
