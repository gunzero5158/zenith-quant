import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTonghuashunMarketData,
  fetchTonghuashunQuote,
  getTonghuashunSymbolCode,
  mergeTonghuashunTodayCandle,
  parseTonghuashunLastResponse,
  parseTonghuashunTodayResponse,
} from "../tonghuashun";

function wrap(callback: string, payload: unknown) {
  return `${callback}(${JSON.stringify(payload)});`;
}

function makeRows(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    const open = 100 + index;
    const high = 102 + index;
    const low = 99 + index;
    const close = 101 + index;
    const volume = 1000 + index;
    return `202606${day},${open},${high},${low},${close},${volume},${volume * close},0,,,0`;
  });
}

describe("Tonghuashun market data provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("converts A-share, HK, and US symbols to Tonghuashun line codes", () => {
    expect(getTonghuashunSymbolCode("600519.SS")).toBe("hs_600519");
    expect(getTonghuashunSymbolCode("300059.SZ")).toBe("hs_300059");
    expect(getTonghuashunSymbolCode("0700.HK")).toBe("hk_HK0700");
    expect(getTonghuashunSymbolCode("09988.HK")).toBe("hk_HK9988");
    expect(getTonghuashunSymbolCode("AAPL")).toBe("usa_AAPL");
    expect(getTonghuashunSymbolCode("9984.T")).toBeNull();
  });

  it("parses Tonghuashun last.js daily candles", () => {
    const parsed = parseTonghuashunLastResponse(
      wrap("quotebridge_v6_line_hs_600519_01_last", {
        name: "MOUTAI",
        data: [
          "20260702,1193.01,1215.52,1190.51,1203.00,5087015,6122360900.00,0.407,,,0",
          "20260703,1205.24,1210.14,1185.00,1194.45,3426755,4099266200.00,0.274,,,0",
        ].join(";"),
      })
    );

    expect(parsed.companyName).toBe("MOUTAI");
    expect(parsed.candles).toEqual([
      { date: "2026-07-02", open: 1193.01, high: 1215.52, low: 1190.51, close: 1203, volume: 5087015 },
      { date: "2026-07-03", open: 1205.24, high: 1210.14, low: 1185, close: 1194.45, volume: 3426755 },
    ]);
  });

  it("parses and appends Tonghuashun today.js as the current day candle", () => {
    const today = parseTonghuashunTodayResponse(
      wrap("quotebridge_v6_line_hs_600519_01_today", {
        hs_600519: {
          "1": "20260706",
          "7": "1186.00",
          "8": "1215.00",
          "9": "1180.00",
          "11": "1206.91",
          "13": 4097001,
          name: "MOUTAI",
        },
      })
    );

    const merged = mergeTonghuashunTodayCandle(
      [{ date: "2026-07-03", open: 1205.24, high: 1210.14, low: 1185, close: 1194.45, volume: 3426755 }],
      today
    );

    expect(today?.companyName).toBe("MOUTAI");
    expect(merged[1]).toEqual({
      date: "2026-07-06",
      open: 1186,
      high: 1215,
      low: 1180,
      close: 1206.91,
      volume: 4097001,
    });
  });

  it("fetches market data from last.js and today.js", async () => {
    const rows = makeRows(25);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(wrap("quotebridge_v6_line_hs_600519_01_last", { name: "MOUTAI", data: rows.join(";") })),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(wrap("quotebridge_v6_line_hs_600519_01_today", {
          hs_600519: { "1": "20260706", "7": "130", "8": "132", "9": "129", "11": "131", "13": 9000, name: "MOUTAI" },
        })),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTonghuashunMarketData("600519.SS");

    expect(result?.source).toBe("tonghuashun");
    expect(result?.companyName).toBe("MOUTAI");
    expect(result?.dailyCandles).toHaveLength(26);
    expect(result?.price).toBe(131);
    expect(fetchMock.mock.calls[0][0]).toContain("hs_600519/01/last.js");
    expect(fetchMock.mock.calls[1][0]).toContain("hs_600519/01/today.js");
  });

  it("fetches a lightweight quote from today.js", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(wrap("quotebridge_v6_line_hk_HK0700_01_today", {
          hk_HK0700: { "1": "20260706", "7": "432.8", "8": "453.4", "9": "425.4", "11": "451.2", "13": 38675073, name: "Tencent" },
        })),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(wrap("quotebridge_v6_line_hk_HK0700_01_last", {
          name: "Tencent",
          data: [
            "20260703,433.0,445.8,431.2,431.2,24957296,10897851800.000,0.275,,,0",
            "20260706,432.8,453.4,425.4,451.2,38675073,17242711000.000,0.425,,,0",
          ].join(";"),
        })),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTonghuashunQuote("0700.HK")).resolves.toEqual({
      price: 451.2,
      changePercent: ((451.2 - 431.2) / 431.2) * 100,
      companyName: "Tencent",
      source: "tonghuashun",
    });
  });

  it("ignores stale today.js quote data older than the latest history candle", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(wrap("quotebridge_v6_line_hk_HK0700_01_today", {
          hk_HK0700: { "1": "20260421", "7": "523", "8": "525.5", "9": "515.5", "11": "519", "13": 8666184, name: "Tencent" },
        })),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(wrap("quotebridge_v6_line_hk_HK0700_01_last", {
          name: "Tencent",
          data: [
            "20260703,433.0,445.8,431.2,431.2,24957296,10897851800.000,0.275,,,0",
            "20260706,432.8,453.4,425.4,452.0,38675073,17242711000.000,0.425,,,0",
          ].join(";"),
        })),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTonghuashunQuote("0700.HK")).resolves.toEqual({
      price: 452,
      changePercent: ((452 - 431.2) / 431.2) * 100,
      companyName: "Tencent",
      source: "tonghuashun",
    });
  });
});
