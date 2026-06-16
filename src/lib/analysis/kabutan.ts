import { Candle } from "@/lib/analysis/indicators";

interface KabutanRow extends Candle {
  changePercent?: number;
}

interface KabutanPageData {
  companyName: string;
  candles: KabutanRow[];
}

export interface KabutanMarketData {
  dailyCandles: Candle[];
  weeklyCandles: Candle[];
  companyName: string;
  price: number;
  changePercent: number;
}

const KABUTAN_MAX_PAGES = 10;

export function getKabutanCode(symbol: string): string | null {
  const clean = symbol.trim().toUpperCase();
  if (clean.endsWith(".T")) {
    const code = clean.slice(0, -2);
    return /^\d{3}[0-9A-Z]$/.test(code) ? code : null;
  }

  if (/^\d{3}[A-Z]$/.test(clean)) {
    return clean;
  }

  return null;
}

export async function fetchKabutanQuote(symbol: string): Promise<{
  companyName: string;
  price: number;
  changePercent: number;
}> {
  const code = getKabutanCode(symbol);
  if (!code) {
    throw new Error(`Kabutan only supports Japanese stock codes: ${symbol}`);
  }

  const pageData = await fetchKabutanDailyPage(code, 1);
  const rows = pageData.candles.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2] || last;

  if (!last) {
    throw new Error(`Kabutan returned no quote data for ${symbol}`);
  }

  return {
    companyName: pageData.companyName || symbol,
    price: last.close,
    changePercent:
      typeof last.changePercent === "number"
        ? last.changePercent
        : prev.close
          ? ((last.close - prev.close) / prev.close) * 100
          : 0,
  };
}

export async function fetchKabutanMarketData(symbol: string): Promise<KabutanMarketData> {
  const code = getKabutanCode(symbol);
  if (!code) {
    throw new Error(`Kabutan only supports Japanese stock codes: ${symbol}`);
  }

  const rowsByDate = new Map<string, KabutanRow>();
  let companyName = symbol;

  for (let page = 1; page <= KABUTAN_MAX_PAGES && rowsByDate.size < 300; page++) {
    const pageData = await fetchKabutanDailyPage(code, page);
    if (pageData.companyName) {
      companyName = pageData.companyName;
    }

    for (const candle of pageData.candles) {
      rowsByDate.set(String(candle.date), candle);
    }

    if (pageData.candles.length === 0) {
      break;
    }
  }

  const dailyRows = Array.from(rowsByDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );

  if (dailyRows.length < 65) {
    throw new Error(`Kabutan returned insufficient daily data for ${symbol}`);
  }

  const last = dailyRows[dailyRows.length - 1];
  const prev = dailyRows[dailyRows.length - 2] || last;
  const changePercent =
    typeof last.changePercent === "number"
      ? last.changePercent
      : prev.close
        ? ((last.close - prev.close) / prev.close) * 100
        : 0;

  return {
    dailyCandles: dailyRows.map((row) => ({
      date: row.date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    })),
    weeklyCandles: buildWeeklyCandles(dailyRows),
    companyName,
    price: last.close,
    changePercent,
  };
}

async function fetchKabutanDailyPage(code: string, page: number): Promise<KabutanPageData> {
  const url = `https://kabutan.jp/stock/kabuka?code=${encodeURIComponent(code)}&ashi=day&page=${page}`;
  const res = await fetch(url, {
    headers: {
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Kabutan request failed (${res.status})`);
  }

  return parseKabutanDailyPage(await res.text());
}

export function parseKabutanDailyPage(html: string): KabutanPageData {
  const titleMatch = html.match(/<title>([^<]+?)【[0-9A-Z]+】/);
  const companyName = titleMatch ? cleanText(titleMatch[1]) : "";
  const tableMatches = html.matchAll(/<table class="stock_kabuka(?:0|_dwm)">([\s\S]*?)<\/table>/g);
  const candles: KabutanRow[] = [];

  for (const tableMatch of tableMatches) {
    const rowMatches = tableMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g);
    for (const rowMatch of rowMatches) {
      const candle = parseKabutanRow(rowMatch[1]);
      if (candle) {
        candles.push(candle);
      }
    }
  }

  return { companyName, candles };
}

function parseKabutanRow(rowHtml: string): KabutanRow | null {
  const dateMatch = rowHtml.match(/<time datetime="(\d{4}-\d{2}-\d{2})"/);
  if (!dateMatch) {
    return null;
  }

  const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map((match) =>
    cleanText(match[1])
  );
  if (cells.length < 7) {
    return null;
  }

  const open = parseMarketNumber(cells[0]);
  const high = parseMarketNumber(cells[1]);
  const low = parseMarketNumber(cells[2]);
  const close = parseMarketNumber(cells[3]);
  const changePercent = parseMarketNumber(cells[5]);
  const volume = parseMarketNumber(cells[6]) ?? 0;

  if (open === null || high === null || low === null || close === null) {
    return null;
  }

  return {
    date: dateMatch[1],
    open,
    high,
    low,
    close,
    volume,
    changePercent: changePercent ?? undefined,
  };
}

function buildWeeklyCandles(dailyRows: Candle[]): Candle[] {
  const weekly = new Map<string, Candle>();

  for (const candle of dailyRows) {
    const key = getWeekKey(String(candle.date));
    const current = weekly.get(key);

    if (!current) {
      weekly.set(key, { ...candle });
      continue;
    }

    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
    current.volume += candle.volume;
  }

  return Array.from(weekly.values());
}

function getWeekKey(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function parseMarketNumber(value: string): number | null {
  const normalized = value
    .replace(/[,%％]/g, "")
    .replace(/[+−－]/g, (char) => (char === "+" ? "" : "-"))
    .trim();

  if (!normalized || normalized === "-" || normalized === "--") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
