import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProviderMarketData, fetchProviderQuote, fetchProviderSearchSuggestions } from "../marketDataProviders";

describe("marketDataProviders", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("skips optional provider calls when no API keys are configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchProviderQuote("AAPL")).resolves.toBeNull();
    await expect(fetchProviderMarketData("AAPL")).resolves.toBeNull();
    await expect(fetchProviderSearchSuggestions("AAPL")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses Twelve Data quote and search responses", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "td-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          name: "Apple Inc",
          close: "212.40",
          percent_change: "1.25",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            {
              symbol: "AAPL",
              instrument_name: "Apple Inc",
              exchange: "NASDAQ",
              type: "Common Stock",
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchProviderQuote("AAPL")).resolves.toEqual({
      price: 212.4,
      changePercent: 1.25,
      companyName: "Apple Inc",
      source: "twelve-data",
    });
    await expect(fetchProviderSearchSuggestions("apple")).resolves.toEqual([
      {
        symbol: "AAPL",
        name: "Apple Inc",
        exchDisp: "NASDAQ",
        typeDisp: "Common Stock",
      },
    ]);
  });

  it("falls back to FMP when Twelve Data has no usable market data", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "td-key");
    vi.stubEnv("FMP_API_KEY", "fmp-key");

    const historical = Array.from({ length: 70 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 0, 1 + index));
      return {
        date: date.toISOString().slice(0, 10),
        open: 100 + index,
        high: 101 + index,
        low: 99 + index,
        close: 100.5 + index,
        volume: 1000 + index,
      };
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ code: 400, message: "No data" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          {
            symbol: "AAPL",
            name: "Apple Inc",
            price: 190,
            changesPercentage: 2.5,
          },
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ historical }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProviderMarketData("AAPL");

    expect(result?.source).toBe("fmp");
    expect(result?.price).toBe(190);
    expect(result?.changePercent).toBe(2.5);
    expect(result?.dailyCandles).toHaveLength(70);
    expect(result?.weeklyCandles.length).toBeGreaterThan(0);
  });
});
