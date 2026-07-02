import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { Candle, IchimokuResult, calculateEMA, calculateBOLL, calculateMACD, calculateKDJ, calculateRSI, calculateATR, calculateIchimoku } from "@/lib/analysis/indicators";
import { convertSymbolToSina, fetchSinaAShareKlines } from "./sinaUtils";
import { analyzePriceVolume, VolumeAnalysisResult } from "@/lib/analysis/volumeForce";
import { calculateSupportResistance, SupportResistanceResult } from "@/lib/analysis/supportResistance";
import { analyzeWaveTheory, WaveAnalysisResult } from "@/lib/analysis/waveTheory";
import { analyzeChanLun, ChanLunResult } from "@/lib/analysis/chanlun";
import { analyzePatterns, PatternResult } from "@/lib/analysis/patterns";
import { calculateStockScore, ScoreDetail } from "@/lib/analysis/scoring";
import { generateFallbackReport } from "@/lib/analysis/fallbackReport";
import { generateLLMReport, LLMConfig } from "@/lib/analysis/llmProxy";
import { generateMockCandles } from "@/lib/analysis/mockData";
import { getMarketCurrencySymbol, normalizeManualSymbolInput, replaceDollarPriceSymbols } from "@/lib/analysis/market";
import { fetchKabutanMarketData, getKabutanCode } from "@/lib/analysis/kabutan";
import { fetchProviderMarketData } from "@/lib/analysis/marketDataProviders";
import { fetchTencentMarketData } from "@/lib/analysis/tencent";
import { fetchEastMoneyJson } from "@/lib/analysis/eastmoneyHttp";

const yahooFinance = new YahooFinance();
const EAST_MONEY_KLINE_HOSTS = [
  "push2his.eastmoney.com",
  "1.push2his.eastmoney.com",
  "2.push2his.eastmoney.com",
  "3.push2his.eastmoney.com",
  "4.push2his.eastmoney.com",
  "5.push2his.eastmoney.com",
  "6.push2his.eastmoney.com",
  "7.push2his.eastmoney.com",
  "8.push2his.eastmoney.com",
  "9.push2his.eastmoney.com",
  "10.push2his.eastmoney.com",
];
const EAST_MONEY_TIMEOUT_MS = 6000;
const EAST_MONEY_DAILY_CANDLE_LIMIT = 320;
const EAST_MONEY_WEEKLY_CANDLE_LIMIT = 180;

// Simple in-memory cache for technical analysis data (1 hour TTL)
interface TechnicalIndicators {
  ema5: number[];
  ema10: number[];
  ema20: number[];
  ema60: number[];
  bollUpper: number[];
  bollMiddle: number[];
  bollLower: number[];
  macdDif: number[];
  macdDea: number[];
  macdHist: number[];
  kdjK: number[];
  kdjD: number[];
  kdjJ: number[];
  rsi: number[];
  atr: number[];
  ichimoku: IchimokuResult;
}

interface CacheEntry {
  timestamp: number;
  data: {
    dailyCandles: Candle[];
    weeklyCandles: Candle[];
    indicators: TechnicalIndicators;
    patterns: PatternResult;
    wave: WaveAnalysisResult;
    chanlun: ChanLunResult;
    sr: SupportResistanceResult;
    score: ScoreDetail;
    price: number;
    changePercent: number;
    companyName: string;
    companyNameEn?: string;
    volumeAnalysis: VolumeAnalysisResult;
    isMock?: boolean;
    dataSource?: 'yahoo' | 'yahoo-chart' | 'eastmoney' | 'sina' | 'kabutan' | 'tencent' | 'twelve-data' | 'fmp' | 'provider' | 'mock';
  };
}

const techCache: Record<string, CacheEntry> = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MIN_REAL_DAILY_CANDLES = 20;

interface YahooQuote {
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
}

interface YahooHistoricalCandle {
  date: Date | string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

interface EastMoneyNameResponse {
  data?: {
    f58?: string;
  };
}

interface EastMoneySuggestItem {
  Code?: string;
  Name?: string;
  QuoteID?: string;
  SecurityTypeName?: string;
  Classify?: string;
}

interface EastMoneySuggestResponse {
  QuotationCodeTable?: {
    Data?: EastMoneySuggestItem[];
  };
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        longName?: string;
        shortName?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      description?: string;
    } | null;
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isYahooHistoricalCandle(candle: YahooHistoricalCandle): candle is Required<YahooHistoricalCandle> {
  return (
    candle.open !== undefined &&
    candle.high !== undefined &&
    candle.low !== undefined &&
    candle.close !== undefined &&
    candle.volume !== undefined
  );
}

async function resolveInputSymbol(input: string): Promise<string> {
  const clean = input.trim().toUpperCase();
  const normalized = normalizeManualSymbolInput(clean);
  if (normalized !== clean) {
    return normalized;
  }

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
    console.warn("EastMoney symbol resolution failed:", error);
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

const KNOWN_COMPANY_NAMES: Record<string, string> = {
  AAPL: "Apple Inc.",
  APP: "AppLovin",
  "0700.HK": "腾讯控股",
  "700.HK": "腾讯控股",
  "600519.SS": "贵州茅台",
  "600519.SH": "贵州茅台",
  "600519": "贵州茅台",
  "9984.T": "ソフトバンクグループ",
};

function stripMockNameSuffix(name: string): string {
  return name
    .replace(/\s*\([^)]*(?:模拟数据|模拟股票)[^)]*\)\s*$/u, "")
    .trim();
}

function companyNameLooksLikeSymbol(symbol: string, name: string): boolean {
  const stripped = stripMockNameSuffix(name);
  if (!stripped) return true;
  if (/模拟股票/u.test(name)) return true;

  const cleanSymbol = symbol.trim().toUpperCase();
  const baseSymbol = cleanSymbol.replace(/\.(SS|SH|SZ|HK|T)$/u, "").replace(/^0+(?=\d)/u, "");
  const normalizedName = stripped.toUpperCase().replace(/[\s._-]/gu, "");
  const normalizedSymbol = cleanSymbol.replace(/[\s._-]/gu, "");
  const normalizedBase = baseSymbol.replace(/[\s._-]/gu, "");

  return normalizedName === normalizedSymbol || normalizedName === normalizedBase;
}

function knownCompanyName(symbol: string): string | null {
  const clean = symbol.trim().toUpperCase();
  const hkPadded = clean.endsWith(".HK") ? `${clean.split(".")[0].padStart(4, "0")}.HK` : clean;
  const hkUnpadded = clean.endsWith(".HK") ? `${String(Number(clean.split(".")[0]))}.HK` : clean;

  return KNOWN_COMPANY_NAMES[clean]
    || KNOWN_COMPANY_NAMES[hkPadded]
    || KNOWN_COMPANY_NAMES[hkUnpadded]
    || null;
}

function isChineseMarketSymbol(symbol: string): boolean {
  const clean = symbol.trim().toUpperCase();
  return (
    clean.endsWith(".SS") ||
    clean.endsWith(".SH") ||
    clean.endsWith(".SZ") ||
    clean.endsWith(".HK") ||
    /^\d{6}$/.test(clean)
  );
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9FFF]/u.test(value);
}

async function fetchEastMoneyCompanyName(symbol: string): Promise<string | null> {
  const clean = symbol.trim().toUpperCase();
  const secid = convertSymbolToEastMoneySecid(clean);

  if (secid) {
    try {
      const res = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f58`, {
        signal: AbortSignal.timeout(2500),
        headers: {
          "Referer": "https://quote.eastmoney.com/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (res.ok) {
        const data = await res.json() as EastMoneyNameResponse;
        const name = data?.data?.f58?.trim();
        if (name && !companyNameLooksLikeSymbol(clean, name)) return name;
      }
    } catch {
      // The search endpoint below is a lightweight backup for display names.
    }
  }

  const base = clean.replace(/\.(SS|SH|SZ|HK|T)$/u, "");
  const queries = Array.from(new Set([clean, base, base.replace(/^0+(?=\d)/u, "")].filter(Boolean)));

  for (const query of queries) {
    try {
      const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}&type=14&token=D43BF722C8E33EFC408CAFD32D7DAD7C`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(2500),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) continue;

      const data = await res.json() as EastMoneySuggestResponse;
      const match = (data.QuotationCodeTable?.Data || []).find((item) =>
        item.Name && isSupportedEastMoneySuggestion(item) && normalizeEastMoneySymbol(item) === clean
      );
      if (match?.Name) return match.Name.trim();
    } catch {
      // Keep falling through to known-name map.
    }
  }

  return null;
}

async function improveCompanyName(symbol: string, currentName: string, englishName: string, isMock: boolean): Promise<string> {
  const currentBase = stripMockNameSuffix(currentName);
  const englishBase = stripMockNameSuffix(englishName);
  const shouldPreferLocalName = isChineseMarketSymbol(symbol);

  if (shouldPreferLocalName && currentBase && containsCjk(currentBase) && !companyNameLooksLikeSymbol(symbol, currentBase)) {
    return isMock && !/模拟/u.test(currentBase) ? `${currentBase} (模拟数据)` : currentBase;
  }

  const localMarketName = shouldPreferLocalName ? await fetchEastMoneyCompanyName(symbol) : null;
  if (localMarketName) {
    return isMock && !/模拟/u.test(localMarketName) ? `${localMarketName} (模拟数据)` : localMarketName;
  }

  let resolved = companyNameLooksLikeSymbol(symbol, currentName) ? "" : currentBase;

  if (!resolved && englishBase && !companyNameLooksLikeSymbol(symbol, englishBase)) {
    resolved = englishBase;
  }
  if (!resolved) {
    resolved = await fetchEastMoneyCompanyName(symbol) || knownCompanyName(symbol) || currentBase || symbol;
  }

  if (isMock && !/模拟/u.test(resolved)) {
    return `${resolved} (模拟数据)`;
  }
  return resolved;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { symbol, llmConfig, language, useFallback } = body as { symbol: string; llmConfig?: LLMConfig; language?: string; useFallback?: boolean };
    const effectiveLang = language || "zh-CN";

    if (!symbol) {
      return NextResponse.json({ error: "Missing stock symbol" }, { status: 400 });
    }

    const requestedSymbol = symbol.trim().toUpperCase();
    const cleanSymbol = await resolveInputSymbol(requestedSymbol);
    const cacheKey = `${cleanSymbol}_${effectiveLang}`;
    const currencySymbol = getMarketCurrencySymbol(cleanSymbol);
    const now = Date.now();

    let techData: CacheEntry["data"];

    // Check if technical data is cached. Mock/demo data is intentionally not reused:
    // a temporary provider outage should not poison later real-data analyses.
    if (techCache[cacheKey] && now - techCache[cacheKey].timestamp < CACHE_TTL && !techCache[cacheKey].data.isMock) {
      techData = techCache[cacheKey].data;
    } else {
      if (techCache[cacheKey]?.data.isMock) {
        delete techCache[cacheKey];
      }

      // 1. Fetch stock data with fallback to EastMoney and mock data
      let dailyCandles: Candle[] = [];
      let weeklyCandles: Candle[] = [];
      let companyName = cleanSymbol;
      let companyNameEn = "";
      let currentPrice = 0;
      let changePercent = 0;
      let isMock = false;
      let dataSource: 'yahoo' | 'yahoo-chart' | 'eastmoney' | 'sina' | 'kabutan' | 'tencent' | 'twelve-data' | 'fmp' | 'provider' | 'mock' = 'yahoo';

      try {
        let quote: YahooQuote | null = null;
        try {
          quote = await yahooFinance.quote(cleanSymbol) as YahooQuote;
        } catch (caught: unknown) {
          console.error("Yahoo Quote error for:", cleanSymbol, caught);
          const err = { message: getErrorMessage(caught) };
          throw new Error(`无法获取股票 [${cleanSymbol}] 的实时报价: ${err?.message || err}`);
        }

        companyNameEn = quote?.longName || quote?.shortName || "";
        // Try to fetch Chinese/Native name from EastMoney
        try {
          const secid = convertSymbolToEastMoneySecid(cleanSymbol);
          if (secid) {
            const nameRes = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f58`, {
              headers: { "Referer": "https://quote.eastmoney.com/" }
            });
            if (nameRes.ok) {
              const nameData = await nameRes.json() as EastMoneyNameResponse;
              companyName = nameData?.data?.f58 || companyNameEn || cleanSymbol;
            } else {
              companyName = companyNameEn || cleanSymbol;
            }
          } else {
            companyName = companyNameEn || cleanSymbol;
          }
        } catch {
          companyName = companyNameEn || cleanSymbol;
        }

        currentPrice = quote?.regularMarketPrice || 0;
        changePercent = quote?.regularMarketChangePercent || 0;

        // 2. Fetch historical candles
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
        const today = new Date();

        const dailyRaw = (await yahooFinance.historical(cleanSymbol, {
          period1: oneYearAgo,
          period2: today,
          interval: "1d",
        })) as YahooHistoricalCandle[];

        const weeklyRaw = (await yahooFinance.historical(cleanSymbol, {
          period1: threeYearsAgo,
          period2: today,
          interval: "1wk",
        })) as YahooHistoricalCandle[];

        if (!dailyRaw || dailyRaw.length < MIN_REAL_DAILY_CANDLES) {
          throw new Error(`雅虎财经返回的K线数据长度不足(少于${MIN_REAL_DAILY_CANDLES}天)`);
        }

        dailyCandles = dailyRaw
          .filter(isYahooHistoricalCandle)
          .map((c) => ({
            date: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));

        weeklyCandles = weeklyRaw
          .filter(isYahooHistoricalCandle)
          .map((c) => ({
            date: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));

        dataSource = "yahoo";
      } catch (networkErr: unknown) {
        console.warn("Yahoo Finance fetch failed, attempting Yahoo Chart API:", networkErr);
        let realDataSuccess = false;

        try {
          const chartData = await fetchYahooChartCandles(cleanSymbol);
          dailyCandles = chartData.dailyCandles;
          weeklyCandles = chartData.weeklyCandles;
          companyName = chartData.companyName || cleanSymbol;
          companyNameEn = chartData.companyNameEn || "";
          currentPrice = chartData.price;
          changePercent = chartData.changePercent;
          isMock = false;
          dataSource = "yahoo-chart";
          realDataSuccess = true;
          console.log(`Successfully loaded real data from Yahoo Chart API for: ${companyName}`);
        } catch (chartErr: unknown) {
          console.warn("Yahoo Chart API failed, attempting EastMoney API:", chartErr);
        }

        if (!realDataSuccess && getKabutanCode(cleanSymbol)) {
          try {
            console.log(`Fetching Kabutan daily candles for symbol: ${cleanSymbol}`);
            const kabutanData = await fetchKabutanMarketData(cleanSymbol);
            dailyCandles = kabutanData.dailyCandles;
            weeklyCandles = kabutanData.weeklyCandles;
            companyName = kabutanData.companyName || cleanSymbol;
            companyNameEn = "";
            currentPrice = kabutanData.price;
            changePercent = kabutanData.changePercent;
            isMock = false;
            dataSource = "kabutan";
            realDataSuccess = true;
            console.log(`Successfully loaded real data from Kabutan for: ${companyName}`);
          } catch (kabutanErr: unknown) {
            console.warn("Kabutan API failed, attempting EastMoney API:", kabutanErr);
          }
        }

        const secidCandidates = getEastMoneySecidCandidates(cleanSymbol);
        let eastMoneySuccess = false;

        if (!realDataSuccess && secidCandidates.length > 0) {
          for (const secid of secidCandidates) {
            try {
              console.log(`Fetching EastMoney klines for secid: ${secid}`);
              const dailyRaw = await fetchReliableEastMoneyKlines(secid, false);
              let weeklyRaw: Candle[];
              try {
                weeklyRaw = await fetchReliableEastMoneyKlines(secid, true);
              } catch (weeklyErr: unknown) {
                console.warn(`EastMoney weekly K-line failed for ${secid}, building weekly candles from daily data:`, weeklyErr);
                weeklyRaw = buildWeeklyCandlesFromDaily(dailyRaw);
              }

              if (dailyRaw.length >= MIN_REAL_DAILY_CANDLES) {
                dailyCandles = dailyRaw;
                weeklyCandles = weeklyRaw;

                const lastCandle = dailyCandles[dailyCandles.length - 1];
                const prevCandle = dailyCandles[dailyCandles.length - 2] || lastCandle;

                currentPrice = lastCandle.close;
                changePercent = ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100;

                // Fetch company name from EastMoney Web API
                try {
                  const nameRes = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f58`, {
                    headers: { "Referer": "https://quote.eastmoney.com/" }
                  });
                  if (nameRes.ok) {
                    const nameData = await nameRes.json() as EastMoneyNameResponse;
                    companyName = nameData?.data?.f58 || cleanSymbol;
                  } else {
                    companyName = cleanSymbol;
                  }
                } catch {
                  companyName = cleanSymbol;
                }

                isMock = false;
                dataSource = "eastmoney";
                eastMoneySuccess = true;
                console.log(`Successfully loaded real data from EastMoney for: ${companyName}`);
                break;
              }
            } catch (emErr: unknown) {
              console.error(`EastMoney API failed for ${secid}:`, emErr);
            }
          }
        }

        if (eastMoneySuccess) {
          realDataSuccess = true;
        } else {
          // Try Sina Finance (Only A-share) if EastMoney failed
          const sinaSymbol = convertSymbolToSina(cleanSymbol);
          if (sinaSymbol) {
            try {
              console.log(`Fetching Sina klines for symbol: ${sinaSymbol}`);
              const dailyRaw = await fetchSinaAShareKlines(sinaSymbol, false);
              const weeklyRaw = await fetchSinaAShareKlines(sinaSymbol, true);

              if (dailyRaw.length >= MIN_REAL_DAILY_CANDLES) {
                dailyCandles = dailyRaw;
                weeklyCandles = weeklyRaw;

                const lastCandle = dailyCandles[dailyCandles.length - 1];
                const prevCandle = dailyCandles[dailyCandles.length - 2] || lastCandle;

                currentPrice = lastCandle.close;
                changePercent = ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100;
                companyName = cleanSymbol;

                isMock = false;
                dataSource = "sina";
                realDataSuccess = true;
                console.log(`Successfully loaded real data from Sina for: ${cleanSymbol}`);
              }
            } catch (sinaErr: unknown) {
              console.error("Sina API failed as well:", sinaErr);
            }
          }
        }

        if (!realDataSuccess) {
          try {
            console.log(`Fetching optional provider market data for symbol: ${cleanSymbol}`);
            const providerData = await fetchProviderMarketData(cleanSymbol);
            if (providerData) {
              dailyCandles = providerData.dailyCandles;
              weeklyCandles = providerData.weeklyCandles;
              companyName = providerData.companyName || cleanSymbol;
              companyNameEn = "";
              currentPrice = providerData.price;
              changePercent = providerData.changePercent;
              isMock = false;
              dataSource = providerData.source;
              realDataSuccess = true;
              console.log(`Successfully loaded real data from optional provider for: ${companyName}`);
            }
          } catch (providerErr: unknown) {
            console.warn("Optional provider APIs failed as well:", providerErr);
          }
        }

        if (!realDataSuccess) {
          try {
            console.log(`Fetching Tencent market data for symbol: ${cleanSymbol}`);
            const tencentData = await fetchTencentMarketData(cleanSymbol);
            if (tencentData) {
              dailyCandles = tencentData.dailyCandles;
              weeklyCandles = tencentData.weeklyCandles;
              companyName = tencentData.companyName || cleanSymbol;
              companyNameEn = "";
              currentPrice = tencentData.price;
              changePercent = tencentData.changePercent;
              isMock = false;
              dataSource = "tencent";
              realDataSuccess = true;
              console.log(`Successfully loaded real data from Tencent for: ${companyName}`);
            }
          } catch (tencentErr: unknown) {
            console.warn("Tencent API failed as well:", tencentErr);
          }
        }

        if (!realDataSuccess) {
          console.warn("All real data APIs (Yahoo, Kabutan, EastMoney, Sina, optional providers) failed, rolling back to mock data.");
          isMock = true;
          dataSource = "mock";
          const mockDaily = generateMockCandles(cleanSymbol, 250, false);
          const mockWeekly = generateMockCandles(cleanSymbol, 150, true);

          dailyCandles = mockDaily.candles;
          weeklyCandles = mockWeekly.candles;
          companyName = mockDaily.companyName;
          currentPrice = mockDaily.price;
          changePercent = mockDaily.changePercent;
        }
      }

      const latestPrice = currentPrice || dailyCandles[dailyCandles.length - 1].close;
      companyName = await improveCompanyName(cleanSymbol, companyName, companyNameEn, isMock);

      // 3. Run Technical Calculations
      // Daily Indicators
      const dailyEma5 = calculateEMA(dailyCandles, 5);
      const dailyEma10 = calculateEMA(dailyCandles, 10);
      const dailyEma20 = calculateEMA(dailyCandles, 20);
      const dailyEma60 = calculateEMA(dailyCandles, 60);
      
      const dailyBoll = calculateBOLL(dailyCandles, 20, 2);
      const dailyMacd = calculateMACD(dailyCandles, 12, 26, 9);
      const dailyKdj = calculateKDJ(dailyCandles, 9, 3, 3);
      const dailyRsi = calculateRSI(dailyCandles, 14);
      const dailyAtr = calculateATR(dailyCandles, 14);
      const dailyIchimoku = calculateIchimoku(dailyCandles);

      // Weekly Indicators (for resonance)
      const weeklyEma5 = calculateEMA(weeklyCandles, 5);
      const weeklyEma10 = calculateEMA(weeklyCandles, 10);
      const weeklyEma20 = calculateEMA(weeklyCandles, 20);
      const weeklyEma60 = calculateEMA(weeklyCandles, 60);
      const weeklyMacd = calculateMACD(weeklyCandles, 12, 26, 9);

      // Detailed Engines
      const dailyVolumeAnalysis = analyzePriceVolume(dailyCandles);
      const dailyWaveResult = analyzeWaveTheory(dailyCandles);
      const dailyChanLunResult = analyzeChanLun(dailyCandles);

      const latestIdx = dailyCandles.length - 1;
      const dailyPatterns = analyzePatterns(
        dailyCandles,
        dailyMacd.dif,
        dailyRsi,
        dailyKdj.k
      );

      const dailySupportResistance = calculateSupportResistance(
        dailyCandles,
        latestPrice,
        dailyEma20[latestIdx],
        dailyEma60[latestIdx],
        dailyBoll.upper[latestIdx],
        dailyBoll.lower[latestIdx]
      );

      const stockScore = calculateStockScore(
        dailyCandles,
        { ema5: dailyEma5, ema10: dailyEma10, ema20: dailyEma20, ema60: dailyEma60 },
        dailyMacd,
        dailyKdj,
        dailyRsi,
        dailyAtr,
        dailyIchimoku,
        dailyVolumeAnalysis,
        dailyPatterns,
        dailyWaveResult,
        dailySupportResistance,
        dailyChanLunResult,
        weeklyCandles,
        { ema5: weeklyEma5, ema10: weeklyEma10, ema20: weeklyEma20, ema60: weeklyEma60 },
        weeklyMacd
      );

      // Save to tech data structure
      techData = {
        dailyCandles,
        weeklyCandles,
        price: latestPrice,
        changePercent,
        companyName,
        companyNameEn,
        indicators: {
          ema5: dailyEma5,
          ema10: dailyEma10,
          ema20: dailyEma20,
          ema60: dailyEma60,
          bollUpper: dailyBoll.upper,
          bollMiddle: dailyBoll.middle,
          bollLower: dailyBoll.lower,
          macdDif: dailyMacd.dif,
          macdDea: dailyMacd.dea,
          macdHist: dailyMacd.hist,
          kdjK: dailyKdj.k,
          kdjD: dailyKdj.d,
          kdjJ: dailyKdj.j,
          rsi: dailyRsi,
          atr: dailyAtr,
          ichimoku: dailyIchimoku,
        },
        patterns: dailyPatterns,
        wave: dailyWaveResult,
        chanlun: dailyChanLunResult,
        sr: dailySupportResistance,
        score: stockScore,
        volumeAnalysis: dailyVolumeAnalysis,
        isMock,
        dataSource,
      };

      // Write to cache only for primary real market data. Last-resort fallback should retry primary sources next time.
      if (!techData.isMock && techData.dataSource !== "tencent") {
        techCache[cacheKey] = {
          timestamp: now,
          data: techData,
        };
      }
    }

    // 4. Generate Report (Either LLM or Fallback)
    let reportOverview = "";
    let reportRecommendation = "";
    let reportTechnical = "";
    let isLLMUsed = false;

    if (techData.isMock && useFallback) {
      const fallback = generateFallbackReport(
        `${techData.companyName} (${cleanSymbol})`,
        techData.price,
        techData.changePercent,
        techData.score,
        techData.volumeAnalysis,
        techData.patterns,
        techData.wave,
        techData.chanlun,
        techData.sr,
        effectiveLang,
        buildFallbackExtras(techData)
      );
      const mockPrefix = effectiveLang === "en"
        ? "⚠️ **Live market data is unavailable; this is an offline demo report based on simulated candles. LLM analysis was skipped to avoid analyzing mock data.**\n\n"
        : effectiveLang === "ja"
          ? "⚠️ **リアルタイム市場データを取得できないため、これはシミュレーション足に基づくデモレポートです。模擬データをAIに分析させないため、LLM分析はスキップしました。**\n\n"
          : effectiveLang === "zh-TW"
            ? "⚠️ **真實行情暫不可用，以下為基於模擬K線的離線演示報告。為避免讓 AI 分析模擬數據，本次已跳過大模型分析。**\n\n"
            : "⚠️ **真实行情暂不可用，以下为基于模拟K线的离线演示报告。为避免让 AI 分析模拟数据，本次已跳过大模型分析。**\n\n";
      reportOverview = mockPrefix + fallback.overview;
      reportRecommendation = fallback.recommendation;
      reportTechnical = fallback.technicalAnalysis;
    } else if (llmConfig && llmConfig.apiKey) {
      try {
        const prompt = replaceDollarPriceSymbols(
          buildAnalystPrompt(cleanSymbol, techData, effectiveLang, currencySymbol),
          currencySymbol
        );
        const reportText = await generateLLMReport(prompt, llmConfig);
        
        // Clean markdown blocks if LLM accidentally outputted them
        let cleanedText = reportText.trim();
        if (cleanedText.startsWith("```json")) {
          cleanedText = cleanedText.substring(7);
        } else if (cleanedText.startsWith("```")) {
          cleanedText = cleanedText.substring(3);
        }
        if (cleanedText.endsWith("```")) {
          cleanedText = cleanedText.substring(0, cleanedText.length - 3);
        }
        cleanedText = cleanedText.trim();

        const parsed = JSON.parse(cleanedText) as Partial<{
          overview: string;
          recommendation: string;
          technicalAnalysis: string;
        }>;
        reportOverview = parsed.overview || "";
        reportRecommendation = parsed.recommendation || "";
        reportTechnical = parsed.technicalAnalysis || "";
        isLLMUsed = true;
      } catch (err: unknown) {
        console.error("LLM Generation or parsing failed:", err);
        // Only fallback to local engine if useFallback is explicitly enabled
        if (useFallback) {
          const fallback = generateFallbackReport(
            `${techData.companyName} (${cleanSymbol})`,
            techData.price,
            techData.changePercent,
            techData.score,
            techData.volumeAnalysis,
            techData.patterns,
            techData.wave,
            techData.chanlun,
            techData.sr,
            effectiveLang,
            buildFallbackExtras(techData)
          );
          let errorPrefix = "⚠️ **大模型分析失败，已自动使用本地规则引擎兜底生成。**\n";
          if (effectiveLang === "zh-TW") errorPrefix = "⚠️ **大模型分析失敗，已自動使用本地規則引擎兜底生成。**\n";
          else if (effectiveLang === "en") errorPrefix = "⚠️ **AI analysis failed, fallback report generated by local engine.**\n";
          else if (effectiveLang === "ja") errorPrefix = "⚠️ **AI分析が失敗したため、ローカルルールエンジンによってレポートが生成されました。**\n";
          
          reportOverview = `${errorPrefix}*(Error: ${summarizeLLMError(err)})*\n\n` + fallback.overview;
          reportRecommendation = fallback.recommendation;
          reportTechnical = fallback.technicalAnalysis;
        } else {
          // No fallback allowed: return the raw LLM error
          return NextResponse.json({
            error: `AI 分析失败: ${summarizeLLMError(err)}。请检查您的 API Key 与模型配置，或在“大模型配置”中开启本地算法兜底。`,
          }, { status: 500 });
        }
      }
    } else if (useFallback) {
      // No API key but fallback is enabled
      const fallback = generateFallbackReport(
        `${techData.companyName} (${cleanSymbol})`,
        techData.price,
        techData.changePercent,
        techData.score,
        techData.volumeAnalysis,
        techData.patterns,
        techData.wave,
        techData.chanlun,
        techData.sr,
        effectiveLang,
        buildFallbackExtras(techData)
      );
      reportOverview = fallback.overview;
      reportRecommendation = fallback.recommendation;
      reportTechnical = fallback.technicalAnalysis;
    } else {
      // No API key and no fallback: return error guiding user to configure
      const errMsg = effectiveLang === "en"
        ? "Please configure your LLM API Key in Settings, or enable the local algorithm fallback engine."
        : effectiveLang === "ja"
        ? "設定画面でAIモデルのAPIキーを構成するか、ローカルアルゴリズムのフォールバックを有効にしてください。"
        : "请在右上角“大模型配置”中填写 API Key，或开启本地算法兜底引擎。";
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    reportOverview = replaceDollarPriceSymbols(reportOverview, currencySymbol);
    reportRecommendation = replaceDollarPriceSymbols(reportRecommendation, currencySymbol);
    reportTechnical = replaceDollarPriceSymbols(reportTechnical, currencySymbol);

    return NextResponse.json({
      symbol: cleanSymbol,
      companyName: techData.companyName,
      companyNameEn: techData.companyNameEn,
      price: techData.price,
      changePercent: techData.changePercent,
      score: techData.score,
      dailyCandles: techData.dailyCandles,
      weeklyCandles: techData.weeklyCandles,
      indicators: techData.indicators,
      patterns: techData.patterns,
      wave: techData.wave,
      chanlun: techData.chanlun,
      sr: techData.sr,
      volumeAnalysis: techData.volumeAnalysis,
      reportOverview,
      reportRecommendation,
      reportTechnical,
      isLLMUsed,
      isMock: techData.isMock,
      dataSource: techData.dataSource,
      currencySymbol,
    });
  } catch (error: unknown) {
    console.error("API Analyze main thread error:", error);
    return NextResponse.json({ error: getErrorMessage(error) || "Internal Server Error" }, { status: 500 });
  }
}

function summarizeLLMError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const withoutHtml = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/524|timeout occurred|cloudflare/i.test(withoutHtml)) {
    return "LLM endpoint timeout (524). The local fallback report was generated instead.";
  }

  return withoutHtml.slice(0, 240) || "LLM request failed. The local fallback report was generated instead.";
}

function latestValue(values: number[]): number | undefined {
  for (let i = values.length - 1; i >= 0; i--) {
    if (typeof values[i] === "number" && Number.isFinite(values[i])) return values[i];
  }
  return undefined;
}

function formatMaybe(value: number | undefined, digits: number = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "N/A";
}

function joinMoneyLevels(values: number[], currencySymbol: string): string {
  return values.length > 0 ? values.map((p) => `${currencySymbol}${p}`).join(", ") : "None";
}

function buildFallbackExtras(data: CacheEntry["data"]) {
  const atr = latestValue(data.indicators.atr);
  return {
    atr,
    atrPct: atr && data.price ? (atr / data.price) * 100 : undefined,
    ichimoku: data.indicators.ichimoku,
  };
}

function buildUnifiedAnalystPrompt(symbol: string, data: CacheEntry["data"], language: string, currencySymbol: string): string {
  const score = data.score;
  const sr = data.sr;
  const wave = data.wave;
  const chan = data.chanlun;
  const ichimoku = data.indicators.ichimoku;
  const money = (value: number) => `${currencySymbol}${value}`;
  const moneyFixed = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) ? `${currencySymbol}${value.toFixed(2)}` : "N/A";
  const atr = latestValue(data.indicators.atr);
  const atrPct = atr && data.price ? (atr / data.price) * 100 : undefined;
  const activePatterns = data.patterns.activePatterns.length > 0
    ? data.patterns.activePatterns.map((p) => `${p.name} (${p.bias}, confidence ${Math.round(p.confidence * 100)}%): ${p.description}`).join("\n")
    : "No confirmed actionable classical pattern. Do not force a pattern interpretation.";
  const fibLevels = data.patterns.fibonacciLevels.map((level) => `${level.label}: ${money(level.price)}`).join(", ");
  const vpvrNodes = sr.volumeProfile.nodes.map((node) => `${money(node.price)} (${(node.volumeShare * 100).toFixed(1)}%)`).join(", ") || "None";
  const targetLanguage = language === "en"
    ? "English"
    : language === "ja"
      ? "Japanese"
      : language === "zh-TW"
        ? "Traditional Chinese"
        : "Simplified Chinese";
  const scoreLabel = language === "zh-CN"
    ? "买点魅力分"
    : language === "zh-TW"
      ? "買點魅力分"
      : language === "ja"
        ? "買い場魅力度"
        : "Entry Appeal Score";

  return `You are a senior quantitative technical analyst. Produce a detailed TradingView-style stock analysis report with clear trading logic.

Output language: ${targetLanguage}.
Output format: valid JSON only, no markdown code fence. The JSON keys must be exactly "overview", "recommendation", and "technicalAnalysis".

Stock: ${data.companyName} (${symbol})
Current price: ${moneyFixed(data.price)}
Daily change: ${data.changePercent.toFixed(2)}%

Scoring semantics:
- The 0-5 ${scoreLabel} means current buy/accumulate attractiveness, not recent heat.
- Reward/risk odds are the primary gate; active trading heat alone must not raise the score if upside/downside is poor.
- Setup confirmation is evaluated through left-side reversal, trend pullback, and right-side breakout paths.
- Higher score means better current entry expectancy: higher win-rate, better reward/risk, acceptable stop distance, and stronger confirmation.
- Lower score means avoid buying now, reduce exposure, or wait.

### 1. ${scoreLabel}
- ${scoreLabel}: ${score.totalScore.toFixed(1)} / 5.0
- Reasons:
${score.scoreReasons.map((r) => `  * ${r}`).join("\n")}

### 2. Trend, Volatility, and Ichimoku
- EMA5/10/20/60: ${moneyFixed(latestValue(data.indicators.ema5))}, ${moneyFixed(latestValue(data.indicators.ema10))}, ${moneyFixed(latestValue(data.indicators.ema20))}, ${moneyFixed(latestValue(data.indicators.ema60))}
- Bollinger upper/middle/lower: ${moneyFixed(latestValue(data.indicators.bollUpper))}, ${moneyFixed(latestValue(data.indicators.bollMiddle))}, ${moneyFixed(latestValue(data.indicators.bollLower))}
- ATR14: ${formatMaybe(atr)} (${formatMaybe(atrPct)}% of price)
- Ichimoku signal: ${ichimoku.cloudSignal}
- Ichimoku lines: Tenkan=${moneyFixed(latestValue(ichimoku.tenkanSen))}, Kijun=${moneyFixed(latestValue(ichimoku.kijunSen))}, SpanA=${moneyFixed(latestValue(ichimoku.senkouSpanA))}, SpanB=${moneyFixed(latestValue(ichimoku.senkouSpanB))}
- Ichimoku description: ${ichimoku.cloudDescription}

### 3. Support, Resistance, Fibonacci, and VPVR
- Horizontal supports: ${joinMoneyLevels(sr.horizontalSupports, currencySymbol)}
- Horizontal resistances: ${joinMoneyLevels(sr.horizontalResistances, currencySymbol)}
- Dynamic supports/resistance: EMA20=${money(sr.dynamicSupportEMA20)}, EMA60=${money(sr.dynamicSupportEMA60)}, BOLL upper=${money(sr.dynamicBOLLUpper)}, BOLL lower=${money(sr.dynamicBOLLLower)}
- Fibonacci levels: ${fibLevels}
- VPVR POC: ${money(sr.volumeProfile.poc)}
- VPVR value area: ${money(sr.volumeProfile.valueAreaLow)} - ${money(sr.volumeProfile.valueAreaHigh)}
- VPVR high-volume nodes: ${vpvrNodes}
- Volume support nodes: ${joinMoneyLevels(sr.volumeSupportNodes, currencySymbol)}
- Volume resistance nodes: ${joinMoneyLevels(sr.volumeResistanceNodes, currencySymbol)}

### 4. Momentum and Smart Money
- MACD: DIF=${formatMaybe(latestValue(data.indicators.macdDif))}, DEA=${formatMaybe(latestValue(data.indicators.macdDea))}, Hist=${formatMaybe(latestValue(data.indicators.macdHist))}
- RSI14: ${formatMaybe(latestValue(data.indicators.rsi))}
- KDJ: K=${formatMaybe(latestValue(data.indicators.kdjK))}, D=${formatMaybe(latestValue(data.indicators.kdjD))}, J=${formatMaybe(latestValue(data.indicators.kdjJ))}
- CMF: ${formatMaybe(latestValue(data.volumeAnalysis.cmf), 4)}
- OBV: ${formatMaybe(latestValue(data.volumeAnalysis.obv), 0)}
- Volume 20SMA: ${formatMaybe(latestValue(data.volumeAnalysis.volume20SMA), 0)}
- Volume expanding: ${data.volumeAnalysis.isVolumeExpanding ? "Yes" : "No"}
- Volume breakout: ${data.volumeAnalysis.hasVolumeBreakout ? "Yes" : "No"}
- Price-volume divergence: ${data.volumeAnalysis.hasPriceVolumeDivergence ? "Yes" : "No"}
- Volume description: ${data.volumeAnalysis.volumeDescription}

### 5. Patterns, TD, Wave, and Chanlun
- Active classical patterns:
${activePatterns}
- Pattern summary: ${data.patterns.patternDescription}
- TD signal: ${data.patterns.tdSignal || "None"}
- Elliott wave: ${wave.currentWave}; ${wave.waveDescription}
- Wave points: ${wave.wavePoints.length > 0 ? wave.wavePoints.map((p) => `${p.label}@${money(p.price)}`).join(", ") : "None"}
- Chanlun stroke direction: ${chan.currentStrokeDirection}
- Chanlun structure: ${chan.chanlunDescription}

Writing requirements:
- Use only the provided metrics. Do not invent fundamentals, news, targets, or unseen price levels.
- If a pattern or indicator has no actionable meaning, say it is not actionable and do not overemphasize it.
- The overview must be rich: write 3-4 short paragraphs covering the bull/bear state, trend quality, position of the current price, main risk, and market outlook. Do not just repeat the score reasons.
- The recommendation must use a structured markdown list and cover four dimensions: existing holders, new/left-side entry, add-on/right-side breakout, and risk exit/stop. Cite concrete price levels from EMA/SR/Fibonacci/VPVR/ATR where relevant.
- Clearly distinguish momentum indicators (MACD/KDJ/RSI) from smart-money/volume indicators (CMF/OBV/VPVR).
- The technicalAnalysis field must be detailed and cover these modules in order: 1. MA trend and multi-period resonance, 2. support/resistance, Fibonacci, VPVR and ATR risk unit, 3. momentum indicators (MACD/KDJ/RSI), 4. volume and smart-money flow (CMF/OBV/volume), 5. Ichimoku Cloud, 6. classical chart patterns and divergences, 7. TD Sequential, 8. Elliott Wave, 9. Chanlun structure.
- Keep inactive or non-significant indicators brief, but do not omit the modules above. The final text should read like a full analyst report, not a short summary.

Return JSON only:
{
  "overview": "(3-4 short paragraphs, separated by double newlines.)",
  "recommendation": "(Structured markdown list covering existing holders, left-side entry, right-side/add-on entry, and risk exit/stop.)",
  "technicalAnalysis": "(Detailed module-by-module technical analysis covering all required modules.)"
}`;
}

function buildAnalystPrompt(symbol: string, data: CacheEntry["data"], language: string = "zh-CN", currencySymbol = "$"): string {
  const unifiedPrompt = buildUnifiedAnalystPrompt(symbol, data, language, currencySymbol);
  if (unifiedPrompt) return unifiedPrompt;

  const score = data.score;
  const sr = data.sr;
  const wave = data.wave;
  const chan = data.chanlun;
  const money = (value: number) => `${currencySymbol}${value}`;
  const moneyFixed = (value: number) => `${currencySymbol}${value.toFixed(2)}`;

  // --- 1. ENGLISH PROMPT ---
  if (language === "en") {
    return `Please act as a senior Wall Street quantitative analyst specializing in TradingView stock ideas. Write a professional, highly insightful, and comprehensive stock analysis report.
The stock to analyze is: **${data.companyName} (${symbol})**, currently priced at **${moneyFixed(data.price)}** with a daily change of **${data.changePercent.toFixed(2)}%**.

We have computed technical metrics and patterns using mathematical algorithms. Based on the objective data below, write a professional technical report.

### 1. Moving Average Trends & Multi-Period Resonance
- **Entry Appeal Score**: ${score.totalScore.toFixed(1)} / 5.0
- **Scoring & Resonance Details**:
${score.scoreReasons.map((r: string) => `  * ${r}`).join("\n")}

### 2. Support, Resistance & Volume Profile POC
- **Horizontal Support Levels (Historical Extreme Points)**: ${sr.horizontalSupports.map((p: number) => money(p)).join(", ") || "None"}
- **Horizontal Resistance Levels (Historical Extreme Points)**: ${sr.horizontalResistances.map((p: number) => money(p)).join(", ") || "None"}
- **Point of Control (POC)**: ${money(sr.volumePOC)}
- **Dynamic Moving Average Support**: 20EMA=${money(sr.dynamicSupportEMA20)}, 60EMA=${money(sr.dynamicSupportEMA60)}, BOLL Lower Band=${money(sr.dynamicBOLLLower)}

### 3. Momentum & Oscillator Indicators (MACD/KDJ/RSI)
- **Latest MACD**: DIF=${data.indicators.macdDif[data.indicators.macdDif.length-1]?.toFixed(2)}, DEA=${data.indicators.macdDea[data.indicators.macdDea.length-1]?.toFixed(2)}
- **Latest RSI**: ${data.indicators.rsi[data.indicators.rsi.length-1]?.toFixed(2)}
- **Latest KDJ**: K=${data.indicators.kdjK[data.indicators.kdjK.length-1]?.toFixed(2)}, D=${data.indicators.kdjD[data.indicators.kdjD.length-1]?.toFixed(2)}, J=${data.indicators.kdjJ[data.indicators.kdjJ.length-1]?.toFixed(2)}

### 4. Volume Profile & Smart Money Flow
- **Latest CMF (Chaikin Money Flow)**: ${data.volumeAnalysis.cmf[data.volumeAnalysis.cmf.length-1]?.toFixed(4)} (Note: CMF > 0.05 indicates net inflow; CMF > 0.15 indicates strong inflow; CMF < -0.05 indicates net outflow)
- **Latest OBV (On-Balance Volume)**: ${data.volumeAnalysis.obv[data.volumeAnalysis.obv.length-1]?.toFixed(0)}
- **Volume & Cash Flow Characteristics**: ${data.volumeAnalysis.volumeDescription}
- **Volume Breakout**: ${data.volumeAnalysis.hasVolumeBreakout ? "Yes (Volume Breakout/Volume Selloff)" : "No (No significant volume breakout)"}
- **Price-Volume Divergence**: ${data.volumeAnalysis.hasPriceVolumeDivergence ? "Yes (Warning: Price-Volume Divergence)" : "No (Normal price-volume relationship)"}

### 5. Classical Chart Patterns & Divergences
- **Detected Patterns & Divergences**: ${data.patterns.patternDescription}

### 6.神奇九转 (TD Sequential)
- **TD Signal**: ${data.patterns.tdSignal || "No significant TD signal currently"}

### 7. Elliott Wave Theory
- **Current Wave**: ${wave.currentWave}
- **Structure Description**: ${wave.waveDescription}

### 8. Chanlun (Zenith Theory) Structure
- **Current Stroke Direction**: ${chan.currentStrokeDirection === "up" ? "Upward Stroke" : "Downward Stroke"}
- **Detailed Structure & Central Hub (Pivot)**: ${chan.chanlunDescription}

---
### Writing Requirements & Output Format:
You must output a valid JSON string ONLY. Do not wrap it in markdown block tags (no \`\`\`json or \`\`\`).
The entire JSON output (keys and values) must be written in English.

JSON format template:
{
  "overview": "(This is the overall market analysis overview. Write a rich, insightful summary paragraph of 3-4 short paragraphs, analyzing the overall bull/bear state, core trend, and market outlook. Separate paragraphs with double newlines. Do not mention score details.)",
  "recommendation": "(Structured trading advice in markdown list format covering three dimensions:\n- **Existing holders / bullish positions**: dynamic trailing stop strategy, target EMA level, and key price to reduce exposure.\n- **Left-side entry / preparing to buy**: bottom-fishing suitability, support level to scale in, and confirmation signals.\n- **Right-side breakout / momentum chasers**: breakout confirmation and stop-loss placement.\nEach advice must cite concrete price levels from S/R, EMA, or POC.)",
  "technicalAnalysis": "(Core detailed analysis covering: 1. MA Trends & Multi-Period Resonance, 2. Support, Resistance & POC, 3. Momentum (MACD/KDJ/RSI), 4. Volume & Smart Money (CMF and OBV analysis), 5. Chart Patterns & Divergences, 6. TD Sequential, 7. Elliott Wave, 8. Chanlun Structure. Be detailed and cover all 8 items.)"
}

Write in a professional, Wall-Street quantitative analyst tone. Do not invent facts, base strictly on the metrics provided. Please write the entire report in English.
**Important Note**: Please strictly distinguish between 'Smart Money Flow (represented by CMF and OBV)' and 'Momentum/Oscillators (represented by RSI/KDJ/MACD)'. Do not mix them up in the analysis.`;
  }

  // --- 2. JAPANESE PROMPT ---
  if (language === "ja") {
    return `プロのウォール街金融クオンツアナリストとして、TradingView用の極めて洞察に満ちたプロフェッショナルな株式テクニカル分析レポートを作成してください。
分析対象銘柄: **${data.companyName} (${symbol})**、現在価格: **$${data.price.toFixed(2)}**、本日の騰落率: **${data.changePercent.toFixed(2)}%**。

厳密な数学的アルゴリズムを用いて計算された指標データに基づいて、以下の全方位的なレポートを日本語で作成してください。

### 1. 移動平均線トレンドと複数周期共鳴
- **買い場魅力度**: ${score.totalScore.toFixed(1)} / 5.0 点
- **スコアリングおよび共鳴根拠**:
${score.scoreReasons.map((r: string) => `  * ${r}`).join("\n")}

### 2. サポート・レジスタンスとPOC価格帯出来高
- **水平サポートライン (過去極値)**: ${sr.horizontalSupports.map((p: number) => `$${p}`).join(", ") || "なし"}
- **水平レジスタンスライン (過去極値)**: ${sr.horizontalResistances.map((p: number) => `$${p}`).join(", ") || "なし"}
- **出来高高密度エリア (POC)**: $${sr.volumePOC}
- **動的移動平均線サポート**: 20EMA=$${sr.dynamicSupportEMA20}, 60EMA=$${sr.dynamicSupportEMA60}, BOLL下限=$${sr.dynamicBOLLLower}

### 3. モメンタム・買われすぎ売られすぎ指標 (MACD/KDJ/RSI)
- **MACD最新値**: DIF=${data.indicators.macdDif[data.indicators.macdDif.length-1]?.toFixed(2)}, DEA=${data.indicators.macdDea[data.indicators.macdDea.length-1]?.toFixed(2)}
- **RSI最新値**: ${data.indicators.rsi[data.indicators.rsi.length-1]?.toFixed(2)}
- **KDJ最新値**: K=${data.indicators.kdjK[data.indicators.kdjK.length-1]?.toFixed(2)}, D=${data.indicators.kdjD[data.indicators.kdjD.length-1]?.toFixed(2)}, J=${data.indicators.kdjJ[data.indicators.kdjJ.length-1]?.toFixed(2)}

### 4. 出来高分析と主要資金動向
- **CMF (Chaikin Money Flow) 最新値**: ${data.volumeAnalysis.cmf[data.volumeAnalysis.cmf.length-1]?.toFixed(4)} (注意: CMF > 0.05 は大口の純流入、CMF > 0.15 は強い流入、CMF < -0.05 は大口の純流出を示します)
- **OBV (On-Balance Volume) 最新値**: ${data.volumeAnalysis.obv[data.volumeAnalysis.obv.length-1]?.toFixed(0)}
- **出来高・資金流向特徴**: ${data.volumeAnalysis.volumeDescription}
- **出来高ブレイクアウト**: ${data.volumeAnalysis.hasVolumeBreakout ? "はい (出来高急増ブレイク/急増売り)" : "いいえ"}
- **出来高・価格乖離 (ダイバージェンス)**: ${data.volumeAnalysis.hasPriceVolumeDivergence ? "はい (警告：出来高乖離あり)" : "いいえ"}

### 5. チャートパターンとダイバージェンス
- **検出されたパターン・ダイバージェンス**: ${data.patterns.patternDescription}

### 6. 神奇九転 (TD Sequential)
- **TDシグナル**: ${data.patterns.tdSignal || "現在、明らかな九転シグナルはありません"}

### 7. エリオット波動理論
- **現在の波動**: ${wave.currentWave}
- **波動構造説明**: ${wave.waveDescription}

### 8. 纏論 (チャンルン) 構造
- **現在のストローク方向**: ${chan.currentStrokeDirection === "up" ? "上昇筆" : "下降筆"}
- **構造詳細と中枢**: ${chan.chanlunDescription}

---
### レポート作成要件と出力フォーマット：
出力は有効な JSON 文字列のみにしてください（\`\`\`json などのマークダウンブロックタグで囲まないでください）。
JSON 内のすべてのキーと値は 日本語 で記述してください。

JSON出力フォーマット：
{
  "overview": "（相場分析概況サマリー。全体的なトレンド、重要走勢、後市の判断を分析してください。マークダウンの二重改行を用いて3〜4つの段落に適切に分割し、1つの長い段落にまとめないでください。スコア情報は含めないでください。）",
  "recommendation": "（マークダウンのリスト形式による、次の3つの側面の具体的な取引戦略提案：\n- **既存の保有者 / ロングポジション**: トレーリングストップ戦略、対象移動平均線レベル、およびポジション削減をトリガーする重要価格。\n- **逆張りエントリー / 購入準備**: 底値買いの適否、打診買いのサポート水準、確認用シグナル。\n- **順張りブレイクアウト / モメンタム追随**: ブレイクアウトの確認方法、損切りライン。\n提案には必ず上記のサポート/レジスタンス、EMA、POC等の具体的な数値を引用してください。）",
  "technicalAnalysis": "（核心テクニカル分析。以下の項目を漏れなく詳細に分析してください：1. 移動平均線トレンドと複数周期共鳴、2. サポート・レジスタンスとPOC、3. モメンタム指標、4. 出来高と主要資金動向 (CMFとOBVに基づく)、5. チャートパターンとダイバージェンス、6. 神奇九転、7. エリオット波動、8. 纏論構造。8つのステップすべてを含めてください。）"
}

プロフェッショナルなクオンツアナリストのトーンで記述してください。データを捏造せず、提示された事実のみに基づき日本語で作成してください。
**重要事項**: 「出来高と主要資金動向（CMF/OBVで示される）」と「モメンタム指標（RSI/KDJ/MACDで示される）」は厳格に区別してください。これらを分析内で混同しないでください。`;
  }

  // --- 3. TRADITIONAL CHINESE PROMPT ---
  if (language === "zh-TW") {
    return `請作為一名資深華爾街金融量化分析師，撰寫一篇地道、專業、富有洞察力的 TradingView 股票分析想法（Stock Idea）。
你要分析的股票是: **${data.companyName} (${symbol})**，當前價格為 **$${data.price.toFixed(2)}**，今日漲跌幅為 **${data.changePercent.toFixed(2)}%**。

我們已經使用嚴謹的數學演算法，計算出了這隻股票各項指標和形態識別的客觀結果。請根據以下客觀數據，編寫一份全方位專業技術研報。

### 1. 均線趨勢與多週期共振
- **買點魅力分**: ${score.totalScore.toFixed(1)} / 5.0 分
- **打分與共振依據 (核心動能與均線掃描結果)**:
${score.scoreReasons.map((r: string) => `  * ${r}`).join("\n")}

### 2. 支撐阻力與POC籌碼
- **水平支撐位 (歷史極值點)**: ${sr.horizontalSupports.map((p: number) => `$${p}`).join(", ") || "無"}
- **水平壓力位 (歷史極值點)**: ${sr.horizontalResistances.map((p: number) => `$${p}`).join(", ") || "無"}
- **籌碼密集峰 (POC)**: $${sr.volumePOC}
- **動態均線支撐**: 20EMA=$${sr.dynamicSupportEMA20}, 60EMA=$${sr.dynamicSupportEMA60}, BOLL下軌=$${sr.dynamicBOLLLower}

### 3. 動能與超買超賣指標 (MACD/KDJ/RSI)
- **MACD 最新值**: DIF=${data.indicators.macdDif[data.indicators.macdDif.length-1]?.toFixed(2)}, DEA=${data.indicators.macdDea[data.indicators.macdDea.length-1]?.toFixed(2)}
- **RSI 最新值**: ${data.indicators.rsi[data.indicators.rsi.length-1]?.toFixed(2)}
- **KDJ 最新值**: K=${data.indicators.kdjK[data.indicators.kdjK.length-1]?.toFixed(2)}, D=${data.indicators.kdjD[data.indicators.kdjD.length-1]?.toFixed(2)}, J=${data.indicators.kdjJ[data.indicators.kdjJ.length-1]?.toFixed(2)}

### 4. 量價與主力資金 (買賣力道)
- **CMF (Chaikin Money Flow) 最新值**: ${data.volumeAnalysis.cmf[data.volumeAnalysis.cmf.length-1]?.toFixed(4)} (注意: CMF > 0.05 代表主力淨流入，CMF > 0.15 代表強勁淨流入；CMF < -0.05 代表主力淨流出)
- **OBV (On-Balance Volume) 最新值**: ${data.volumeAnalysis.obv[data.volumeAnalysis.obv.length-1]?.toFixed(0)}
- **量價與資金流向特徵**: ${data.volumeAnalysis.volumeDescription}
- **放量突破**: ${data.volumeAnalysis.hasVolumeBreakout ? "是 (放量突破/放量拋售)" : "否 (無明顯放量突破)"}
- **量價背離**: ${data.volumeAnalysis.hasPriceVolumeDivergence ? "是 (警告：量價背離)" : "否 (量價配合正常)"}

### 5. 經典幾何形態與頂底背離
- **檢測到的形態與背離**: ${data.patterns.patternDescription}

### 6. 神奇九轉 (TD Sequential)
- **TD信號**: ${data.patterns.tdSignal || "當前無明顯九轉信號"}

### 7. 艾略特波浪理論
- **當前浪型**: ${wave.currentWave}
- **結構描述**: ${wave.waveDescription}

### 8. 纏論結構
- **當前畫筆方向**: ${chan.currentStrokeDirection === "up" ? "向上筆" : "向下筆"}
- **結構細節與中樞**: ${chan.chanlunDescription}

---
### 撰寫要求與輸出格式：
您必須僅輸出一個有效的 JSON 字串。請勿使用 markdown 代碼塊包裹它（不要使用 \`\`\`json 或 \`\`\`）。
JSON 內部的所有屬性值必須使用 繁體中文 撰寫。

JSON 格式要求如下：
{
  "overview": "（這裡是智能分析綜述。撰寫一段豐富、深刻且有洞察力的分析綜述，概括整體多空局勢、核心走勢狀態及後市研判。請務必使用 markdown 雙換行進行合理邏輯分段，分為 3-4 個簡短段落，拒絕長篇大論擠在單一長段落中，絕不包含打分邏輯）",
  "recommendation": "（利用 markdown 列表格式提供以下三個維度的具體交易策略建議：\n- **已有持倉 / 準備看多者**: 動態移動止損策略、跟蹤哪一條 EMA、觸發減倉的關鍵支撐位。\n- **左側交易 / 準備建倉者**: 是否適合抄底、在哪個支撐位附近分批建倉、需要等待什麼確認信號。\n- **右側突破 / 動量追隨者**: 是否確認放量突破、哪裡設置止損位。\n每項建議必須引用上述支撐壓力、EMA、POC 的具體價格。絕不可模糊其詞。）",
  "technicalAnalysis": "（核心詳細分析！必須按分類對以下項目進行全面解讀：1.均線趨勢與多週期共振(日周線關係)，2.支撐阻力與POC籌碼，3.動能指標(MACD/KDJ/RSI)，4.量價與主力資金(買賣力道，基於 CMF 和 OBV 深度分析主力意圖與量價健康度，切勿與 3.動能指標 混為一談)，5.經典幾何形態與頂底背離，6.神奇九轉，7.波浪理論，8.纏論結構。分析必須詳實，8個步驟缺一不可。）"
}

請使用 TradingView 獨有的「技術流」大V語調。不要虛構數據，必須嚴格基於上述給出的指標事實，使用 繁體中文 進行解讀。
**特別注意**：請嚴格區分「買賣力道（量價與主力資金，由 CMF 和 OBV 體現）」和「動能/超買超賣（由 RSI/KDJ/MACD 震盪指標體現）」，嚴禁在分析中將它們混淆。`;
  }

  // --- 4. SIMPLIFIED CHINESE PROMPT (DEFAULT) ---
  return `请作为一名资深华尔街金融量化分析师，撰写一篇地道、专业、富有洞察力的 TradingView 股票分析想法（Stock Idea）。
你要分析的股票是: **${data.companyName} (${symbol})**，当前价格为 **$${data.price.toFixed(2)}**，今日涨跌幅为 **${data.changePercent.toFixed(2)}%**。

我们已经使用严谨的数学算法，计算出了这只股票各项指标和形态识别的客观结果。请根据以下客观数据，编写一份全方位的专业技术研报。

### 1. 均线趋势与多周期共振
- **买点魅力分**: ${score.totalScore.toFixed(1)} / 5.0 分
- **打分与共振依据 (核心动能与均线扫描结果)**:
${score.scoreReasons.map((r: string) => `  * ${r}`).join("\n")}

### 2. 支撑阻力与POC筹码
- **水平支撑位 (历史极值点)**: ${sr.horizontalSupports.map((p: number) => `$${p}`).join(", ") || "无"}
- **水平压力位 (历史极值点)**: ${sr.horizontalResistances.map((p: number) => `$${p}`).join(", ") || "无"}
- **筹码密集峰 (POC)**: $${sr.volumePOC}
- **动态均线支撑**: 20EMA=$${sr.dynamicSupportEMA20}, 60EMA=$${sr.dynamicSupportEMA60}, BOLL下轨=$${sr.dynamicBOLLLower}

### 3. 动能与超买超卖指标 (MACD/KDJ/RSI)
- **MACD 最新值**: DIF=${data.indicators.macdDif[data.indicators.macdDif.length-1]?.toFixed(2)}, DEA=${data.indicators.macdDea[data.indicators.macdDea.length-1]?.toFixed(2)}
- **RSI 最新值**: ${data.indicators.rsi[data.indicators.rsi.length-1]?.toFixed(2)}
- **KDJ 最新值**: K=${data.indicators.kdjK[data.indicators.kdjK.length-1]?.toFixed(2)}, D=${data.indicators.kdjD[data.indicators.kdjD.length-1]?.toFixed(2)}, J=${data.indicators.kdjJ[data.indicators.kdjJ.length-1]?.toFixed(2)}

### 4. 量价与主力资金 (买卖力道)
- **CMF (Chaikin Money Flow) 最新值**: ${data.volumeAnalysis.cmf[data.volumeAnalysis.cmf.length-1]?.toFixed(4)} (注意: CMF > 0.05 代表主力净流入，CMF > 0.15 代表强劲净流入；CMF < -0.05 代表主力净流出)
- **OBV (On-Balance Volume) 最新值**: ${data.volumeAnalysis.obv[data.volumeAnalysis.obv.length-1]?.toFixed(0)}
- **量价与资金流向特征**: ${data.volumeAnalysis.volumeDescription}
- **放量突破**: ${data.volumeAnalysis.hasVolumeBreakout ? "是 (放量突破/放量抛售)" : "否 (无明显放量突破)"}
- **量价背离**: ${data.volumeAnalysis.hasPriceVolumeDivergence ? "是 (警告：量价背离)" : "否 (量价配合正常)"}

### 5. 经典几何形态与顶底背离
- **检测到的形态与背离**: ${data.patterns.patternDescription}

### 6. 神奇九转 (TD Sequential)
- **TD信号**: ${data.patterns.tdSignal || "当前无明显九转信号"}

### 7. 艾略特波浪理论
- **当前浪型**: ${wave.currentWave}
- **结构描述**: ${wave.waveDescription}

### 8. 缠论结构
- **当前画笔方向**: ${chan.currentStrokeDirection === "up" ? "向上笔" : "向下笔"}
- **结构细节与中枢**: ${chan.chanlunDescription}

---
### 撰写要求与输出格式：
You must output a valid JSON string ONLY. Do not wrap it in markdown block tags (no \`\`\`json or \`\`\$).
JSON 内的所有属性值必须使用 简体中文 撰写。

JSON 格式要求如下：
{
  "overview": "（这里是智能分析综述。撰写一段丰富、深刻且有洞察力的分析综述，概括整体多空局势、核心走势状态及后市研判。请务必使用 markdown 双换行进行合理逻辑分段，分为 3-4 个简短段落，拒绝长篇大论挤在单一长段落中，绝不包含打分逻辑）",
  "recommendation": "（利用 markdown 列表格式提供以下三个维度的具体交易策略建议：\n- **已有持仓 / 准备看多者**: 动态移动止损策略、跟踪哪一条 EMA、触发减仓的关键支撑位。\n- **左侧交易 / 準備建倉者**: 是否适合抄底、哪个支撑位附近分批建仓、需要等待什么确认信号。\n- **右侧突破 / 动量追随者**: 是否确认放量突破、哪里设置止损位。\n每项建议必须引用上述支撑压力、EMA、POC 的具体价格。绝不可模糊其词。）",
  "technicalAnalysis": "（核心详细分析！必须按分类对以下项目进行全面解读：1.均线趋势与多周期共振(日周线关系)，2.支撑阻力与POC筹码，3.动能指标(MACD/KDJ/RSI)，4.量价与主力资金(买卖力道，基于 CMF 和 OBV 深度分析主力意图与量价健康度，切勿与 3.动能指标 混为一谈)，5.经典几何形态与顶底背离，6.神奇九转，7.波浪理论，8.缠论结构。分析必须详实，8个步骤缺一不可。）"
}

请使用 TradingView 独有的“技术流”大V语调。不要虚构数据，必须严格基于上述给出的指标事实，使用 简体中文 进行解读。
**特别注意**：请严格区分“买卖力道（量价与主力资金，由 CMF 和 OBV 体现）”和“动能/超买超卖（由 RSI/KDJ/MACD 震荡指标体现）”，严禁在分析中将它们混淆。`;
}

async function fetchYahooChartCandles(symbol: string): Promise<{
  dailyCandles: Candle[];
  weeklyCandles: Candle[];
  companyName: string;
  companyNameEn: string;
  price: number;
  changePercent: number;
}> {
  const [daily, weekly] = await Promise.all([
    fetchYahooChartRange(symbol, "1y", "1d"),
    fetchYahooChartRange(symbol, "3y", "1wk"),
  ]);

  if (daily.candles.length < MIN_REAL_DAILY_CANDLES) {
    throw new Error(`Yahoo Chart returned insufficient daily data for ${symbol}`);
  }

  const lastCandle = daily.candles[daily.candles.length - 1];
  const prevCandle = daily.candles[daily.candles.length - 2] || lastCandle;
  const price = daily.meta.regularMarketPrice || lastCandle.close;
  const changePercent = prevCandle.close ? ((price - prevCandle.close) / prevCandle.close) * 100 : 0;
  const companyName = daily.meta.longName || daily.meta.shortName || symbol;

  return {
    dailyCandles: daily.candles,
    weeklyCandles: weekly.candles,
    companyName,
    companyNameEn: companyName,
    price,
    changePercent,
  };
}

async function fetchYahooChartRange(
  symbol: string,
  range: "1y" | "3y",
  interval: "1d" | "1wk"
): Promise<{ candles: Candle[]; meta: NonNullable<NonNullable<YahooChartResponse["chart"]>["result"]>[number]["meta"] & {} }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Chart request failed (${res.status})`);
  }

  const data = await res.json() as YahooChartResponse;
  const result = data.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];

  if (!result || !quote || timestamps.length === 0) {
    throw new Error(data.chart?.error?.description || `Yahoo Chart returned empty data for ${symbol}`);
  }

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];

    if (
      typeof open !== "number" ||
      typeof high !== "number" ||
      typeof low !== "number" ||
      typeof close !== "number" ||
      typeof volume !== "number"
    ) {
      continue;
    }

    candles.push({
      date: new Date(timestamps[i] * 1000).toISOString().split("T")[0],
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return {
    candles,
    meta: result.meta || {},
  };
}

function convertSymbolToEastMoneySecid(symbol: string): string | null {
  const clean = symbol.trim().toUpperCase();

  // 1. A-share (e.g. 600519.SS, 000001.SZ, 300059.SZ, 688001.SH)
  if (clean.endsWith(".SS") || clean.endsWith(".SH")) {
    const code = clean.split(".")[0];
    return `1.${code}`;
  }
  if (clean.endsWith(".SZ")) {
    const code = clean.split(".")[0];
    return `0.${code}`;
  }
  // A-share raw numbers without suffix (e.g. 600519)
  if (/^\d{6}$/.test(clean)) {
    if (clean.startsWith("60") || clean.startsWith("68") || clean.startsWith("90")) {
      return `1.${clean}`;
    } else {
      return `0.${clean}`;
    }
  }

  // 2. HK stock (e.g. 0700.HK, 9988.HK)
  if (clean.endsWith(".HK")) {
    const rawCode = clean.split(".")[0];
    const code = rawCode.padStart(5, "0");
    return `116.${code}`;
  }
  if (/^\d{4,5}$/.test(clean) && !clean.includes(".")) {
    const code = clean.padStart(5, "0");
    return `116.${code}`;
  }

  // 3. US stock (e.g. AAPL, TSLA, MSFT)
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

async function fetchReliableEastMoneyKlines(secid: string, isWeekly: boolean = false): Promise<Candle[]> {
  const klt = isWeekly ? "102" : "101";
  const limit = isWeekly ? EAST_MONEY_WEEKLY_CANDLE_LIMIT : EAST_MONEY_DAILY_CANDLE_LIMIT;
  let lastError: unknown = null;

  for (const host of EAST_MONEY_KLINE_HOSTS) {
    try {
      const url = `https://${host}/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56&klt=${klt}&fqt=1&lmt=${limit}&ut=fa5fd190ac2ec2c49a057690f96c340f`;
      const data = await fetchEastMoneyJson<{ data?: { klines?: string[] } }>(url, EAST_MONEY_TIMEOUT_MS);
      const klines = data?.data?.klines;
      if (!klines || klines.length === 0) {
        throw new Error(`EastMoney returned empty K-line data (secid: ${secid})`);
      }

      return parseEastMoneyKlineRows(klines.slice(-limit));
    } catch (error: unknown) {
      lastError = error;
      console.warn(`EastMoney K-line host failed (${host}, ${secid}, klt=${klt}):`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`EastMoney K-line request failed for ${secid}`);
}

function parseEastMoneyKlineRows(klines: string[]): Candle[] {
  return klines.map((item: string) => {
    const parts = item.split(",");
    return {
      date: parts[0],
      open: parseFloat(parts[1]),
      close: parseFloat(parts[2]),
      high: parseFloat(parts[3]),
      low: parseFloat(parts[4]),
      volume: parseInt(parts[5], 10) || 0
    };
  });
}

function buildWeeklyCandlesFromDaily(dailyCandles: Candle[]): Candle[] {
  const weekly = new Map<string, Candle>();

  for (const candle of dailyCandles) {
    const key = getWeekStart(String(candle.date));
    const current = weekly.get(key);
    if (!current) {
      weekly.set(key, { ...candle, date: key });
      continue;
    }

    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
    current.volume += candle.volume;
  }

  return Array.from(weekly.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function getWeekStart(dateText: string): string {
  const date = new Date(`${dateText.slice(0, 10)}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchEastMoneyKlines(secid: string, isWeekly: boolean = false): Promise<Candle[]> {
  const klt = isWeekly ? "102" : "101";
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56&klt=${klt}&fqt=1&beg=19900101&end=20991231&lmt=300&ut=fa5fd190ac2ec2c49a057690f96c340f`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://quote.eastmoney.com/"
    }
  });

  if (!res.ok) {
    throw new Error(`东财K线接口请求失败, status: ${res.status}`);
  }

  const data = await res.json();
  const klines = data?.data?.klines;

  if (!klines || klines.length === 0) {
    throw new Error(`东财K线数据返回为空 (secid: ${secid})`);
  }

  return klines.map((item: string) => {
    const parts = item.split(",");
    return {
      date: parts[0],
      open: parseFloat(parts[1]),
      close: parseFloat(parts[2]),
      high: parseFloat(parts[3]),
      low: parseFloat(parts[4]),
      volume: parseInt(parts[5], 10) || 0
    };
  });
}
