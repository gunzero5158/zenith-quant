const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export function isAnalysisCacheLanguageCompatible(
  cachedLanguage: string | undefined,
  requestedLanguage: string
): boolean {
  return typeof cachedLanguage === "string" && cachedLanguage === requestedLanguage;
}

export interface AnalysisQuoteSnapshot {
  price: number;
  change: number;
}

export interface AShareAnalysisCacheCandidate {
  symbol: string;
  cacheTimestamp: number;
  nowTimestamp: number;
  cachedQuote: AnalysisQuoteSnapshot;
  latestQuote: AnalysisQuoteSnapshot;
}

interface BeijingDateParts {
  year: number;
  month: number;
  date: number;
  day: number;
  minuteOfDay: number;
}

export function isAShareSymbol(symbol: string): boolean {
  const clean = symbol.trim().toUpperCase();
  return (
    /^(?:SH|SZ|BJ)\d{6}$/.test(clean) ||
    /^\d{6}(?:\.(?:SS|SH|SZ|BJ))?$/.test(clean)
  );
}

export function isAShareAnalysisCacheReusable({
  symbol,
  cacheTimestamp,
  nowTimestamp,
  cachedQuote,
  latestQuote,
}: AShareAnalysisCacheCandidate): boolean {
  if (!isAShareSymbol(symbol)) return false;
  if (!Number.isFinite(cacheTimestamp) || !Number.isFinite(nowTimestamp)) return false;
  if (cacheTimestamp > nowTimestamp) return false;
  if (!quotesMatchAtDisplayPrecision(cachedQuote, latestQuote)) return false;

  const cacheTime = getBeijingDateParts(cacheTimestamp);
  const now = getBeijingDateParts(nowTimestamp);
  if (!isSameBeijingDate(cacheTime, now)) return false;

  if (now.day === 0 || now.day === 6) return true;

  const morningOpen = 9 * 60 + 30;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const marketClose = 15 * 60;

  const isTrading = (
    (now.minuteOfDay >= morningOpen && now.minuteOfDay < morningClose) ||
    (now.minuteOfDay >= afternoonOpen && now.minuteOfDay < marketClose)
  );
  if (isTrading) return false;

  if (now.minuteOfDay >= marketClose) {
    return cacheTimestamp >= getBeijingBoundaryTimestamp(now, marketClose);
  }

  if (now.minuteOfDay >= morningClose) {
    return cacheTimestamp >= getBeijingBoundaryTimestamp(now, morningClose);
  }

  return true;
}

function quotesMatchAtDisplayPrecision(
  cachedQuote: AnalysisQuoteSnapshot,
  latestQuote: AnalysisQuoteSnapshot
): boolean {
  const values = [
    cachedQuote.price,
    cachedQuote.change,
    latestQuote.price,
    latestQuote.change,
  ];
  if (!values.every(Number.isFinite)) return false;

  return (
    cachedQuote.price.toFixed(2) === latestQuote.price.toFixed(2) &&
    cachedQuote.change.toFixed(2) === latestQuote.change.toFixed(2)
  );
}

function getBeijingDateParts(timestamp: number): BeijingDateParts {
  const shifted = new Date(timestamp + BEIJING_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function isSameBeijingDate(left: BeijingDateParts, right: BeijingDateParts): boolean {
  return left.year === right.year && left.month === right.month && left.date === right.date;
}

function getBeijingBoundaryTimestamp(date: BeijingDateParts, minuteOfDay: number): number {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return Date.UTC(date.year, date.month, date.date, hour, minute) - BEIJING_OFFSET_MS;
}
