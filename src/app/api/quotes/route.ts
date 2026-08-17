import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { generateMockCandles } from "@/lib/analysis/mockData";
import { fetchKabutanQuote, getKabutanCode } from "@/lib/analysis/kabutan";
import { fetchProviderQuote } from "@/lib/analysis/marketDataProviders";
import { getRealtimeQuotePriority, type MarketDataProvider } from "@/lib/analysis/marketDataPriority";
import { runSequentialProviderChain } from "@/lib/analysis/providerCircuitBreaker";
import { fetchTencentQuote } from "@/lib/analysis/tencent";
import { fetchEastMoneyJson } from "@/lib/analysis/eastmoneyHttp";
import {
  convertSymbolToEastMoneyAShareSecid,
  fetchEastMoneyAShareRealtimeQuote,
} from "@/lib/analysis/ashareRealtime";
import { fetchTonghuashunQuote } from "@/lib/analysis/tonghuashun";
import { getEastMoneySecidCandidates } from "@/lib/analysis/symbolConversion";
import { resolveInputSymbol } from "@/lib/analysis/symbolResolver";
import { fetchYahooJsonViaWindows } from "@/lib/analysis/windowsHttpFallback";

const yahooFinance = new YahooFinance();

// Memory cache for quotes
interface QuoteCacheEntry {
  timestamp: number;
  price: number;
  change: number;
  source: string;
}
const quoteCache: Record<string, QuoteCacheEntry> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const QUOTE_CACHE_MAX_ENTRIES = 500;
const MAX_SYMBOLS_PER_REQUEST = 25;
const QUOTE_FETCH_CONCURRENCY = 5;
const EAST_MONEY_KLINE_HOSTS = [
  "push2his.eastmoney.com",
  "1.push2his.eastmoney.com",
  "2.push2his.eastmoney.com",
  "3.push2his.eastmoney.com",
];
const EAST_MONEY_TIMEOUT_MS = 1500;

interface YahooQuote {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
}

interface YahooChartQuoteResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
      };
    }>;
  };
}

interface EastMoneyKline {
  close: number;
}

interface QuoteResult {
  price: number;
  change: number;
  source: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols");
    if (!symbolsParam) {
      return NextResponse.json({ error: "Missing symbols parameter" }, { status: 400 });
    }

    const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length > MAX_SYMBOLS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Too many symbols: ${symbols.length} (max ${MAX_SYMBOLS_PER_REQUEST})` },
        { status: 400 }
      );
    }

    const quotes: Record<string, { price: number; change: number; dataSource: string; isMock?: true }> = {};

    let nextSymbolIndex = 0;
    const workers = Array.from(
      { length: Math.min(QUOTE_FETCH_CONCURRENCY, symbols.length) },
      async () => {
        while (nextSymbolIndex < symbols.length) {
          const sym = symbols[nextSymbolIndex++];
          try {
            const quote = await fetchSingleQuote(sym);
            quotes[sym] = {
              price: quote.price,
              change: quote.change,
              dataSource: quote.source,
            };
          } catch (e) {
            console.error(`Error fetching quote for ${sym}:`, e);
            const mock = generateMockCandles(sym, 10, false);
            quotes[sym] = {
              price: mock.price,
              change: mock.changePercent,
              dataSource: "mock",
              isMock: true
            };
          }
        }
      }
    );
    await Promise.allSettled(workers);

    return NextResponse.json({ quotes });
  } catch (error: unknown) {
    console.error("Batch quotes API error:", error);
    return NextResponse.json({ error: getErrorMessage(error) || "Internal Server Error" }, { status: 500 });
  }
}

async function fetchSingleQuote(inputSymbol: string): Promise<QuoteResult> {
  const symbol = await resolveInputSymbol(inputSymbol);
  const now = Date.now();
  const shouldUseCache = convertSymbolToEastMoneyAShareSecid(symbol) === null;
  if (shouldUseCache && quoteCache[inputSymbol] && now - quoteCache[inputSymbol].timestamp < CACHE_TTL) {
    return {
      price: quoteCache[inputSymbol].price,
      change: quoteCache[inputSymbol].change,
      source: quoteCache[inputSymbol].source,
    };
  }

  const providerResult = await runSequentialProviderChain(
    getRealtimeQuotePriority(symbol),
    (provider) => fetchQuoteFromProvider(provider, symbol),
  );
  const res = providerResult?.value ?? null;
  if (!res) {
    throw new Error("Invalid quote from all real data providers");
  }

  if (shouldUseCache && res.source !== "tencent") {
    setQuoteCacheEntry(inputSymbol, {
      timestamp: now,
      price: res.price,
      change: res.change,
      source: res.source,
    });
  }
  return res;
}

async function fetchQuoteFromProvider(
  provider: MarketDataProvider,
  symbol: string
): Promise<QuoteResult | null> {
  try {
    if (provider === "eastmoney") {
      try {
        const aShareQuote = await fetchEastMoneyAShareRealtimeQuote(symbol);
        if (aShareQuote) {
          return {
            price: aShareQuote.price,
            change: aShareQuote.changePercent,
            source: "eastmoney",
          };
        }
      } catch (error: unknown) {
        console.warn(`EastMoney realtime quote failed for ${symbol}:`, error);
      }

      for (const secid of getEastMoneySecidCandidates(symbol)) {
        try {
          const klines = await fetchReliableEastMoneyKlinesLmt2(secid);
          if (klines.length >= 2) {
            const last = klines[klines.length - 1];
            const prev = klines[klines.length - 2];
            return {
              price: last.close,
              change: ((last.close - prev.close) / prev.close) * 100,
              source: "eastmoney",
            };
          }
        } catch (error: unknown) {
          console.warn(`EastMoney K-line quote failed for ${symbol} (${secid}):`, error);
        }
      }
      return null;
    }

    if (provider === "tonghuashun") {
      const quote = await fetchTonghuashunQuote(symbol);
      return quote
        ? { price: quote.price, change: quote.changePercent, source: "tonghuashun" }
        : null;
    }

    if (provider === "tencent") {
      const quote = await fetchTencentQuote(symbol);
      return quote
        ? { price: quote.price, change: quote.changePercent, source: "tencent" }
        : null;
    }

    if (provider === "yahoo") {
      let quote: YahooQuote;
      try {
        quote = await yahooFinance.quote(symbol) as YahooQuote;
      } catch (error: unknown) {
        if (process.platform !== "win32") throw error;
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
        const data = await fetchYahooJsonViaWindows<YahooChartQuoteResponse>(url, 12000);
        const meta = data.chart?.result?.[0]?.meta;
        const price = meta?.regularMarketPrice;
        const previousClose = meta?.chartPreviousClose;
        quote = {
          regularMarketPrice: price,
          regularMarketChangePercent:
            typeof price === "number" && typeof previousClose === "number" && previousClose !== 0
              ? ((price - previousClose) / previousClose) * 100
              : 0,
        };
      }
      return quote?.regularMarketPrice !== undefined
        ? {
            price: quote.regularMarketPrice,
            change: quote.regularMarketChangePercent || 0,
            source: "yahoo",
          }
        : null;
    }

    if (provider === "kabutan" && getKabutanCode(symbol)) {
      const quote = await fetchKabutanQuote(symbol);
      return { price: quote.price, change: quote.changePercent, source: "kabutan" };
    }

    if (provider === "optional-provider") {
      const quote = await fetchProviderQuote(symbol);
      return quote
        ? { price: quote.price, change: quote.changePercent, source: quote.source }
        : null;
    }

    return null;
  } catch (error: unknown) {
    console.warn(`${provider} quote fetch failed for ${symbol}:`, error);
    return null;
  }
}

function setQuoteCacheEntry(key: string, entry: QuoteCacheEntry): void {
  if (!(key in quoteCache) && Object.keys(quoteCache).length >= QUOTE_CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;
    for (const [cachedKey, cachedEntry] of Object.entries(quoteCache)) {
      if (cachedEntry.timestamp < oldestTimestamp) {
        oldestTimestamp = cachedEntry.timestamp;
        oldestKey = cachedKey;
      }
    }
    if (oldestKey !== null) {
      delete quoteCache[oldestKey];
    }
  }
  quoteCache[key] = entry;
}

async function fetchReliableEastMoneyKlinesLmt2(secid: string): Promise<EastMoneyKline[]> {
  let lastError: unknown = null;

  for (const host of EAST_MONEY_KLINE_HOSTS) {
    try {
      const url = `https://${host}/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&beg=19900101&end=20991231&lmt=2&ut=fa5fd190ac2ec2c49a057690f96c340f`;
      const data = await fetchEastMoneyJson<{ data?: { klines?: string[] } }>(url, EAST_MONEY_TIMEOUT_MS);
      const klines = data?.data?.klines;
      if (!klines || klines.length === 0) throw new Error("No kline data");
      return parseEastMoneyQuoteRows(klines.slice(-2));
    } catch (error: unknown) {
      lastError = error;
      console.warn(`EastMoney quote host failed (${host}, ${secid}):`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`EastMoney quote request failed for ${secid}`);
}

function parseEastMoneyQuoteRows(klines: string[]): EastMoneyKline[] {
  return klines.map((item: string) => {
    const parts = item.split(",");
    return {
      close: parseFloat(parts[2])
    };
  });
}
