import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const { searchMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
}));

const { providerSearchMock } = vi.hoisted(() => ({
  providerSearchMock: vi.fn(),
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

describe("/api/search", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    searchMock.mockReset();
    providerSearchMock.mockReset();
    providerSearchMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns Yahoo suggestions and does not call fallback providers when Yahoo works", async () => {
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

    const response = await GET(new Request("http://localhost/api/search?q=kioxia"));
    const body = await response.json();

    expect(searchMock).toHaveBeenCalledWith("kioxia", { newsCount: 0 });
    expect(providerSearchMock).not.toHaveBeenCalled();
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

  it("uses configured provider search before EastMoney when Yahoo search fails", async () => {
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

    const response = await GET(new Request("http://localhost/api/search?q=huayou"));
    const body = await response.json();

    expect(providerSearchMock).toHaveBeenCalledWith("huayou");
    expect(body.quotes[0]).toEqual({
      symbol: "603799.SS",
      name: "ZHEJIANG HUAYOU COBALT CO LTD",
      exchDisp: "Shanghai",
      typeDisp: "Stock",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
});
