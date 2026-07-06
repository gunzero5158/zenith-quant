import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { generateMockCandles } from "@/lib/analysis/mockData";
import { fetchKabutanQuote, getKabutanCode } from "@/lib/analysis/kabutan";
import { fetchProviderQuote } from "@/lib/analysis/marketDataProviders";
import { fetchTencentQuote } from "@/lib/analysis/tencent";
import { fetchEastMoneyJson } from "@/lib/analysis/eastmoneyHttp";
import { convertSymbolToEastMoneyAShareSecid, fetchAShareRealtimeQuote } from "@/lib/analysis/ashareRealtime";

const yahooFinance = new YahooFinance();

// Memory cache for quotes
interface QuoteCacheEntry {
  timestamp: number;
  price: number;
  change: number;
}
const quoteCache: Record<string, QuoteCacheEntry> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
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

interface EastMoneyKline {
  close: number;
}

interface EastMoneySuggestItem {
  Code?: string;
  QuoteID?: string;
  SecurityTypeName?: string;
  Classify?: string;
}

interface EastMoneySuggestResponse {
  QuotationCodeTable?: {
    Data?: EastMoneySuggestItem[];
  };
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
    const quotes: Record<string, { price: number; change: number }> = {};

    for (const sym of symbols) {
      try {
        const quote = await fetchSingleQuote(sym);
        quotes[sym] = {
          price: quote.price,
          change: quote.change,
        };
      } catch (e) {
        console.error(`Error fetching quote for ${sym}:`, e);
        const mock = generateMockCandles(sym, 10, false);
        quotes[sym] = {
          price: mock.price,
          change: mock.changePercent
        };
      }
    }

    return NextResponse.json({ quotes });
  } catch (error: unknown) {
    console.error("Batch quotes API error:", error);
    return NextResponse.json({ error: getErrorMessage(error) || "Internal Server Error" }, { status: 500 });
  }
}

async function fetchSingleQuote(inputSymbol: string): Promise<{ price: number; change: number }> {
  const symbol = await resolveInputSymbol(inputSymbol);
  const now = Date.now();
  const shouldUseCache = convertSymbolToEastMoneyAShareSecid(symbol) === null;
  if (shouldUseCache && quoteCache[inputSymbol] && now - quoteCache[inputSymbol].timestamp < CACHE_TTL) {
    return {
      price: quoteCache[inputSymbol].price,
      change: quoteCache[inputSymbol].change
    };
  }

  const res = await (async () => {
    if (getKabutanCode(symbol)) {
      try {
        const data = await fetchKabutanQuote(symbol);
        return {
          price: data.price,
          change: data.changePercent,
          source: "kabutan"
        };
      } catch (err) {
        console.warn(`Kabutan quote fetch failed for ${symbol}:`, err);
      }
    }

    const aShareQuote = await fetchAShareRealtimeQuote(symbol);
    if (aShareQuote) {
      return {
        price: aShareQuote.price,
        change: aShareQuote.changePercent,
        source: "ashare-realtime"
      };
    }

    // 1. Try EastMoney first as it is fast and requires no proxy
    for (const secid of getEastMoneySecidCandidates(symbol)) {
      try {
        const klines = await fetchReliableEastMoneyKlinesLmt2(secid);
        if (klines && klines.length >= 2) {
          const last = klines[klines.length - 1];
          const prev = klines[klines.length - 2];
          const price = last.close;
          const change = ((last.close - prev.close) / prev.close) * 100;
          return { price, change, source: "eastmoney" };
        }
      } catch (err) {
        console.warn(`EastMoney quote fetch failed for ${symbol} (${secid}):`, err);
      }
    }

    // 2. Fallback to Yahoo Finance
    try {
      const q = await yahooFinance.quote(symbol) as YahooQuote;
      if (q && q.regularMarketPrice !== undefined) {
        return {
          price: q.regularMarketPrice,
          change: q.regularMarketChangePercent || 0,
          source: "yahoo"
        };
      }
    } catch (err) {
      console.warn(`Yahoo quote fetch failed for ${symbol}:`, err);
    }

    // 3. Optional formal API fallback (Twelve Data / FMP)
    const providerQuote = await fetchProviderQuote(symbol);
    if (providerQuote) {
      return {
        price: providerQuote.price,
        change: providerQuote.changePercent,
        source: providerQuote.source,
      };
    }

    const tencentQuote = await fetchTencentQuote(symbol);
    if (tencentQuote) {
      return {
        price: tencentQuote.price,
        change: tencentQuote.changePercent,
        source: "tencent"
      };
    }

    throw new Error("Invalid quote from all real data providers");
  })();

  if (shouldUseCache && res.source !== "tencent") {
    quoteCache[inputSymbol] = {
      timestamp: now,
      price: res.price,
      change: res.change
    };
  }
  return res;
}

async function resolveInputSymbol(input: string): Promise<string> {
  const clean = input.trim().toUpperCase();
  if (isTickerLike(clean)) {
    return clean;
  }

  const resolved = await resolveSymbolFromEastMoney(clean);
  return resolved || clean;
}

function isTickerLike(symbol: string): boolean {
  return (
    /^[A-Z]{1,5}$/.test(symbol) ||
    /^\d{3}[0-9A-Z](?:\.T)?$/.test(symbol) ||
    /^\d{4,5}(?:\.HK)?$/.test(symbol) ||
    /^\d{6}(?:\.(?:SS|SH|SZ))?$/.test(symbol)
  );
}

async function resolveSymbolFromEastMoney(query: string): Promise<string | null> {
  try {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}&type=14&token=D43BF722C8E33EFC408CAFD32D7DAD7C`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      return null;
    }

    const data = await res.json() as EastMoneySuggestResponse;
    const match = (data.QuotationCodeTable?.Data || []).find((item) =>
      item.Code && isSupportedEastMoneySuggestion(item)
    );

    return match ? normalizeEastMoneySymbol(match) : null;
  } catch (error: unknown) {
    console.warn("EastMoney quote symbol resolution failed:", error);
    return null;
  }
}

function isSupportedEastMoneySuggestion(item: EastMoneySuggestItem): boolean {
  const classify = item.Classify || "";
  const type = item.SecurityTypeName || "";
  return (
    classify === "UsStock" ||
    classify === "HKStock" ||
    classify === "AStock" ||
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
  if (classify === "AStock" || quoteId.startsWith("1.") || quoteId.startsWith("0.")) {
    if (/^\d{6}$/.test(code)) {
      return code.startsWith("6") ? `${code}.SS` : `${code}.SZ`;
    }
  }
  return code;
}

function convertSymbolToEastMoneySecid(symbol: string): string | null {
  const clean = symbol.trim().toUpperCase();
  if (clean.endsWith(".SS") || clean.endsWith(".SH")) {
    const code = clean.split(".")[0];
    return `1.${code}`;
  }
  if (clean.endsWith(".SZ")) {
    const code = clean.split(".")[0];
    return `0.${code}`;
  }
  if (/^\d{6}$/.test(clean)) {
    if (clean.startsWith("60") || clean.startsWith("68") || clean.startsWith("90")) {
      return `1.${clean}`;
    } else {
      return `0.${clean}`;
    }
  }
  if (clean.endsWith(".HK")) {
    const rawCode = clean.split(".")[0];
    const code = rawCode.padStart(5, "0");
    return `116.${code}`;
  }
  if (/^\d{4,5}$/.test(clean) && !clean.includes(".")) {
    const code = clean.padStart(5, "0");
    return `116.${code}`;
  }
  if (/^[A-Z]{1,5}$/.test(clean)) {
    return `105.${clean}`;
  }
  return null;
}

function getEastMoneySecidCandidates(symbol: string): string[] {
  const clean = symbol.trim().toUpperCase();
  if (/^[A-Z]{1,5}$/.test(clean)) {
    return [`105.${clean}`, `106.${clean}`, `107.${clean}`];
  }

  const secid = convertSymbolToEastMoneySecid(clean);
  return secid ? [secid] : [];
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
