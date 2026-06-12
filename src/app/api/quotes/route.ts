import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { generateMockCandles } from "@/lib/analysis/mockData";

const yahooFinance = new YahooFinance();

// Memory cache for quotes
interface QuoteCacheEntry {
  timestamp: number;
  price: number;
  change: number;
}
const quoteCache: Record<string, QuoteCacheEntry> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols");
    if (!symbolsParam) {
      return NextResponse.json({ error: "Missing symbols parameter" }, { status: 400 });
    }

    const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    const quotes: Record<string, { price: number; change: number }> = {};

    await Promise.all(
      symbols.map(async (sym) => {
        try {
          quotes[sym] = await fetchSingleQuoteWithTimeout(sym);
        } catch (e) {
          console.error(`Error fetching quote for ${sym}:`, e);
          const mock = generateMockCandles(sym, 10, false);
          quotes[sym] = {
            price: mock.price,
            change: mock.changePercent
          };
        }
      })
    );

    return NextResponse.json({ quotes });
  } catch (error: any) {
    console.error("Batch quotes API error:", error);
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}

async function fetchSingleQuoteWithTimeout(symbol: string): Promise<{ price: number; change: number }> {
  const now = Date.now();
  if (quoteCache[symbol] && now - quoteCache[symbol].timestamp < CACHE_TTL) {
    return {
      price: quoteCache[symbol].price,
      change: quoteCache[symbol].change
    };
  }

  const fetchPromise = (async () => {
    // 1. Try EastMoney first as it is fast and requires no proxy
    const secid = convertSymbolToEastMoneySecid(symbol);
    if (secid) {
      try {
        const klines = await fetchEastMoneyKlinesLmt2(secid);
        if (klines && klines.length >= 2) {
          const last = klines[klines.length - 1];
          const prev = klines[klines.length - 2];
          const price = last.close;
          const change = ((last.close - prev.close) / prev.close) * 100;
          return { price, change };
        }
      } catch (err) {
        console.warn(`EastMoney quote fetch failed for ${symbol}:`, err);
      }
    }

    // 2. Fallback to Yahoo Finance
    const q = (await yahooFinance.quote(symbol)) as any;
    if (q && q.regularMarketPrice !== undefined) {
      return {
        price: q.regularMarketPrice,
        change: q.regularMarketChangePercent || 0
      };
    }
    throw new Error("Invalid quote from Yahoo");
  })();

  const timeoutPromise = new Promise<{ price: number; change: number }>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), 400)
  );

  const res = await Promise.race([fetchPromise, timeoutPromise]);
  quoteCache[symbol] = {
    timestamp: now,
    price: res.price,
    change: res.change
  };
  return res;
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
  if (clean.endsWith(".T")) {
    const code = clean.split(".")[0];
    return `200.${code}`;
  }
  return null;
}

async function fetchEastMoneyKlinesLmt2(secid: string): Promise<any[]> {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&beg=19900101&end=20991231&lmt=2&ut=fa5fd190ac2ec2c49a057690f96c340f`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://quote.eastmoney.com/"
    }
  });
  if (!res.ok) throw new Error("EastMoney network error");
  const data = await res.json();
  const klines = data?.data?.klines;
  if (!klines || klines.length === 0) throw new Error("No kline data");
  return klines.map((item: string) => {
    const parts = item.split(",");
    return {
      close: parseFloat(parts[2])
    };
  });
}
