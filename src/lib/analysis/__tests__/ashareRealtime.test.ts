import { afterEach, describe, expect, it, vi } from "vitest";
import {
  convertSymbolToEastMoneyAShareSecid,
  fetchAShareRealtimeQuote,
  mergeRealtimeQuoteIntoDailyCandles,
  parseEastMoneyRealtimeQuote,
} from "@/lib/analysis/ashareRealtime";
import { fetchEastMoneyJson } from "@/lib/analysis/eastmoneyHttp";

vi.mock("@/lib/analysis/eastmoneyHttp", () => ({
  fetchEastMoneyJson: vi.fn(),
}));

describe("A-share realtime quote helpers", () => {
  afterEach(() => {
    vi.mocked(fetchEastMoneyJson).mockReset();
    vi.unstubAllGlobals();
  });

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

  it("appends a current-day candle when the daily K-line stops at the previous trading day", () => {
    const merged = mergeRealtimeQuoteIntoDailyCandles(
      [
        { date: "2026-07-02", open: 10, high: 11, low: 9.5, close: 10.2, volume: 1000 },
        { date: "2026-07-03", open: 10.2, high: 10.8, low: 10, close: 10.5, volume: 1200 },
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

  it("replaces the last candle when candle dates are Date objects (Yahoo path)", () => {
    const merged = mergeRealtimeQuoteIntoDailyCandles(
      [
        { date: new Date("2026-07-03T00:00:00Z"), open: 10.2, high: 10.8, low: 10, close: 10.5, volume: 1200 },
        { date: new Date("2026-07-06T00:00:00Z"), open: 10.6, high: 10.9, low: 10.4, close: 10.7, volume: 800 },
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

    // Regression: string quote.date vs Date candle.date used to never match,
    // appending a duplicated final bar that skewed every downstream indicator.
    expect(merged).toHaveLength(2);
    expect(merged[1].close).toBe(11.2);
  });

  it("ignores realtime quotes older than the last candle (Date objects)", () => {
    const merged = mergeRealtimeQuoteIntoDailyCandles(
      [{ date: new Date("2026-07-06T00:00:00Z"), open: 10, high: 11, low: 9.5, close: 10.5, volume: 500 }],
      {
        source: "eastmoney-realtime",
        price: 9,
        date: "2026-07-03",
        changePercent: -2,
      }
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].close).toBe(10.5);
  });

  it("falls back to the same Tonghuashun snapshot used by the watchlist", async () => {
    vi.mocked(fetchEastMoneyJson).mockRejectedValueOnce(new Error("EastMoney unavailable"));
    const wrap = (callback: string, payload: unknown) => `${callback}(${JSON.stringify(payload)});`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(wrap("today", {
          hs_688048: {
            "1": "20260724",
            "7": "294.20",
            "8": "298.10",
            "9": "292.80",
            "11": "295.02",
            "13": 3800000,
            name: "Everbright",
          },
        })),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(wrap("last", {
          name: "Everbright",
          data: [
            "20260723,292.00,294.00,290.10,293.04,3200000,0,0,,,0",
          ].join(";"),
        })),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAShareRealtimeQuote("688048.SS")).resolves.toEqual({
      source: "tonghuashun",
      name: "Everbright",
      price: 295.02,
      open: 294.2,
      high: 298.1,
      low: 292.8,
      previousClose: 293.04,
      volume: 3800000,
      date: "2026-07-24",
      changePercent: ((295.02 - 293.04) / 293.04) * 100,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses one short-lived A-share snapshot across watchlist and analysis requests", async () => {
    vi.mocked(fetchEastMoneyJson).mockRejectedValue(new Error("EastMoney unavailable"));
    const wrap = (callback: string, payload: unknown) => `${callback}(${JSON.stringify(payload)});`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(wrap("today", {
          hs_600519: {
            "1": "20260724",
            "7": "1450.00",
            "8": "1472.00",
            "9": "1442.00",
            "11": "1468.00",
            "13": 2100000,
            name: "MOUTAI",
          },
        })),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(wrap("last", {
          name: "MOUTAI",
          data: "20260723,1440.00,1455.00,1435.00,1448.00,1900000,0,0,,,0",
        })),
      });
    vi.stubGlobal("fetch", fetchMock);

    const watchlistQuote = await fetchAShareRealtimeQuote("600519.SS");
    const analysisQuote = await fetchAShareRealtimeQuote("600519.SS");

    expect(analysisQuote).toEqual(watchlistQuote);
    expect(analysisQuote?.price).toBe(1468);
    expect(fetchEastMoneyJson).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
