import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { Candle, IchimokuResult } from "@/lib/analysis/indicators";
import { VolumeAnalysisResult } from "@/lib/analysis/volumeForce";
import { SupportResistanceResult } from "@/lib/analysis/supportResistance";
import { WaveAnalysisResult } from "@/lib/analysis/waveTheory";
import { ChanLunResult } from "@/lib/analysis/chanlun";
import { PatternResult } from "@/lib/analysis/patterns";
import { EntryAssessment, ScoreDetail, toLegacyScoreDetail } from "@/lib/analysis/scoring";
import { StructuredReport } from "@/lib/analysis/fallbackReport";
import { generateLLMReport, LLMConfig } from "@/lib/analysis/llmProxy";
import { generateMockCandles } from "@/lib/analysis/mockData";
import { getMarketCurrencySymbol, normalizeManualSymbolInput, replaceDollarPriceSymbols } from "@/lib/analysis/market";
import { fetchKabutanMarketData, getKabutanCode } from "@/lib/analysis/kabutan";
import { fetchProviderMarketData } from "@/lib/analysis/marketDataProviders";
import { fetchTencentMarketData } from "@/lib/analysis/tencent";
import { buildEastMoneyKlineUrl, fetchEastMoneyJson } from "@/lib/analysis/eastmoneyHttp";
import { fetchTonghuashunMarketData } from "@/lib/analysis/tonghuashun";
import {
  convertSymbolToEastMoneyAShareSecid,
  fetchAShareRealtimeQuote,
  mergeRealtimeQuoteIntoDailyCandles,
} from "@/lib/analysis/ashareRealtime";
import {
  aShareCodeToSuffixedSymbol,
  convertSymbolToEastMoneySecid,
  getEastMoneySecidCandidates,
} from "@/lib/analysis/symbolConversion";
import { buildWeeklyCandles as buildWeeklyCandlesFromDaily } from "@/lib/analysis/weeklyCandles";
import { runAnalysisEngine } from "@/lib/analysis/analysisEngine";
import { EvidenceSnapshot } from "@/lib/analysis/evidence";
import { StrategyAdvice } from "@/lib/analysis/strategyAdvice";
import { validateAiScoreReview, ValidatedAiScoreReview } from "@/lib/analysis/aiScoreReview";
import { buildEvidenceAnalystPrompt } from "@/lib/analysis/analysisPrompt";

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
const EAST_MONEY_TIMEOUT_MS = 3000;
const EAST_MONEY_MAX_HOSTS_PER_REQUEST = 3;
const EAST_MONEY_MAX_TIMEOUT_HOSTS = 2; // a timeout is a strong signal: try at most one more host
const EAST_MONEY_OVERALL_BUDGET_MS = 10000;
const EAST_MONEY_DAILY_CANDLE_LIMIT = 320;
const EAST_MONEY_WEEKLY_CANDLE_LIMIT = 180;

const SUPPORTED_LANGUAGES = ["zh-CN", "zh-TW", "en", "ja"];

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
    snapshot: EvidenceSnapshot;
    entryAssessment: EntryAssessment;
    strategyAdvice: StrategyAdvice;
    localReport: StructuredReport;
    isMock?: boolean;
    dataSource?: 'yahoo' | 'yahoo-chart' | 'eastmoney' | 'tonghuashun' | 'kabutan' | 'tencent' | 'twelve-data' | 'fmp' | 'provider' | 'mock';
  };
}

const techCache: Record<string, CacheEntry> = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const TECH_CACHE_MAX_ENTRIES = 50;
// Coalesce concurrent requests for the same symbol into a single upstream fetch.
const inflightTechFetches = new Map<string, Promise<CacheEntry["data"]>>();
const MIN_REAL_DAILY_CANDLES = 20;

function pruneTechCache(now: number): void {
  const keys = Object.keys(techCache);
  for (const key of keys) {
    if (now - techCache[key].timestamp >= CACHE_TTL) {
      delete techCache[key];
    }
  }

  // Evict oldest entries until we are below the cap.
  while (Object.keys(techCache).length >= TECH_CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;
    for (const key of Object.keys(techCache)) {
      if (techCache[key].timestamp < oldestTimestamp) {
        oldestTimestamp = techCache[key].timestamp;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    delete techCache[oldestKey];
  }
}

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
      signal: AbortSignal.timeout(2500),
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
      return aShareCodeToSuffixedSymbol(code);
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

  // Fetch the EastMoney name at most once and reuse the result below.
  let eastMoneyName: string | null | undefined;
  const getEastMoneyName = async (): Promise<string | null> => {
    if (eastMoneyName === undefined) {
      eastMoneyName = await fetchEastMoneyCompanyName(symbol);
    }
    return eastMoneyName;
  };

  const localMarketName = shouldPreferLocalName ? await getEastMoneyName() : null;
  if (localMarketName) {
    return isMock && !/模拟/u.test(localMarketName) ? `${localMarketName} (模拟数据)` : localMarketName;
  }

  let resolved = companyNameLooksLikeSymbol(symbol, currentName) ? "" : currentBase;

  if (!resolved && englishBase && !companyNameLooksLikeSymbol(symbol, englishBase)) {
    resolved = englishBase;
  }
  if (!resolved) {
    resolved = await getEastMoneyName() || knownCompanyName(symbol) || currentBase || symbol;
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

    if (!symbol) {
      return NextResponse.json({ error: "Missing stock symbol" }, { status: 400 });
    }
    if (typeof symbol !== "string" || symbol.trim().length < 1 || symbol.trim().length > 20) {
      return NextResponse.json({ error: "Invalid stock symbol" }, { status: 400 });
    }
    if (llmConfig !== undefined && llmConfig !== null && (typeof llmConfig !== "object" || Array.isArray(llmConfig))) {
      return NextResponse.json({ error: "Invalid llmConfig: expected an object" }, { status: 400 });
    }

    const effectiveLang = typeof language === "string" && SUPPORTED_LANGUAGES.includes(language) ? language : "zh-CN";

    const requestedSymbol = symbol.trim().toUpperCase();
    const cleanSymbol = await resolveInputSymbol(requestedSymbol);
    // Technical data is language-independent, so cache purely by symbol.
    const cacheKey = cleanSymbol;
    const currencySymbol = getMarketCurrencySymbol(cleanSymbol);
    const now = Date.now();
    const isAShareRequest = convertSymbolToEastMoneyAShareSecid(cleanSymbol) !== null;

    let techData: CacheEntry["data"];

    // Drop expired cache entries as soon as they are encountered.
    if (techCache[cacheKey] && now - techCache[cacheKey].timestamp >= CACHE_TTL) {
      delete techCache[cacheKey];
    }

    // Check if technical data is cached. Mock/demo data is intentionally not reused:
    // a temporary provider outage should not poison later real-data analyses.
    if (!isAShareRequest && techCache[cacheKey] && now - techCache[cacheKey].timestamp < CACHE_TTL && !techCache[cacheKey].data.isMock) {
      techData = techCache[cacheKey].data;
    } else {
      if (techCache[cacheKey]?.data.isMock) {
        delete techCache[cacheKey];
      }

      // Coalesce concurrent requests for the same symbol into a single upstream fetch.
      const existingFetch = inflightTechFetches.get(cacheKey);
      if (existingFetch) {
        techData = await existingFetch;
      } else {
        const techDataPromise = (async (): Promise<CacheEntry["data"]> => {
        // 1. Fetch stock data with fallback to EastMoney and mock data
        let dailyCandles: Candle[] = [];
        let weeklyCandles: Candle[] = [];
        let companyName = cleanSymbol;
        let companyNameEn = "";
        let changePercent = 0;
        let isMock = false;
        let usedRealtimeQuote = false;
        let dataSource: 'yahoo' | 'yahoo-chart' | 'eastmoney' | 'tonghuashun' | 'kabutan' | 'tencent' | 'twelve-data' | 'fmp' | 'provider' | 'mock' = 'yahoo';

        try {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          const threeYearsAgo = new Date();
          threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
          const today = new Date();

          // Fetch quote, historical candles and the EastMoney native name in parallel
          const nameSecid = convertSymbolToEastMoneySecid(cleanSymbol);
          const [quoteResult, dailyResult, weeklyResult, nameResult] = await Promise.allSettled([
            yahooFinance.quote(cleanSymbol) as Promise<YahooQuote>,
            yahooFinance.historical(cleanSymbol, {
              period1: oneYearAgo,
              period2: today,
              interval: "1d",
            }) as Promise<YahooHistoricalCandle[]>,
            yahooFinance.historical(cleanSymbol, {
              period1: threeYearsAgo,
              period2: today,
              interval: "1wk",
            }) as Promise<YahooHistoricalCandle[]>,
            nameSecid
              ? fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${nameSecid}&fields=f58`, {
                  signal: AbortSignal.timeout(2500),
                  headers: { "Referer": "https://quote.eastmoney.com/" }
                }).then(async (nameRes) => nameRes.ok ? (await nameRes.json() as EastMoneyNameResponse) : null)
              : Promise.resolve(null),
          ]);

          if (quoteResult.status === "rejected") {
            console.error("Yahoo Quote error for:", cleanSymbol, quoteResult.reason);
            const err = { message: getErrorMessage(quoteResult.reason) };
            throw new Error(`无法获取股票 [${cleanSymbol}] 的实时报价: ${err?.message || err}`);
          }
          const quote: YahooQuote | null = quoteResult.value;

          companyNameEn = quote?.longName || quote?.shortName || "";
          // Chinese/Native name from EastMoney (fetched in parallel above)
          const nameData = nameResult.status === "fulfilled" ? nameResult.value : null;
          companyName = nameData?.data?.f58 || companyNameEn || cleanSymbol;

          changePercent = quote?.regularMarketChangePercent || 0;

          // 2. Historical candles (fetched in parallel above)
          if (dailyResult.status === "rejected") {
            throw dailyResult.reason;
          }
          if (weeklyResult.status === "rejected") {
            throw weeklyResult.reason;
          }
          const dailyRaw = dailyResult.value;
          const weeklyRaw = weeklyResult.value;

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
                const [dailyRaw, weeklyFetched] = await Promise.all([
                  fetchReliableEastMoneyKlines(secid, false),
                  fetchReliableEastMoneyKlines(secid, true).catch((weeklyErr: unknown) => {
                    console.warn(`EastMoney weekly K-line failed for ${secid}, building weekly candles from daily data:`, weeklyErr);
                    return null;
                  }),
                ]);
                const weeklyRaw: Candle[] = weeklyFetched ?? buildWeeklyCandlesFromDaily(dailyRaw);

                if (dailyRaw.length >= MIN_REAL_DAILY_CANDLES) {
                  dailyCandles = dailyRaw;
                  weeklyCandles = weeklyRaw;

                  const lastCandle = dailyCandles[dailyCandles.length - 1];
                  const prevCandle = dailyCandles[dailyCandles.length - 2] || lastCandle;

                  changePercent = ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100;

                  // Fetch company name from EastMoney Web API
                  try {
                    const nameRes = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f58`, {
                      signal: AbortSignal.timeout(2500),
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
            try {
              console.log(`Fetching Tonghuashun market data for symbol: ${cleanSymbol}`);
              const tonghuashunData = await fetchTonghuashunMarketData(cleanSymbol);
              if (tonghuashunData) {
                dailyCandles = tonghuashunData.dailyCandles;
                weeklyCandles = tonghuashunData.weeklyCandles;
                companyName = tonghuashunData.companyName || cleanSymbol;
                companyNameEn = "";
                changePercent = tonghuashunData.changePercent;
                isMock = false;
                dataSource = "tonghuashun";
                realDataSuccess = true;
                console.log(`Successfully loaded real data from Tonghuashun for: ${companyName}`);
              }
            } catch (tonghuashunErr: unknown) {
              console.warn("Tonghuashun API failed as well:", tonghuashunErr);
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
            console.warn("All real data APIs (Yahoo, Kabutan, EastMoney, Tonghuashun, optional providers) failed, rolling back to mock data.");
            isMock = true;
            dataSource = "mock";
            const mockDaily = generateMockCandles(cleanSymbol, 250, false);
            const mockWeekly = generateMockCandles(cleanSymbol, 150, true);

            dailyCandles = mockDaily.candles;
            weeklyCandles = mockWeekly.candles;
            companyName = mockDaily.companyName;
            changePercent = mockDaily.changePercent;
          }
        }

        if (!isMock && isAShareRequest) {
          const realtimeQuote = await fetchAShareRealtimeQuote(cleanSymbol);
          if (realtimeQuote) {
            changePercent = realtimeQuote.changePercent;
            dailyCandles = mergeRealtimeQuoteIntoDailyCandles(dailyCandles, realtimeQuote);
            if (realtimeQuote.name && companyName === cleanSymbol) {
              companyName = realtimeQuote.name;
            }
            usedRealtimeQuote = true;
            console.log(`Applied A-share realtime quote from ${realtimeQuote.source} for: ${cleanSymbol}`);
          }
        }

        companyName = await improveCompanyName(cleanSymbol, companyName, companyNameEn, isMock);

        // 3. Run the pure analysis engine from the synchronized candle snapshot.
        const engine = runAnalysisEngine({
          symbol: cleanSymbol,
          dailyCandles,
          weeklyCandles,
          asOf: new Date(now).toISOString(),
          language: effectiveLang,
        });

        // Save to tech data structure
        const freshData: CacheEntry["data"] = {
          dailyCandles: engine.dailyCandles,
          weeklyCandles: engine.weeklyCandles,
          price: engine.snapshot.price,
          changePercent,
          companyName,
          companyNameEn,
          indicators: {
            ema5: engine.daily.ema5,
            ema10: engine.daily.ema10,
            ema20: engine.daily.ema20,
            ema60: engine.daily.ema60,
            bollUpper: engine.daily.boll.upper,
            bollMiddle: engine.daily.boll.middle,
            bollLower: engine.daily.boll.lower,
            macdDif: engine.daily.macd.dif,
            macdDea: engine.daily.macd.dea,
            macdHist: engine.daily.macd.hist,
            kdjK: engine.daily.kdj.k,
            kdjD: engine.daily.kdj.d,
            kdjJ: engine.daily.kdj.j,
            rsi: engine.daily.rsi,
            atr: engine.daily.atr,
            ichimoku: engine.daily.ichimoku,
          },
          patterns: engine.patterns,
          wave: engine.wave,
          chanlun: engine.chanlun,
          sr: engine.supportResistance,
          score: engine.legacyScore,
          volumeAnalysis: engine.daily.volume,
          snapshot: engine.snapshot,
          entryAssessment: engine.entryAssessment,
          strategyAdvice: engine.strategyAdvice,
          localReport: engine.localReport,
          isMock,
          dataSource,
        };

          // Write to cache only for primary real market data. Last-resort fallback should retry primary sources next time.
          if (!usedRealtimeQuote && !freshData.isMock && freshData.dataSource !== "tencent") {
            pruneTechCache(Date.now());
            techCache[cacheKey] = {
              timestamp: now,
              data: freshData,
            };
          }

          return freshData;
        })();

        inflightTechFetches.set(cacheKey, techDataPromise);
        try {
          techData = await techDataPromise;
        } finally {
          inflightTechFetches.delete(cacheKey);
        }
      }
    }

    // 4. Generate Report (Either LLM or Fallback)
    let reportOverview = "";
    let reportRecommendation = "";
    let reportTechnical = "";
    let isLLMUsed = false;
    let finalAssessment: EntryAssessment = techData.entryAssessment;
    let aiScoreReview: ValidatedAiScoreReview | undefined;

    if (techData.isMock && useFallback) {
      const fallback = techData.localReport;
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
        const prompt = buildEvidenceAnalystPrompt({
          snapshot: techData.snapshot,
          entryAssessment: techData.entryAssessment,
          strategyAdvice: techData.strategyAdvice,
          dailyCandles: techData.dailyCandles,
          weeklyCandles: techData.weeklyCandles,
          language: effectiveLang,
          currencySymbol,
        });
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
          technicalAnalysis: string;
          strategyCommentary: string;
          scoreReview: unknown;
        }>;
        aiScoreReview = validateAiScoreReview(
          parsed.scoreReview,
          techData.snapshot.items.map((item) => item.id),
          techData.entryAssessment.ruleScore,
          techData.entryAssessment.hardCap
        );
        finalAssessment = {
          ...techData.entryAssessment,
          aiAdjustment: aiScoreReview.appliedAdjustment,
          finalScore: aiScoreReview.finalScore,
        };
        const verifiedScoreBlock = `### ${effectiveLang === "en" ? "Verified entry score" : "经验证的入场评分"}\n- Rule: ${finalAssessment.ruleScore.toFixed(1)}/5\n- AI: ${finalAssessment.aiAdjustment >= 0 ? "+" : ""}${finalAssessment.aiAdjustment.toFixed(1)}\n- Final: ${finalAssessment.finalScore.toFixed(1)}/5\n`;
        reportOverview = `${verifiedScoreBlock}\n${parsed.overview || techData.localReport.overview}`;
        reportRecommendation = `${techData.localReport.recommendation}${parsed.strategyCommentary ? `\n\n### AI\n${parsed.strategyCommentary}` : ""}`;
        reportTechnical = `${techData.localReport.technicalAnalysis}${parsed.technicalAnalysis ? `\n\n### AI\n${parsed.technicalAnalysis}` : ""}`;
        isLLMUsed = true;
      } catch (err: unknown) {
        console.error("LLM Generation or parsing failed:", err);
        // Only fallback to local engine if useFallback is explicitly enabled
        if (useFallback) {
          const fallback = techData.localReport;
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
      const fallback = techData.localReport;
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
    const responseScore = toLegacyScoreDetail(finalAssessment);

    return NextResponse.json({
      symbol: cleanSymbol,
      companyName: techData.companyName,
      companyNameEn: techData.companyNameEn,
      price: techData.price,
      changePercent: techData.changePercent,
      score: responseScore,
      entryAssessment: finalAssessment,
      strategyAdvice: techData.strategyAdvice,
      dataQuality: techData.snapshot.dataQuality,
      aiScoreReview,
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
  return buildUnifiedAnalystPrompt(symbol, data, language, currencySymbol);
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
    signal: AbortSignal.timeout(8000),
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

async function fetchReliableEastMoneyKlines(secid: string, isWeekly: boolean = false): Promise<Candle[]> {
  const klt = isWeekly ? "102" : "101";
  const limit = isWeekly ? EAST_MONEY_WEEKLY_CANDLE_LIMIT : EAST_MONEY_DAILY_CANDLE_LIMIT;
  const startedAt = Date.now();
  let lastError: unknown = null;
  let hostsTried = 0;
  let timeoutCount = 0;

  for (const host of EAST_MONEY_KLINE_HOSTS) {
    // Retry budget: cap the number of hosts, stop early after repeated timeouts,
    // and never exceed the overall time budget for this function.
    if (hostsTried >= EAST_MONEY_MAX_HOSTS_PER_REQUEST) break;
    if (timeoutCount >= EAST_MONEY_MAX_TIMEOUT_HOSTS) break;
    const elapsed = Date.now() - startedAt;
    if (elapsed >= EAST_MONEY_OVERALL_BUDGET_MS) break;

    hostsTried++;
    const remainingBudget = EAST_MONEY_OVERALL_BUDGET_MS - elapsed;
    const perHostTimeout = Math.min(EAST_MONEY_TIMEOUT_MS, remainingBudget);

    try {
      const url = buildEastMoneyKlineUrl({ host, secid, klt, limit });
      const data = await fetchEastMoneyJson<{ data?: { klines?: string[] } }>(url, perHostTimeout);
      const klines = data?.data?.klines;
      if (!klines || klines.length === 0) {
        throw new Error(`EastMoney returned empty K-line data (secid: ${secid})`);
      }

      return parseEastMoneyKlineRows(klines.slice(-limit));
    } catch (error: unknown) {
      lastError = error;
      if (/timeout/i.test(getErrorMessage(error))) {
        timeoutCount++;
      }
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

