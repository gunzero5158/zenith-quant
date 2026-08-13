import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { fetchProviderSearchSuggestions } from "@/lib/analysis/marketDataProviders";

const yahooFinance = new YahooFinance();

interface YahooSearchQuote {
  symbol?: string;
  quoteType?: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  typeDisp?: string;
}

interface YahooSearchResult {
  quotes?: YahooSearchQuote[];
}

interface YahooHttpSearchQuote extends YahooSearchQuote {
  exchange?: string;
}

interface YahooHttpSearchResult {
  quotes?: YahooHttpSearchQuote[];
}

interface SearchSuggestion {
  symbol: string;
  name: string;
  exchDisp: string;
  typeDisp: string;
}

interface EastMoneySuggestItem {
  Code?: string;
  Name?: string;
  QuoteID?: string;
  SecurityTypeName?: string;
  Classify?: string;
  JYS?: string;
}

interface EastMoneySuggestResponse {
  QuotationCodeTable?: {
    Data?: EastMoneySuggestItem[];
  };
}

interface StaticSearchSuggestion extends SearchSuggestion {
  aliases: string[];
}

const STATIC_FALLBACK_SUGGESTIONS: StaticSearchSuggestion[] = [
  {
    symbol: "7203.T",
    name: "Toyota Motor Corporation",
    exchDisp: "TSE",
    typeDisp: "日本株",
    aliases: ["7203", "7203.t", "toyota", "toyotamotor", "丰田", "豐田", "トヨタ", "トヨタ自動車"],
  },
  {
    symbol: "285A.T",
    name: "KIOXIA Holdings",
    exchDisp: "TSE",
    typeDisp: "日本株",
    aliases: ["285a", "kio", "kiox", "kioxia", "kioxiaholdings"],
  },
  {
    symbol: "9984.T",
    name: "SoftBank Group",
    exchDisp: "TSE",
    typeDisp: "日本株",
    aliases: ["9984", "softbank", "softbankgroup", "ruanyin", "软银", "軟銀", "ソフトバンク", "ソフトバンクグループ"],
  },
  {
    symbol: "603799.SS",
    name: "华友钴业",
    exchDisp: "SSE",
    typeDisp: "A股",
    aliases: ["603799", "huayou", "huayouguye", "hyg"],
  },
  {
    symbol: "600519.SS",
    name: "贵州茅台",
    exchDisp: "SSE",
    typeDisp: "A股",
    aliases: ["600519", "maotai", "moutai", "kweichowmoutai", "guizhoumaotai"],
  },
  {
    symbol: "300750.SZ",
    name: "宁德时代",
    exchDisp: "SZSE",
    typeDisp: "A股",
    aliases: ["300750", "ningde", "ningdeshidai", "catl"],
  },
  {
    symbol: "300059.SZ",
    name: "东方财富",
    exchDisp: "SZSE",
    typeDisp: "A股",
    aliases: ["300059", "dongfang", "dongfangcaifu", "eastmoney"],
  },
  {
    symbol: "601318.SS",
    name: "中国平安",
    exchDisp: "SSE",
    typeDisp: "A股",
    aliases: ["601318", "pingan", "zhongguopingan"],
  },
  {
    symbol: "0700.HK",
    name: "腾讯控股",
    exchDisp: "HKSE",
    typeDisp: "港股",
    aliases: ["0700", "700", "tencent", "tengxun"],
  },
  {
    symbol: "APP",
    name: "AppLovin",
    exchDisp: "NASDAQ",
    typeDisp: "Equity",
    aliases: ["app", "applovin"],
  },
  {
    symbol: "AAPL",
    name: "Apple",
    exchDisp: "NASDAQ",
    typeDisp: "Equity",
    aliases: ["aapl", "apple", "pingguo"],
  },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ quotes: [] });
  }

  const cleanQuery = q.trim();
  const staticSuggestions = findStaticFallbackSuggestions(cleanQuery);
  if (staticSuggestions.length > 0 && (/[^\x00-\x7F]/.test(cleanQuery) || /^\d{3}[0-9A-Z](?:\.T)?$/i.test(cleanQuery))) {
    return NextResponse.json({ quotes: staticSuggestions });
  }

  let yahooQuotes: SearchSuggestion[] = [];
  try {
    const searchResult = await yahooFinance.search(cleanQuery, {
      newsCount: 0, // We only need quotes, not news
    }) as YahooSearchResult;

    yahooQuotes = mapYahooSuggestions(searchResult.quotes || []);
  } catch (error: unknown) {
    console.warn("Yahoo search API failed, using lightweight fallback:", error);
  }

  if (yahooQuotes.length > 0) {
    const quotes = /[^\x00-\x7F]/.test(cleanQuery)
      ? mergeSuggestions(staticSuggestions, yahooQuotes)
      : mergeSuggestions(yahooQuotes, staticSuggestions);
    return NextResponse.json({ quotes });
  }

  const fallbackQuotes = await fetchFallbackSuggestions(cleanQuery);
  return NextResponse.json({ quotes: fallbackQuotes });
}

async function fetchFallbackSuggestions(query: string): Promise<SearchSuggestion[]> {
  const [yahooHttpSuggestions, providerSuggestions, eastMoneySuggestions] = await Promise.all([
    fetchYahooHttpSuggestions(query),
    fetchProviderSearchSuggestions(query),
    fetchEastMoneySuggestions(query),
  ]);
  const staticSuggestions = findStaticFallbackSuggestions(query);
  const remoteSuggestions = mergeSuggestions(providerSuggestions, yahooHttpSuggestions, eastMoneySuggestions);
  return /[^\x00-\x7F]/.test(query)
    ? mergeSuggestions(staticSuggestions, remoteSuggestions)
    : mergeSuggestions(remoteSuggestions, staticSuggestions);
}

function mapYahooSuggestions(items: YahooSearchQuote[]): SearchSuggestion[] {
  return items
    .filter((item) => item.symbol && (item.quoteType === "EQUITY" || item.quoteType === "ETF" || item.quoteType === "INDEX"))
    .map((item) => ({
      symbol: item.symbol || "",
      name: item.shortname || item.longname || item.symbol || "",
      exchDisp: item.exchDisp || "GLOBAL",
      typeDisp: item.typeDisp || "Stock",
    }))
    .slice(0, 8);
}

async function fetchYahooHttpSuggestions(query: string): Promise<SearchSuggestion[]> {
  const tickerQuery = /^\d{3}[0-9A-Z](?:\.T)?$/i.test(query.trim())
    ? query.trim().toUpperCase().replace(/\.T$/, "") + ".T"
    : query.trim();
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(tickerQuery)}&quotesCount=8&newsCount=0`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3500),
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return [];
    const data = await response.json() as YahooHttpSearchResult;
    return mapYahooSuggestions((data.quotes || []).map((item) => ({
      ...item,
      exchDisp: item.exchDisp || item.exchange,
    })));
  } catch (error: unknown) {
    console.warn("Yahoo HTTP search fallback failed:", error);
    return [];
  }
}

function findStaticFallbackSuggestions(query: string): SearchSuggestion[] {
  const normalizedQuery = normalizeAlias(query);
  const rawQuery = query.trim().toLowerCase();

  if (normalizedQuery.length < 3 && rawQuery.length < 2) {
    return [];
  }

  return STATIC_FALLBACK_SUGGESTIONS
    .filter((item) =>
      item.aliases.some((alias) => {
        const normalizedAlias = normalizeAlias(alias);
        return (normalizedQuery.length > 0 && normalizedAlias.startsWith(normalizedQuery)) ||
          (rawQuery.length > 0 && alias.toLowerCase().startsWith(rawQuery));
      }) || item.name.toLowerCase().includes(rawQuery)
    )
    .map((item) => ({
      symbol: item.symbol,
      name: item.name,
      exchDisp: item.exchDisp,
      typeDisp: item.typeDisp,
    }))
    .slice(0, 8);
}

async function fetchEastMoneySuggestions(query: string): Promise<SearchSuggestion[]> {
  try {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}&type=14&token=D43BF722C8E33EFC408CAFD32D7DAD7C`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2500),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return [];

    const data = await res.json() as EastMoneySuggestResponse;
    return (data.QuotationCodeTable?.Data || [])
      .filter((item) => item.Code && isSupportedEastMoneySuggestion(item))
      .map((item) => ({
        symbol: normalizeEastMoneySymbol(item),
        name: item.Name || item.Code || "",
        exchDisp: item.JYS || item.Classify || "GLOBAL",
        typeDisp: item.SecurityTypeName || "Stock",
      }))
      .filter((item) => item.symbol)
      .slice(0, 8);
  } catch (error: unknown) {
    console.warn("EastMoney search fallback failed:", error);
    return [];
  }
}

function isSupportedEastMoneySuggestion(item: EastMoneySuggestItem): boolean {
  const classify = item.Classify || "";
  const type = item.SecurityTypeName || "";
  return (
    classify === "UsStock" ||
    classify === "HKStock" ||
    classify === "AStock" ||
    classify === "JPX" ||
    item.QuoteID?.startsWith("176.") ||
    type.includes("美股") ||
    type.includes("港股") ||
    type.includes("A股")
  );
}

function normalizeEastMoneySymbol(item: EastMoneySuggestItem): string {
  const code = item.Code || "";
  const quoteId = item.QuoteID || "";
  const classify = item.Classify || "";

  if (classify === "HKStock" || quoteId.startsWith("116.")) {
    return `${code.padStart(4, "0")}.HK`;
  }
  if (classify === "JPX" || quoteId.startsWith("176.")) {
    return /^\d{3}[0-9A-Z]$/i.test(code) ? `${code.toUpperCase()}.T` : code;
  }
  if (classify === "AStock" || quoteId.startsWith("1.") || quoteId.startsWith("0.")) {
    if (/^\d{6}$/.test(code)) {
      return code.startsWith("6") ? `${code}.SS` : `${code}.SZ`;
    }
  }
  return code;
}

function mergeSuggestions(...groups: SearchSuggestion[][]): SearchSuggestion[] {
  const seen = new Set<string>();
  const merged: SearchSuggestion[] = [];

  for (const group of groups) {
    for (const suggestion of group) {
      const key = suggestion.symbol.toUpperCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(suggestion);
      if (merged.length >= 8) return merged;
    }
  }

  return merged;
}

function normalizeAlias(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
