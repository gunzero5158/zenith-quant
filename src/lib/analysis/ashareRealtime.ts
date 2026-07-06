import { Candle } from "@/lib/analysis/indicators";
import { fetchEastMoneyJson } from "@/lib/analysis/eastmoneyHttp";

const EAST_MONEY_REALTIME_TIMEOUT_MS = 2000;
const SINA_REALTIME_TIMEOUT_MS = 2000;

export type AShareRealtimeSource = "eastmoney-realtime" | "sina-realtime";

export interface AShareRealtimeQuote {
  source: AShareRealtimeSource;
  price: number;
  changePercent: number;
  name?: string;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  volume?: number;
  date?: string;
}

interface EastMoneyRealtimeResponse {
  data?: {
    f43?: number | string;
    f44?: number | string;
    f45?: number | string;
    f46?: number | string;
    f47?: number | string;
    f58?: string;
    f60?: number | string;
    f86?: number | string;
    f170?: number | string;
  };
}

export function convertSymbolToEastMoneyAShareSecid(symbol: string): string | null {
  const clean = symbol.trim().toUpperCase();
  if (clean.endsWith(".SS") || clean.endsWith(".SH")) {
    return `1.${clean.split(".")[0]}`;
  }
  if (clean.endsWith(".SZ")) {
    return `0.${clean.split(".")[0]}`;
  }
  if (/^\d{6}$/.test(clean)) {
    return clean.startsWith("6") || clean.startsWith("9")
      ? `1.${clean}`
      : `0.${clean}`;
  }
  return null;
}

export function parseEastMoneyRealtimeQuote(response: EastMoneyRealtimeResponse): AShareRealtimeQuote | null {
  const data = response.data;
  if (!data) return null;

  const price = normalizeEastMoneyPrice(data.f43);
  if (!price) return null;

  const previousClose = normalizeEastMoneyPrice(data.f60);
  const pctFromApi = normalizeEastMoneyPercent(data.f170);
  const changePercent = pctFromApi ?? (
    previousClose ? ((price - previousClose) / previousClose) * 100 : 0
  );

  return {
    source: "eastmoney-realtime",
    name: normalizeName(data.f58),
    price,
    open: normalizeEastMoneyPrice(data.f46),
    high: normalizeEastMoneyPrice(data.f44),
    low: normalizeEastMoneyPrice(data.f45),
    previousClose,
    volume: parsePositiveNumber(data.f47),
    date: parseEastMoneyTradeDate(data.f86),
    changePercent,
  };
}

export function parseSinaRealtimeQuote(text: string): AShareRealtimeQuote | null {
  const match = text.match(/hq_str_[^=]+="([^"]*)"/);
  if (!match || !match[1]) return null;

  const fields = match[1].split(",");
  const price = parsePositiveNumber(fields[3]);
  const previousClose = parsePositiveNumber(fields[2]);
  if (!price) return null;

  return {
    source: "sina-realtime",
    name: normalizeName(fields[0]),
    price,
    open: parsePositiveNumber(fields[1]),
    high: parsePositiveNumber(fields[4]),
    low: parsePositiveNumber(fields[5]),
    previousClose,
    volume: parsePositiveNumber(fields[8]),
    date: normalizeDateString(fields[30]),
    changePercent: previousClose ? ((price - previousClose) / previousClose) * 100 : 0,
  };
}

export async function fetchAShareRealtimeQuote(symbol: string): Promise<AShareRealtimeQuote | null> {
  const secid = convertSymbolToEastMoneyAShareSecid(symbol);
  if (!secid) return null;

  try {
    const eastMoneyQuote = await fetchEastMoneyRealtimeQuote(secid);
    if (eastMoneyQuote) return eastMoneyQuote;
  } catch (error: unknown) {
    console.warn(`EastMoney realtime quote failed for ${symbol}:`, error);
  }

  try {
    return await fetchSinaRealtimeQuote(symbol);
  } catch (error: unknown) {
    console.warn(`Sina realtime quote failed for ${symbol}:`, error);
    return null;
  }
}

export function mergeRealtimeQuoteIntoDailyCandles(candles: Candle[], quote: AShareRealtimeQuote): Candle[] {
  if (!quote.date || candles.length === 0) return candles;

  const last = candles[candles.length - 1];
  if (quote.date < last.date) return candles;

  const realtimeCandle = buildRealtimeCandle(last, quote);
  if (quote.date === last.date) {
    return [...candles.slice(0, -1), realtimeCandle];
  }

  return [...candles, realtimeCandle];
}

async function fetchEastMoneyRealtimeQuote(secid: string): Promise<AShareRealtimeQuote | null> {
  const fields = "f43,f44,f45,f46,f47,f58,f60,f86,f170";
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields}`;
  const data = await fetchEastMoneyJson<EastMoneyRealtimeResponse>(url, EAST_MONEY_REALTIME_TIMEOUT_MS);
  return parseEastMoneyRealtimeQuote(data);
}

async function fetchSinaRealtimeQuote(symbol: string): Promise<AShareRealtimeQuote | null> {
  const sinaSymbol = convertSymbolToSinaAShare(symbol);
  if (!sinaSymbol) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SINA_REALTIME_TIMEOUT_MS);
  try {
    const res = await fetch(`https://hq.sinajs.cn/list=${sinaSymbol}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://finance.sina.com.cn/",
      },
    });

    if (!res.ok) {
      throw new Error(`Sina realtime quote request failed (${res.status})`);
    }

    const buffer = await res.arrayBuffer();
    return parseSinaRealtimeQuote(decodeSinaText(buffer));
  } finally {
    clearTimeout(timeout);
  }
}

function convertSymbolToSinaAShare(symbol: string): string | null {
  const clean = symbol.trim().toUpperCase();
  if (clean.endsWith(".SS") || clean.endsWith(".SH")) {
    return `sh${clean.split(".")[0]}`;
  }
  if (clean.endsWith(".SZ")) {
    return `sz${clean.split(".")[0]}`;
  }
  if (/^\d{6}$/.test(clean)) {
    return clean.startsWith("6") || clean.startsWith("9")
      ? `sh${clean}`
      : `sz${clean}`;
  }
  return null;
}

function buildRealtimeCandle(previous: Candle, quote: AShareRealtimeQuote): Candle {
  const open = quote.open || quote.previousClose || previous.close || quote.price;
  const close = quote.price;
  const high = Math.max(quote.high || close, open, close);
  const low = Math.min(quote.low || close, open, close);

  return {
    date: quote.date || previous.date,
    open,
    high,
    low,
    close,
    volume: Math.round(quote.volume || 0),
  };
}

function normalizeEastMoneyPrice(value: number | string | undefined): number | undefined {
  const raw = parsePositiveNumber(value);
  return raw ? raw / 100 : undefined;
}

function normalizeEastMoneyPercent(value: number | string | undefined): number | undefined {
  const raw = parseNumber(value);
  return raw === undefined ? undefined : raw / 100;
}

function parseEastMoneyTradeDate(value: number | string | undefined): string | undefined {
  const text = String(value || "");
  const match = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return undefined;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeDateString(value: string | undefined): string | undefined {
  const text = (value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

function normalizeName(value: string | undefined): string | undefined {
  const text = (value || "").trim();
  return text || undefined;
}

function parsePositiveNumber(value: number | string | undefined): number | undefined {
  const parsed = parseNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function parseNumber(value: number | string | undefined): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") return undefined;

  const text = value.trim();
  if (!text || text === "-") return undefined;

  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function decodeSinaText(buffer: ArrayBuffer): string {
  for (const encoding of ["gb18030", "gbk", "utf-8"]) {
    try {
      return new TextDecoder(encoding).decode(buffer);
    } catch {
      // Try the next supported encoding.
    }
  }
  return new TextDecoder().decode(buffer);
}
