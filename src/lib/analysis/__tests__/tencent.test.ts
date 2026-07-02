import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTencentMarketData, fetchTencentQuote } from "../tencent";

function makeTencentResponse(key: string, seriesKey: "day" | "week", rows: string[][], name = "Apple Inc.") {
  return {
    code: 0,
    msg: "",
    data: {
      [key]: {
        [seriesKey]: rows,
        qt: {
          [key]: ["delay", name],
        },
      },
    },
  };
}

const dailyRows = Array.from({ length: 25 }, (_, index) => {
  const day = String(index + 1).padStart(2, "0");
  const open = 100 + index;
  const close = 101 + index;
  const high = 102 + index;
  const low = 99 + index;
  const volume = 1000 + index;
  return [`2026-06-${day}`, String(open), String(close), String(high), String(low), String(volume)];
});

const weeklyRows = Array.from({ length: 8 }, (_, index) => {
  const day = String(index + 1).padStart(2, "0");
  return [`2026-05-${day}`, String(90 + index), String(91 + index), String(92 + index), String(89 + index), String(5000 + index)];
});

describe("tencent market data provider", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches HK daily and weekly candles with padded Tencent code", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeTencentResponse("hk00700", "day", dailyRows, "腾讯控股")),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeTencentResponse("hk00700", "week", weeklyRows, "腾讯控股")),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTencentMarketData("0700.HK");

    expect(result?.source).toBe("tencent");
    expect(result?.companyName).toBe("腾讯控股");
    expect(result?.price).toBe(125);
    expect(result?.changePercent).toBeCloseTo(((125 - 124) / 124) * 100);
    expect(result?.dailyCandles[0]).toEqual({
      date: "2026-06-01",
      open: 100,
      close: 101,
      high: 102,
      low: 99,
      volume: 1000,
    });
    expect(result?.weeklyCandles).toHaveLength(8);
    expect(fetchMock.mock.calls[0][0]).toContain("hk00700,day");
  });

  it("tries US NASDAQ then NYSE Tencent suffixes and returns the first full dataset", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeTencentResponse("usBABA.OQ", "day", dailyRows.slice(0, 1), "阿里巴巴")),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeTencentResponse("usBABA.OQ", "week", weeklyRows, "阿里巴巴")),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeTencentResponse("usBABA.N", "day", dailyRows, "阿里巴巴")),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeTencentResponse("usBABA.N", "week", weeklyRows, "阿里巴巴")),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTencentMarketData("BABA");

    expect(result?.source).toBe("tencent");
    expect(result?.dailyCandles).toHaveLength(25);
    expect(fetchMock.mock.calls[0][0]).toContain("usBABA.OQ,day");
    expect(fetchMock.mock.calls[2][0]).toContain("usBABA.N,day");
  });

  it("uses Tencent realtime quote without fetching full candles", async () => {
    const responseText = 'v_usAAPL="200~Apple~AAPL.OQ~294.38~289.36~~~~~~~~~~~~~~~~~~~~~~~~~~2026-07-01 16:00:01~5.02~1.73~296.59";';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(responseText).buffer),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTencentQuote("AAPL")).resolves.toEqual({
      price: 294.38,
      changePercent: 1.73,
      companyName: "Apple",
      source: "tencent",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("qt.gtimg.cn/q=usAAPL");
  });
});
