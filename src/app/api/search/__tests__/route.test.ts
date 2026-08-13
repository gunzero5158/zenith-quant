import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const { searchMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
}));

const { providerSearchMock } = vi.hoisted(() => ({
  providerSearchMock: vi.fn(),
}));

const { windowsYahooSearchMock } = vi.hoisted(() => ({
  windowsYahooSearchMock: vi.fn(),
}));

vi.mock("yahoo-finance2", () => ({
  default: vi.fn(function YahooFinanceMock() {
    return {
      search: searchMock,
    };
  }),
  YahooFinance: vi.fn(function YahooFinanceMock() {
    return {
      search: searchMock,
    };
  }),
}));

vi.mock("@/lib/analysis/marketDataProviders", () => ({
  fetchProviderSearchSuggestions: providerSearchMock,
}));

vi.mock("@/lib/analysis/windowsHttpFallback", () => ({
  fetchYahooJsonViaWindows: windowsYahooSearchMock,
}));

describe("/api/search", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    searchMock.mockReset();
    providerSearchMock.mockReset();
    providerSearchMock.mockResolvedValue([]);
    windowsYahooSearchMock.mockReset();
    windowsYahooSearchMock.mockResolvedValue({ quotes: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the first valid remote suggestions without waiting for slower sources", async () => {
    searchMock.mockResolvedValue({
      quotes: [
        {
          symbol: "285A.T",
          quoteType: "EQUITY",
          shortname: "KIOXIA HOLDINGS CORPORATION",
          exchDisp: "Tokyo Stock Exchange",
          typeDisp: "Equity",
        },
        {
          symbol: "603799.SS",
          quoteType: "EQUITY",
          shortname: "ZHEJIANG HUAYOU COBALT CO LTD",
          exchDisp: "Shanghai",
          typeDisp: "Equity",
        },
        {
          symbol: "IGNORED",
          quoteType: "CRYPTOCURRENCY",
          shortname: "Ignored Asset",
          exchDisp: "GLOBAL",
          typeDisp: "Crypto",
        },
      ],
    });

    const response = await GET(new Request("http://localhost/api/search?q=tesla"));
    const body = await response.json();

    expect(searchMock).toHaveBeenCalledWith("tesla", { newsCount: 0 });
    expect(providerSearchMock).toHaveBeenCalledWith("tesla");
    expect(body.quotes).toEqual([
      {
        symbol: "285A.T",
        name: "KIOXIA HOLDINGS CORPORATION",
        exchDisp: "Tokyo Stock Exchange",
        typeDisp: "Equity",
      },
      {
        symbol: "603799.SS",
        name: "ZHEJIANG HUAYOU COBALT CO LTD",
        exchDisp: "Shanghai",
        typeDisp: "Equity",
      },
    ]);
  });

  it("uses a configured provider result when Yahoo search fails", async () => {
    searchMock.mockRejectedValue(new Error("Yahoo blocked"));
    providerSearchMock.mockResolvedValue([
      {
        symbol: "603799.SS",
        name: "ZHEJIANG HUAYOU COBALT CO LTD",
        exchDisp: "Shanghai",
        typeDisp: "Stock",
      },
    ]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        QuotationCodeTable: {
          Data: [
            {
              Code: "603799",
              Name: "Huayou Cobalt EastMoney",
              QuoteID: "1.603799",
              SecurityTypeName: "A-share",
              Classify: "AStock",
              JYS: "SSE",
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/search?q=cobalt"));
    const body = await response.json();

    expect(providerSearchMock).toHaveBeenCalledWith("cobalt");
    expect(body.quotes[0]).toEqual({
      symbol: "603799.SS",
      name: "ZHEJIANG HUAYOU COBALT CO LTD",
      exchDisp: "Shanghai",
      typeDisp: "Stock",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body.quotes).toHaveLength(1);
  });

  it("falls back to static common suggestions if every remote search source fails", async () => {
    searchMock.mockRejectedValue(new Error("Yahoo blocked"));
    providerSearchMock.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("EastMoney blocked")));

    const response = await GET(new Request("http://localhost/api/search?q=kioxia"));
    const body = await response.json();

    expect(body.quotes[0]).toEqual({
      symbol: "285A.T",
      name: "KIOXIA Holdings",
      exchDisp: "TSE",
      typeDisp: "日本株",
    });
  });

  it("resolves a known Japanese code without waiting for remote search", async () => {
    searchMock.mockResolvedValue({ quotes: [] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        quotes: [{
          symbol: "7203.T",
          quoteType: "EQUITY",
          shortname: "TOYOTA MOTOR CORP",
          exchange: "JPX",
          typeDisp: "Equity",
        }],
      }),
    }));

    const response = await GET(new Request("http://localhost/api/search?q=7203"));
    const body = await response.json();

    expect(body.quotes[0]).toMatchObject({
      symbol: "7203.T",
      name: "Toyota Motor Corporation",
    });
    expect(searchMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not match every static suggestion for a non-Latin query", async () => {
    searchMock.mockResolvedValue({ quotes: [] });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("remote search blocked")));

    const response = await GET(new Request("http://localhost/api/search?q=%E4%B8%B0%E7%94%B0"));
    const body = await response.json();

    expect(body.quotes).toHaveLength(1);
    expect(body.quotes[0].symbol).toBe("7203.T");
  });

  it("resolves a Japanese company name from the local fallback", async () => {
    searchMock.mockResolvedValue({ quotes: [] });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("remote search blocked")));

    const response = await GET(new Request(`http://localhost/api/search?q=${encodeURIComponent("ソフトバンク")}`));
    const body = await response.json();

    expect(body.quotes[0]).toMatchObject({ symbol: "9984.T" });
  });

  it("keeps a four-digit Hong Kong result instead of forcing a Japan suffix", async () => {
    searchMock.mockResolvedValue({ quotes: [] });
    windowsYahooSearchMock.mockResolvedValue({
      quotes: [{
        symbol: "9988.HK",
        quoteType: "EQUITY",
        shortname: "BABA-W",
        exchDisp: "Hong Kong",
        typeDisp: "Equity",
      }],
    });

    const response = await GET(new Request("http://localhost/api/search?q=9988"));
    const body = await response.json();

    expect(body.quotes[0].symbol).toBe("9988.HK");
  });

  it("normalizes EastMoney five-digit Hong Kong codes to the app display format", async () => {
    searchMock.mockResolvedValue({ quotes: [] });
    windowsYahooSearchMock.mockResolvedValue({ quotes: [] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        QuotationCodeTable: {
          Data: [{
            Code: "09988",
            Name: "Alibaba Group",
            QuoteID: "116.09988",
            SecurityTypeName: "HK Stock",
            Classify: "HKStock",
            JYS: "HKSE",
          }],
        },
      }),
    }));

    const response = await GET(new Request("http://localhost/api/search?q=9988"));
    const body = await response.json();

    expect(body.quotes[0].symbol).toBe("9988.HK");
  });

  it("ranks a primary exchange listing ahead of an OTC receipt for a company name", async () => {
    searchMock.mockResolvedValue({ quotes: [] });
    windowsYahooSearchMock.mockResolvedValue({
      quotes: [
        { symbol: "NTDOY", quoteType: "EQUITY", shortname: "Nintendo Co., Ltd.", exchDisp: "OTC Markets" },
        { symbol: "7974.T", quoteType: "EQUITY", shortname: "NINTENDO CO LTD", exchDisp: "Tokyo Stock Exchange" },
      ],
    });

    const response = await GET(new Request("http://localhost/api/search?q=Nintendo"));
    const body = await response.json();

    expect(body.quotes.map((quote: { symbol: string }) => quote.symbol)).toEqual(["7974.T", "NTDOY"]);
  });
});
