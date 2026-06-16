import { Candle } from "@/lib/analysis/indicators";

export interface ProviderQuote {
  price: number;
  changePercent: number;
  companyName?: string;
  source: "twelve-data" | "fmp";
}

export interface ProviderMarketData extends ProviderQuote {
  dailyCandles: Candle[];
  weeklyCandles: Candle[];
}

export interface ProviderSearchSuggestion {
  symbol: string;
  name: string;
  exchDisp: string;
  typeDisp: string;
}

interface TwelveDataQuoteResponse {
  name?: string;
  close?: string;
  percent_change?: string;
  code?: number;
  message?: string;
}

interface TwelveDataTimeSeriesResponse {
  meta?: {
    symbol?: string;
    name?: string;
  };
  values?: Array<{
    datetime?: string;
    open?: string;
    high?: string;
    low?: string;
    close?: string;
    volume?: string;
  }>;
  code?: number;
  message?: string;
}

interface TwelveDataSymbolSearchResponse {
  data?: Array<{
    symbol?: string;
    instrument_name?: string;
    exchange?: string;
    type?: string;
  }>;
}

interface FmpQuoteResponse {
  symbol?: string;
  name?: string;
  price?: number;
  changesPercentage?: number;
  exchange?: string;
}

interface FmpHistoricalResponse {
  historical?: Array<{
    date?: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
  }>;
}

interface FmpSearchResponse {
  symbol?: string;
  name?: string;
  exchangeShortName?: string;
  stockExchange?: string;
}

const PROVIDER_TIMEOUT_MS = 4500;

export async function fetchProviderQuote(symbol: string): Promise<ProviderQuote | null> {
  const twelve = await fetchTwelveDataQuote(symbol);
  if (twelve) return twelve;

  return fetchFmpQuote(symbol);
}

export async function fetchProviderMarketData(symbol: string): Promise<ProviderMarketData | null> {
  const twelve = await fetchTwelveDataMarketData(symbol);
  if (twelve) return twelve;

  return fetchFmpMarketData(symbol);
}

export async function fetchProviderSearchSuggestions(query: string): Promise<ProviderSearchSuggestion[]> {
  const twelve = await fetchTwelveDataSearchSuggestions(query);
  if (twelve.length > 0) return twelve;

  return fetchFmpSearchSuggestions(query);
}

export function hasConfiguredMarketDataProvider(): boolean {
  return Boolean(getTwelveDataApiKey() || getFmpApiKey());
}

async function fetchTwelveDataQuote(symbol: string): Promise<ProviderQuote | null> {
  const apiKey = getTwelveDataApiKey();
  if (!apiKey) return null;

  try {
    const data = await fetchJson<TwelveDataQuoteResponse>(
      `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`
    );
    if (data.code || data.message) return null;

    const price = parseProviderNumber(data.close);
    if (price === null) return null;

    return {
      price,
      changePercent: parseProviderNumber(data.percent_change) ?? 0,
      companyName: data.name,
      source: "twelve-data",
    };
  } catch (error: unknown) {
    console.warn("Twelve Data quote fallback failed:", error);
    return null;
  }
}

async function fetchTwelveDataMarketData(symbol: string): Promise<ProviderMarketData | null> {
  const apiKey = getTwelveDataApiKey();
  if (!apiKey) return null;

  try {
    const daily = await fetchTwelveDataTimeSeries(symbol, "1day", 260, apiKey);
    if (daily.candles.length < 65) return null;

    const weekly = await fetchTwelveDataTimeSeries(symbol, "1week", 170, apiKey);
    const weeklyCandles = weekly.candles.length > 0 ? weekly.candles : buildWeeklyCandles(daily.candles);
    const last = daily.candles[daily.candles.length - 1];
    const prev = daily.candles[daily.candles.length - 2] || last;

    return {
      dailyCandles: daily.candles,
      weeklyCandles,
      price: last.close,
      changePercent: prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0,
      companyName: daily.companyName || weekly.companyName || symbol,
      source: "twelve-data",
    };
  } catch (error: unknown) {
    console.warn("Twelve Data market data fallback failed:", error);
    return null;
  }
}

async function fetchTwelveDataTimeSeries(
  symbol: string,
  interval: "1day" | "1week",
  outputsize: number,
  apiKey: string
): Promise<{ companyName: string; candles: Candle[] }> {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson<TwelveDataTimeSeriesResponse>(url);
  if (data.code || data.message || !data.values) {
    return { companyName: "", candles: [] };
  }

  return {
    companyName: data.meta?.name || data.meta?.symbol || "",
    candles: data.values
      .map((item) => parseProviderCandle({
        date: item.datetime,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      }))
      .filter((item): item is Candle => item !== null)
      .sort((a, b) => String(a.date).localeCompare(String(b.date))),
  };
}

async function fetchTwelveDataSearchSuggestions(query: string): Promise<ProviderSearchSuggestion[]> {
  const apiKey = getTwelveDataApiKey();
  if (!apiKey) return [];

  try {
    const data = await fetchJson<TwelveDataSymbolSearchResponse>(
      `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${encodeURIComponent(apiKey)}`
    );

    return (data.data || [])
      .filter((item) => item.symbol)
      .map((item) => ({
        symbol: item.symbol || "",
        name: item.instrument_name || item.symbol || "",
        exchDisp: item.exchange || "GLOBAL",
        typeDisp: item.type || "Stock",
      }))
      .slice(0, 8);
  } catch (error: unknown) {
    console.warn("Twelve Data search fallback failed:", error);
    return [];
  }
}

async function fetchFmpQuote(symbol: string): Promise<ProviderQuote | null> {
  const apiKey = getFmpApiKey();
  if (!apiKey) return null;

  try {
    const data = await fetchJson<FmpQuoteResponse[]>(
      `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`
    );
    const quote = data[0];
    if (!quote || typeof quote.price !== "number") return null;

    return {
      price: quote.price,
      changePercent: quote.changesPercentage || 0,
      companyName: quote.name,
      source: "fmp",
    };
  } catch (error: unknown) {
    console.warn("FMP quote fallback failed:", error);
    return null;
  }
}

async function fetchFmpMarketData(symbol: string): Promise<ProviderMarketData | null> {
  const apiKey = getFmpApiKey();
  if (!apiKey) return null;

  try {
    const [quote, dailyData] = await Promise.all([
      fetchFmpQuote(symbol),
      fetchJson<FmpHistoricalResponse>(
        `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`
      ),
    ]);

    const dailyCandles = (dailyData.historical || [])
      .map((item) => parseProviderCandle(item))
      .filter((item): item is Candle => item !== null)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(-260);

    if (dailyCandles.length < 65) return null;

    const last = dailyCandles[dailyCandles.length - 1];
    const prev = dailyCandles[dailyCandles.length - 2] || last;

    return {
      dailyCandles,
      weeklyCandles: buildWeeklyCandles(dailyCandles),
      price: quote?.price || last.close,
      changePercent: quote?.changePercent || (prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0),
      companyName: quote?.companyName || symbol,
      source: "fmp",
    };
  } catch (error: unknown) {
    console.warn("FMP market data fallback failed:", error);
    return null;
  }
}

async function fetchFmpSearchSuggestions(query: string): Promise<ProviderSearchSuggestion[]> {
  const apiKey = getFmpApiKey();
  if (!apiKey) return [];

  try {
    const data = await fetchJson<FmpSearchResponse[]>(
      `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(query)}&limit=8&apikey=${encodeURIComponent(apiKey)}`
    );

    return data
      .filter((item) => item.symbol)
      .map((item) => ({
        symbol: item.symbol || "",
        name: item.name || item.symbol || "",
        exchDisp: item.exchangeShortName || item.stockExchange || "GLOBAL",
        typeDisp: "Stock",
      }))
      .slice(0, 8);
  } catch (error: unknown) {
    console.warn("FMP search fallback failed:", error);
    return [];
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Provider request failed (${res.status})`);
  }

  return await res.json() as T;
}

function parseProviderCandle(item: {
  date?: string;
  datetime?: string;
  open?: string | number;
  high?: string | number;
  low?: string | number;
  close?: string | number;
  volume?: string | number;
}): Candle | null {
  const date = item.date || item.datetime;
  const open = parseProviderNumber(item.open);
  const high = parseProviderNumber(item.high);
  const low = parseProviderNumber(item.low);
  const close = parseProviderNumber(item.close);

  if (!date || open === null || high === null || low === null || close === null) {
    return null;
  }

  return {
    date,
    open,
    high,
    low,
    close,
    volume: parseProviderNumber(item.volume) ?? 0,
  };
}

function parseProviderNumber(value: string | number | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildWeeklyCandles(dailyCandles: Candle[]): Candle[] {
  const weekly = new Map<string, Candle>();

  for (const candle of dailyCandles) {
    const key = getWeekKey(String(candle.date));
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

function getWeekKey(dateText: string): string {
  const date = new Date(`${dateText.slice(0, 10)}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function getTwelveDataApiKey(): string {
  return process.env.TWELVE_DATA_API_KEY || process.env.TWELVEDATA_API_KEY || "";
}

function getFmpApiKey(): string {
  return process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY || "";
}
