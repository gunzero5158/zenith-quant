import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { fetchProviderSearchSuggestions } from "@/lib/analysis/marketDataProviders";
import { fetchYahooJsonViaWindows } from "@/lib/analysis/windowsHttpFallback";
import {
  fetchEastMoneySymbolSuggestions,
  isSupportedEastMoneySuggestion,
  normalizeEastMoneySymbol,
} from "@/lib/analysis/symbolResolver";

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
  if (staticSuggestions.length > 0) {
    return NextResponse.json({ quotes: staticSuggestions });
  }

  const quotes = await firstNonEmptySuggestions([
    fetchYahooSdkSuggestions(cleanQuery),
    fetchYahooHttpSuggestions(cleanQuery),
    fetchProviderSearchSuggestions(cleanQuery),
    fetchEastMoneySuggestions(cleanQuery),
  ]);
  return NextResponse.json({ quotes });
}

async function fetchYahooSdkSuggestions(query: string): Promise<SearchSuggestion[]> {
  try {
    const result = await yahooFinance.search(query, { newsCount: 0 }) as YahooSearchResult;
    return mapYahooSuggestions(result.quotes || [], query);
  } catch (error: unknown) {
    console.warn("Yahoo search API failed:", error);
    return [];
  }
}

async function firstNonEmptySuggestions(
  sources: Array<Promise<SearchSuggestion[]>>
): Promise<SearchSuggestion[]> {
  if (sources.length === 0) return [];
  try {
    return await Promise.any(sources.map(async (source) => {
      const suggestions = await source;
      if (suggestions.length === 0) throw new Error("Empty search source");
      return suggestions;
    }));
  } catch {
    return [];
  }
}

function mapYahooSuggestions(items: YahooSearchQuote[], query: string): SearchSuggestion[] {
  const normalizedQuery = query.trim().toUpperCase();
  return items
    .filter((item) => item.symbol && (item.quoteType === "EQUITY" || item.quoteType === "ETF" || item.quoteType === "INDEX"))
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const rank = ({ item, index }: { item: YahooSearchQuote; index: number }) => {
        const symbol = item.symbol?.toUpperCase() || "";
        const exchange = item.exchDisp?.toLowerCase() || "";
        if (symbol === normalizedQuery) return -100;
        if (/\.(?:T|HK|SS|SZ)$/.test(symbol)) return -50 + index;
        if (exchange.includes("otc")) return 100 + index;
        return index;
      };
      return rank(left) - rank(right);
    })
    .map(({ item }) => item)
    .map((item) => ({
      symbol: item.symbol || "",
      name: item.shortname || item.longname || item.symbol || "",
      exchDisp: item.exchDisp || "GLOBAL",
      typeDisp: item.typeDisp || "Stock",
    }))
    .slice(0, 8);
}

async function fetchYahooHttpSuggestions(query: string): Promise<SearchSuggestion[]> {
  const tickerQuery = query.trim();
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(tickerQuery)}&quotesCount=8&newsCount=0`;
    let data: YahooHttpSearchResult;
    if (process.platform === "win32") {
      data = await fetchYahooJsonViaWindows<YahooHttpSearchResult>(url, 4000);
    } else {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(3500),
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (!response.ok) return [];
      data = await response.json() as YahooHttpSearchResult;
    }
    return mapYahooSuggestions((data.quotes || []).map((item) => ({
      ...item,
      exchDisp: item.exchDisp || item.exchange,
    })), query);
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
  return (await fetchEastMoneySymbolSuggestions(query))
    .filter((item) => item.Code && isSupportedEastMoneySuggestion(item))
    .map((item) => ({
      symbol: normalizeEastMoneySymbol(item),
      name: item.Name || item.Code || "",
      exchDisp: item.JYS || item.Classify || "GLOBAL",
      typeDisp: item.SecurityTypeName || "Stock",
    }))
    .filter((item) => item.symbol)
    .slice(0, 8);
}

function normalizeAlias(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
