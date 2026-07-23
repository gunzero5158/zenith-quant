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

/** Replaces only the provider's current week with the week rebuilt from daily bars. */
export function mergeCurrentWeekFromDaily(providerWeekly: Candle[], dailyCandles: Candle[]): Candle[] {
  const rebuiltWeeks = buildWeeklyCandles(dailyCandles);
  const currentWeek = rebuiltWeeks.at(-1);
  if (!currentWeek) return [...providerWeekly];

  const currentWeekKey = String(currentWeek.date).slice(0, 10);
  return [
    ...providerWeekly.filter((candle) => String(candle.date).slice(0, 10) !== currentWeekKey),
    currentWeek,
  ].sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

/** Returns the Monday of the week containing `dateText` ("YYYY-MM-DD..."). */
export function getWeekStart(dateText: string): string {
  const date = new Date(`${dateText.slice(0, 10)}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}
