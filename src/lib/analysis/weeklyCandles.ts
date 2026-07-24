import { Candle } from "./indicators";

/**
 * Aggregates daily candles into weekly candles keyed by the ISO week start (Monday).
 *
 * This is the single canonical implementation — it used to be copy-pasted into
 * marketDataProviders/tonghuashun/tencent/kabutan and the analyze route, and the
 * copies had already started to drift.
 */
export function buildWeeklyCandles(dailyCandles: Candle[]): Candle[] {
  const weekly = new Map<string, Candle>();

  const orderedDaily = [...dailyCandles].sort((left, right) =>
    toIsoDateKey(left.date).localeCompare(toIsoDateKey(right.date))
  );

  for (const candle of orderedDaily) {
    const key = getWeekStart(candle.date);
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

/** Replaces only the provider's current week with the week rebuilt from daily bars. */
export function mergeCurrentWeekFromDaily(providerWeekly: Candle[], dailyCandles: Candle[]): Candle[] {
  const rebuiltWeeks = buildWeeklyCandles(dailyCandles);
  const currentWeek = rebuiltWeeks.at(-1);
  if (!currentWeek) return [...providerWeekly];

  const currentWeekKey = toIsoDateKey(currentWeek.date);
  return [
    ...providerWeekly.filter((candle) => toIsoDateKey(candle.date) !== currentWeekKey),
    currentWeek,
  ].sort((left, right) => toIsoDateKey(left.date).localeCompare(toIsoDateKey(right.date)));
}

export function toIsoDateKey(value: Candle["date"]): string {
  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(`${value.slice(0, 10)}T00:00:00Z`);

  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid candle date: ${String(value)}`);
  }

  return date.toISOString().slice(0, 10);
}

/** Returns the Monday of the week containing a candle date. */
export function getWeekStart(value: Candle["date"]): string {
  const date = new Date(`${toIsoDateKey(value)}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}
