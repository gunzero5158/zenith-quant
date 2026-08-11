const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export const ANALYSIS_REPORT_CACHE_VERSION = 3;
export const ANALYSIS_CACHE_VERSION = ANALYSIS_REPORT_CACHE_VERSION;
export const ACTIVE_MARKET_ANALYSIS_MAX_AGE_MS = 10 * 60 * 1000;
export const MARKET_DATA_CACHE_MAX_RETENTION_MS = 4 * 24 * 60 * 60 * 1000;

export function isAnalysisCacheVersionCompatible(cachedVersion: number | undefined): boolean {
  return cachedVersion === ANALYSIS_REPORT_CACHE_VERSION;
}

interface MarketSessionDefinition {
  timeZone: string;
  sessions: ReadonlyArray<readonly [startMinute: number, endMinute: number]>;
}

interface MarketDateParts {
  dateKey: string;
  weekday: string;
  minuteOfDay: number;
}

const MARKET_SESSIONS = {
  cn: {
    timeZone: "Asia/Shanghai",
    sessions: [[9 * 60 + 30, 11 * 60 + 30], [13 * 60, 15 * 60]],
  },
  hk: {
    timeZone: "Asia/Hong_Kong",
    sessions: [[9 * 60 + 30, 12 * 60], [13 * 60, 16 * 60 + 10]],
  },
  jp: {
    timeZone: "Asia/Tokyo",
    sessions: [[9 * 60, 11 * 60 + 30], [12 * 60 + 30, 15 * 60 + 30]],
  },
  us: {
    timeZone: "America/New_York",
    sessions: [[9 * 60 + 30, 16 * 60]],
  },
} as const satisfies Record<string, MarketSessionDefinition>;

const marketDateFormatters = new Map<string, Intl.DateTimeFormat>();

function getMarketSession(symbol: string): MarketSessionDefinition {
  const clean = symbol.trim().toUpperCase();
  if (isAShareSymbol(clean)) return MARKET_SESSIONS.cn;
  if (/^(?:HK\d{4,5}|\d{4,5}\.HK)$/.test(clean)) return MARKET_SESSIONS.hk;
  if (/^(?:\d{3}[0-9A-Z]\.T|\d{3}[A-Z])$/.test(clean)) return MARKET_SESSIONS.jp;
  return MARKET_SESSIONS.us;
}

function getMarketDateParts(symbol: string, timestamp: number): MarketDateParts | null {
  if (!Number.isFinite(timestamp)) return null;

  const { timeZone } = getMarketSession(symbol);
  let formatter = marketDateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    marketDateFormatters.set(timeZone, formatter);
  }

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value])
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minuteOfDay: hour * 60 + minute,
  };
}

function getMarketCloseMinute(symbol: string): number {
  return getMarketSession(symbol).sessions.reduce(
    (latest, [, endMinute]) => Math.max(latest, endMinute),
    0
  );
}

export function isMarketTrading(symbol: string, timestamp = Date.now()): boolean {
  const market = getMarketSession(symbol);
  const parts = getMarketDateParts(symbol, timestamp);
  if (!parts || parts.weekday === "Sat" || parts.weekday === "Sun") return false;

  return market.sessions.some(([startMinute, endMinute]) => (
    parts.minuteOfDay >= startMinute && parts.minuteOfDay < endMinute
  ));
}

export function isSameMarketDate(
  symbol: string,
  leftTimestamp: number,
  rightTimestamp: number
): boolean {
  const left = getMarketDateParts(symbol, leftTimestamp);
  const right = getMarketDateParts(symbol, rightTimestamp);
  return Boolean(left && right && left.dateKey === right.dateKey);
}

export function isAnalysisCacheReusableByTime(
  symbol: string,
  cacheTimestamp: number,
  nowTimestamp = Date.now()
): boolean {
  if (!Number.isFinite(cacheTimestamp) || !Number.isFinite(nowTimestamp)) return false;
  if (cacheTimestamp > nowTimestamp) return false;

  if (isMarketTrading(symbol, nowTimestamp)) {
    return nowTimestamp - cacheTimestamp <= ACTIVE_MARKET_ANALYSIS_MAX_AGE_MS;
  }

  return isSameMarketDate(symbol, cacheTimestamp, nowTimestamp);
}

export function isMarketDataCacheReusable(
  symbol: string,
  cacheTimestamp: number,
  nowTimestamp = Date.now()
): boolean {
  if (!Number.isFinite(cacheTimestamp) || !Number.isFinite(nowTimestamp)) return false;
  if (cacheTimestamp > nowTimestamp) return false;

  const age = nowTimestamp - cacheTimestamp;
  if (age > MARKET_DATA_CACHE_MAX_RETENTION_MS) return false;

  const market = getMarketSession(symbol);
  const cached = getMarketDateParts(symbol, cacheTimestamp);
  const now = getMarketDateParts(symbol, nowTimestamp);
  if (!cached || !now) return false;

  const sameDate = cached.dateKey === now.dateKey;
  const activeSession = market.sessions.find(([startMinute, endMinute]) => (
    now.minuteOfDay >= startMinute && now.minuteOfDay < endMinute
  ));
  if (activeSession && now.weekday !== "Sat" && now.weekday !== "Sun") {
    return sameDate
      && cached.minuteOfDay >= activeSession[0]
      && age <= ACTIVE_MARKET_ANALYSIS_MAX_AGE_MS;
  }

  const marketClose = getMarketCloseMinute(symbol);
  const cachedOnWeekend = cached.weekday === "Sat" || cached.weekday === "Sun";
  const cacheRepresentsClosedMarket = cachedOnWeekend || cached.minuteOfDay >= marketClose;
  const nowOnWeekend = now.weekday === "Sat" || now.weekday === "Sun";
  if (nowOnWeekend) return cacheRepresentsClosedMarket;

  const completedSessionEnds = market.sessions
    .map(([, endMinute]) => endMinute)
    .filter((endMinute) => endMinute <= now.minuteOfDay);
  if (completedSessionEnds.length > 0) {
    if (!sameDate) return false;
    const latestSessionEnd = Math.max(...completedSessionEnds);
    return cached.minuteOfDay >= latestSessionEnd;
  }

  // Before the first session, the previous close remains valid until trading starts.
  return sameDate || cacheRepresentsClosedMarket;
}

export function isAnalysisCacheLanguageCompatible(
  cachedLanguage: string | undefined,
  requestedLanguage: string
): boolean {
  return typeof cachedLanguage === "string" && cachedLanguage === requestedLanguage;
}

export function isAnalysisCacheCompatible(
  cachedVersion: number | undefined,
  cachedLanguage: string | undefined,
  requestedLanguage: string
): boolean {
  return isAnalysisCacheVersionCompatible(cachedVersion)
    && isAnalysisCacheLanguageCompatible(cachedLanguage, requestedLanguage);
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
