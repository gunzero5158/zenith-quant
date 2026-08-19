import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { Candle, IchimokuResult } from "@/lib/analysis/indicators";
import { VolumeAnalysisResult } from "@/lib/analysis/volumeForce";
import { SupportResistanceResult } from "@/lib/analysis/supportResistance";
import { WaveAnalysisResult } from "@/lib/analysis/waveTheory";
import { ChanLunResult } from "@/lib/analysis/chanlun";
import { PatternResult } from "@/lib/analysis/patterns";
import { EntryAssessment, ScoreDetail, toLegacyScoreDetail } from "@/lib/analysis/scoring";
import { generateLocalReport } from "@/lib/analysis/fallbackReport";
import { generateLLMReport, LLMConfig } from "@/lib/analysis/llmProxy";
import { generateMockCandles } from "@/lib/analysis/mockData";
import { getMarketCurrencySymbol, replaceDollarPriceSymbols } from "@/lib/analysis/market";
import { fetchKabutanMarketData, getKabutanCode } from "@/lib/analysis/kabutan";
import { fetchProviderMarketData, hasConfiguredMarketDataProvider } from "@/lib/analysis/marketDataProviders";
import { fetchTencentMarketData } from "@/lib/analysis/tencent";
import { buildEastMoneyKlineUrl, fetchEastMoneyJson } from "@/lib/analysis/eastmoneyHttp";
import { fetchTonghuashunMarketData } from "@/lib/analysis/tonghuashun";
import {
  convertSymbolToEastMoneyAShareSecid,
  fetchAShareRealtimeQuote,
  mergeRealtimeQuoteIntoDailyCandles,
} from "@/lib/analysis/ashareRealtime";
import { convertSymbolToEastMoneySecid, getEastMoneySecidCandidates } from "@/lib/analysis/symbolConversion";
import {
  fetchEastMoneySymbolSuggestions,
  isSupportedEastMoneySuggestion,
  normalizeEastMoneySymbol,
  resolveInputSymbol,
} from "@/lib/analysis/symbolResolver";
import { buildWeeklyCandles as buildWeeklyCandlesFromDaily } from "@/lib/analysis/weeklyCandles";
import { runAnalysisEngine } from "@/lib/analysis/analysisEngine";
import { EvidenceSnapshot } from "@/lib/analysis/evidence";
import { buildStrategyAdvice, StrategyAdvice } from "@/lib/analysis/strategyAdvice";
import { validateAiScoreReview, ValidatedAiScoreReview } from "@/lib/analysis/aiScoreReview";
import { buildEvidenceAnalystPrompt } from "@/lib/analysis/analysisPrompt";
import { AiReportFields, composeAiReport } from "@/lib/analysis/reportComposition";
import { parseLLMJsonResponse } from "@/lib/analysis/llmJson";
import {
  applyAnalysisQuoteSnapshot,
  getShanghaiDateKey,
  parseAnalysisQuoteSnapshot,
  shouldRefreshForQuoteSnapshot,
} from "@/lib/analysis/analysisQuoteSnapshot";
import {
  isMarketDataCacheReusable,
  MARKET_DATA_CACHE_MAX_RETENTION_MS,
} from "@/lib/analysis/analysisCache";
import { runSequentialProviderChain } from "@/lib/analysis/providerCircuitBreaker";
import { getMarketDataPriority, MarketDataProvider } from "@/lib/analysis/marketDataPriority";
import { canUseMockMarketData, DEFAULT_ANALYSIS_MODE, isAnalysisMode } from "@/lib/analysis/analysisMode";
import { fetchYahooJsonViaWindows } from "@/lib/analysis/windowsHttpFallback";
import { buildAiNativeAnalystPrompt } from "@/lib/analysis/aiNativeAnalysisPrompt";
import { validateAiAnalysisResult, toLegacyAiScoreDetail } from "@/lib/analysis/aiAnalysisResult";
import { composeAiNativeReport } from "@/lib/analysis/aiNativeReportComposition";

export const maxDuration = 300;

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

// Per-instance cache for normalized market data and its derived technical snapshot.
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
    isMock?: boolean;
    dataSource?: 'yahoo' | 'yahoo-chart' | 'eastmoney' | 'tonghuashun' | 'kabutan' | 'tencent' | 'twelve-data' | 'fmp' | 'provider' | 'mock';
  };
}

const techCache: Record<string, CacheEntry> = {};
const TECH_CACHE_MAX_ENTRIES = 50;
// Coalesce concurrent requests for the same symbol into a single upstream fetch.
const inflightTechFetches = new Map<string, Promise<CacheEntry["data"]>>();
const MIN_REAL_DAILY_CANDLES = 20;

function pruneTechCache(now: number): void {
  const keys = Object.keys(techCache);
  for (const key of keys) {
    if (now - techCache[key].timestamp > MARKET_DATA_CACHE_MAX_RETENTION_MS) {
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

type AnalysisDataSource = NonNullable<CacheEntry["data"]["dataSource"]>;

interface MarketDataResult {
  dailyCandles: Candle[];
  weeklyCandles: Candle[];
  companyName: string;
  companyNameEn?: string;
  changePercent: number;
  dataSource: Exclude<AnalysisDataSource, "mock" | "provider">;
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

async function fetchYahooSdkMarketData(symbol: string): Promise<MarketDataResult> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const today = new Date();
  const [quote, dailyRaw, weeklyRaw] = await Promise.all([
    yahooFinance.quote(symbol) as Promise<YahooQuote>,
    yahooFinance.historical(symbol, { period1: oneYearAgo, period2: today, interval: "1d" }) as Promise<YahooHistoricalCandle[]>,
    yahooFinance.historical(symbol, { period1: threeYearsAgo, period2: today, interval: "1wk" }) as Promise<YahooHistoricalCandle[]>,
  ]);
  const dailyCandles = dailyRaw.filter(isYahooHistoricalCandle).map((candle) => ({
    date: candle.date,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));
  if (dailyCandles.length < MIN_REAL_DAILY_CANDLES) {
    throw new Error(`Yahoo returned fewer than ${MIN_REAL_DAILY_CANDLES} daily candles`);
  }
  const weeklyCandles = weeklyRaw.filter(isYahooHistoricalCandle).map((candle) => ({
    date: candle.date,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));
  const companyName = quote?.longName || quote?.shortName || symbol;
  return {
    dailyCandles,
    weeklyCandles,
    companyName,
    companyNameEn: companyName,
    changePercent: quote?.regularMarketChangePercent || 0,
    dataSource: "yahoo",
  };
}

async function fetchEastMoneyMarketData(symbol: string): Promise<MarketDataResult> {
  let lastError: unknown = null;
  for (const secid of getEastMoneySecidCandidates(symbol)) {
    try {
      const [dailyCandles, weeklyFetched] = await Promise.all([
        fetchReliableEastMoneyKlines(secid, false),
        fetchReliableEastMoneyKlines(secid, true).catch(() => null),
      ]);
      if (dailyCandles.length < MIN_REAL_DAILY_CANDLES) continue;
      const weeklyCandles = weeklyFetched ?? buildWeeklyCandlesFromDaily(dailyCandles);
      const last = dailyCandles.at(-1)!;
      const previous = dailyCandles.at(-2) || last;
      let companyName = symbol;
      try {
        const response = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f58`, {
          signal: AbortSignal.timeout(2500),
          headers: { Referer: "https://quote.eastmoney.com/" },
        });
        if (response.ok) {
          const data = await response.json() as EastMoneyNameResponse;
          companyName = data.data?.f58 || symbol;
        }
      } catch {
        // The K-line response is valid even if the optional display name fails.
      }
      return {
        dailyCandles,
        weeklyCandles,
        companyName,
        changePercent: previous.close ? ((last.close - previous.close) / previous.close) * 100 : 0,
        dataSource: "eastmoney",
      };
    } catch (error: unknown) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`EastMoney returned no usable data for ${symbol}`);
}

async function fetchMarketDataFromProvider(provider: MarketDataProvider, symbol: string): Promise<MarketDataResult | null> {
  if (provider === "yahoo") return fetchYahooSdkMarketData(symbol);
  if (provider === "yahoo-chart") {
    const data = await fetchYahooChartCandles(symbol);
    return { ...data, dataSource: "yahoo-chart" };
  }
  if (provider === "eastmoney") return fetchEastMoneyMarketData(symbol);
  if (provider === "tonghuashun") {
    const data = await fetchTonghuashunMarketData(symbol);
    return data ? { ...data, companyNameEn: "", dataSource: "tonghuashun" } : null;
  }
  if (provider === "tencent") {
    const data = await fetchTencentMarketData(symbol);
    return data ? { ...data, companyNameEn: "", dataSource: "tencent" } : null;
  }
  if (provider === "kabutan") {
    if (!getKabutanCode(symbol)) return null;
    const data = await fetchKabutanMarketData(symbol);
    return { ...data, companyNameEn: "", dataSource: "kabutan" };
  }
  if (!hasConfiguredMarketDataProvider()) return null;
  const data = await fetchProviderMarketData(symbol);
  return data
    ? {
        ...data,
        companyName: data.companyName || symbol,
        companyNameEn: "",
        dataSource: data.source,
      }
    : null;
}

async function fetchMarketDataByPriority(symbol: string): Promise<MarketDataResult | null> {
  const result = await runSequentialProviderChain(
    getMarketDataPriority(symbol),
    (provider) => fetchMarketDataFromProvider(provider, symbol),
    {
      onFailure: (provider, error) => {
        if (error) console.warn(`${provider} market data failed for ${symbol}:`, error);
      },
    },
  );

  if (!result) return null;
  console.log(`Successfully loaded ${symbol} market data from ${result.value.dataSource}`);
  return result.value;
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
      const match = (await fetchEastMoneySymbolSuggestions(query)).find((item) =>
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
    const { symbol, llmConfig, language, useFallback, quoteSnapshot, analysisMode: requestedAnalysisMode } = body as {
      symbol: string;
      llmConfig?: LLMConfig;
      language?: string;
      useFallback?: boolean;
      quoteSnapshot?: unknown;
      analysisMode?: unknown;
    };

    if (!symbol) {
      return NextResponse.json({ error: "Missing stock symbol" }, { status: 400 });
    }
    if (typeof symbol !== "string" || symbol.trim().length < 1 || symbol.trim().length > 20) {
      return NextResponse.json({ error: "Invalid stock symbol" }, { status: 400 });
    }
    if (llmConfig !== undefined && llmConfig !== null && (typeof llmConfig !== "object" || Array.isArray(llmConfig))) {
      return NextResponse.json({ error: "Invalid llmConfig: expected an object" }, { status: 400 });
    }
    if (requestedAnalysisMode !== undefined && !isAnalysisMode(requestedAnalysisMode)) {
      return NextResponse.json({ error: "Invalid analysisMode" }, { status: 400 });
    }

    const effectiveLang = typeof language === "string" && SUPPORTED_LANGUAGES.includes(language) ? language : "zh-CN";
    const analysisMode = requestedAnalysisMode ?? DEFAULT_ANALYSIS_MODE;
    if (analysisMode === "ai-native" && !llmConfig?.apiKey) {
      const message = effectiveLang === "en"
        ? "AI Native mode requires an API key. Configure a model in Settings."
        : effectiveLang === "ja"
          ? "AI判断モードにはAPIキーが必要です。設定でモデルを構成してください。"
          : "纯 AI 分析需要 API Key，请先在大模型配置中完成设置。";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const requestedSymbol = symbol.trim().toUpperCase();
    const cleanSymbol = await resolveInputSymbol(requestedSymbol);
    // Technical data is language-independent, so cache purely by symbol.
    const cacheKey = cleanSymbol;
    const currencySymbol = getMarketCurrencySymbol(cleanSymbol);
    const now = Date.now();
    const isAShareRequest = convertSymbolToEastMoneyAShareSecid(cleanSymbol) !== null;
    const analysisQuoteSnapshot = isAShareRequest
      ? parseAnalysisQuoteSnapshot(quoteSnapshot, requestedSymbol)
      : null;
    const inflightKey = analysisQuoteSnapshot
      ? `${cacheKey}:${analysisQuoteSnapshot.price}:${analysisQuoteSnapshot.change}`
      : cacheKey;

    let techData: CacheEntry["data"];

    // Trading data expires after ten minutes during a session and at the next session boundary while closed.
    if (techCache[cacheKey] && !isMarketDataCacheReusable(cleanSymbol, techCache[cacheKey].timestamp, now)) {
      delete techCache[cacheKey];
    }
    if (
      techCache[cacheKey]
      && shouldRefreshForQuoteSnapshot(techCache[cacheKey].data.price, analysisQuoteSnapshot)
    ) {
      delete techCache[cacheKey];
    }

    // Check if technical data is cached. Mock/demo data is intentionally not reused:
    // a temporary provider outage should not poison later real-data analyses.
    if (techCache[cacheKey] && !techCache[cacheKey].data.isMock) {
      techData = techCache[cacheKey].data;
    } else {
      if (techCache[cacheKey]?.data.isMock) {
        delete techCache[cacheKey];
      }

      // Coalesce concurrent requests for the same symbol into a single upstream fetch.
      const existingFetch = inflightTechFetches.get(inflightKey);
      if (existingFetch) {
        techData = await existingFetch;
      } else {
        const techDataPromise = (async (): Promise<CacheEntry["data"]> => {
        // Fetch stock data using the configured market-specific provider order.
        let dailyCandles: Candle[] = [];
        let weeklyCandles: Candle[] = [];
        let companyName = cleanSymbol;
        let companyNameEn = "";
        let changePercent = 0;
        let isMock = false;
        let dataSource: 'yahoo' | 'yahoo-chart' | 'eastmoney' | 'tonghuashun' | 'kabutan' | 'tencent' | 'twelve-data' | 'fmp' | 'provider' | 'mock' = 'yahoo';
        const realtimeQuotePromise = isAShareRequest
          ? fetchAShareRealtimeQuote(cleanSymbol)
          : Promise.resolve(null);

        const marketData = await fetchMarketDataByPriority(cleanSymbol);
        if (marketData) {
          dailyCandles = marketData.dailyCandles;
          weeklyCandles = marketData.weeklyCandles;
          companyName = marketData.companyName;
          companyNameEn = marketData.companyNameEn || "";
          changePercent = marketData.changePercent;
          dataSource = marketData.dataSource;
        } else {
          console.warn(`All real market data providers failed for ${cleanSymbol}; using mock data.`);
          isMock = true;
          dataSource = "mock";
          const mockDaily = generateMockCandles(cleanSymbol, 250, false);
          const mockWeekly = generateMockCandles(cleanSymbol, 150, true);
          dailyCandles = mockDaily.candles;
          weeklyCandles = mockWeekly.candles;
          companyName = mockDaily.companyName;
          changePercent = mockDaily.changePercent;
        }

        if (!isMock && isAShareRequest) {
          const realtimeQuote = applyAnalysisQuoteSnapshot(
            await realtimeQuotePromise,
            analysisQuoteSnapshot,
            getShanghaiDateKey(now),
          );
          if (realtimeQuote) {
            changePercent = realtimeQuote.changePercent;
            dailyCandles = mergeRealtimeQuoteIntoDailyCandles(dailyCandles, realtimeQuote);
            if (realtimeQuote.name && companyName === cleanSymbol) {
              companyName = realtimeQuote.name;
            }
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
          isMock,
          dataSource,
        };

          if (!freshData.isMock) {
            pruneTechCache(Date.now());
            techCache[cacheKey] = {
              timestamp: Date.now(),
              data: freshData,
            };
          }

          return freshData;
        })();

        inflightTechFetches.set(inflightKey, techDataPromise);
        try {
          techData = await techDataPromise;
        } finally {
          inflightTechFetches.delete(inflightKey);
        }
      }
    }

    if (techData.isMock && !canUseMockMarketData(analysisMode, useFallback)) {
      const message = effectiveLang === "en"
        ? "Analysis was stopped because live market data is unavailable. Mock candles are never sent to AI."
        : effectiveLang === "ja"
          ? "実データを取得できないため分析を停止しました。模擬データはAIに送信されません。"
          : "真实行情不可用，已停止分析；模拟 K 线不会发送给 AI。";
      return NextResponse.json({ error: message }, { status: 503 });
    }

    if (analysisMode === "ai-native") {

      try {
        const prompt = buildAiNativeAnalystPrompt({
          snapshot: techData.snapshot,
          dailyCandles: techData.dailyCandles,
          weeklyCandles: techData.weeklyCandles,
          language: effectiveLang,
          currencySymbol,
        });
        const reportText = await generateLLMReport(prompt, llmConfig!);
        const parsed = parseLLMJsonResponse<unknown>(reportText);
        const aiResult = validateAiAnalysisResult(
          parsed,
          techData.snapshot,
          effectiveLang as "zh-CN" | "zh-TW" | "en" | "ja"
        );
        const report = composeAiNativeReport(aiResult, effectiveLang);

        return NextResponse.json({
          symbol: cleanSymbol,
          companyName: techData.companyName,
          companyNameEn: techData.companyNameEn,
          price: techData.price,
          changePercent: techData.changePercent,
          score: toLegacyAiScoreDetail(aiResult.scoreAssessment),
          entryAssessment: aiResult.scoreAssessment,
          strategyAdvice: aiResult.strategyAdvice,
          dataQuality: techData.snapshot.dataQuality,
          dailyCandles: techData.dailyCandles,
          weeklyCandles: techData.weeklyCandles,
          indicators: techData.indicators,
          patterns: techData.patterns,
          wave: techData.wave,
          chanlun: techData.chanlun,
          sr: techData.sr,
          volumeAnalysis: techData.volumeAnalysis,
          reportOverview: replaceDollarPriceSymbols(report.overview, currencySymbol),
          reportRecommendation: replaceDollarPriceSymbols(report.recommendation, currencySymbol),
          reportTechnical: replaceDollarPriceSymbols(report.technicalAnalysis, currencySymbol),
          isLLMUsed: true,
          isMock: false,
          dataSource: techData.dataSource,
          currencySymbol,
          analysisMode,
        });
      } catch (err: unknown) {
        console.error("AI Native analysis failed:", err);
        const prefix = effectiveLang === "en"
          ? "AI Native analysis failed"
          : effectiveLang === "ja"
            ? "AI判断に失敗しました"
            : "纯 AI 分析失败";
        return NextResponse.json({ error: `${prefix}: ${summarizeLLMError(err)}` }, { status: 502 });
      }
    }

    // Localized prose is request-specific even when the technical snapshot came from cache.
    const localizedStrategyAdvice = buildStrategyAdvice(
      techData.snapshot,
      techData.entryAssessment,
      effectiveLang
    );
    const localReport = generateLocalReport({
      snapshot: techData.snapshot,
      entryAssessment: techData.entryAssessment,
      strategyAdvice: localizedStrategyAdvice,
    }, effectiveLang);

    // 4. Generate Report (Either LLM or Fallback)
    let reportOverview = "";
    let reportRecommendation = "";
    let reportTechnical = "";
    let isLLMUsed = false;
    let finalAssessment: EntryAssessment = techData.entryAssessment;
    let aiScoreReview: ValidatedAiScoreReview | undefined;

    if (techData.isMock && useFallback) {
      const fallback = localReport;
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
          strategyAdvice: localizedStrategyAdvice,
          dailyCandles: techData.dailyCandles,
          weeklyCandles: techData.weeklyCandles,
          language: effectiveLang,
          currencySymbol,
        });
        const reportText = await generateLLMReport(prompt, llmConfig);
        
        const parsed = parseLLMJsonResponse<AiReportFields & {
          scoreReview: unknown;
        }>(reportText);
        const evidenceIds = techData.snapshot.items.map((item) => item.id);
        aiScoreReview = validateAiScoreReview(
          parsed.scoreReview,
          evidenceIds,
          techData.entryAssessment.ruleScore,
          techData.entryAssessment.hardCap
        );
        finalAssessment = {
          ...techData.entryAssessment,
          aiAdjustment: aiScoreReview.appliedAdjustment,
          aiOutlook: aiScoreReview.review?.outlook,
          finalScore: aiScoreReview.finalScore,
        };
        const composedReport = composeAiReport(parsed, localReport, effectiveLang, evidenceIds);
        reportOverview = composedReport.overview;
        reportRecommendation = composedReport.recommendation;
        reportTechnical = composedReport.technicalAnalysis;
        isLLMUsed = true;
      } catch (err: unknown) {
        console.error("LLM Generation or parsing failed:", err);
        // Only fallback to local engine if useFallback is explicitly enabled
        if (useFallback) {
          const fallback = localReport;
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
      const fallback = localReport;
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
      strategyAdvice: localizedStrategyAdvice,
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
      analysisMode,
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
  let data: YahooChartResponse;
  try {
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
    data = await res.json() as YahooChartResponse;
  } catch (error: unknown) {
    if (process.platform !== "win32") throw error;
    console.warn(`Yahoo Chart Node request failed for ${symbol}; retrying through Windows HTTP stack.`);
    data = await fetchYahooJsonViaWindows<YahooChartResponse>(url, 12000);
  }
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

