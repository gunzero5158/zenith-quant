import { getMarketCloseMinute, getMarketDateParts } from "./analysisCache";
import { DataQuality, SIGNAL_CATALOG } from "./evidence";
import { getWeekStart } from "./weeklyCandles";

export interface DataQualityInput {
  symbol: string;
  asOf: string;
  dailySamples: number;
  weeklySamples: number;
  latestDailyDate?: string;
  latestWeeklyDate?: string;
}

function completedBars(input: DataQualityInput, timestamp: number): {
  dailyBarComplete: boolean;
  weeklyBarComplete: boolean;
} {
  const now = getMarketDateParts(input.symbol, timestamp);
  if (!now) return { dailyBarComplete: false, weeklyBarComplete: false };
  const latestDailyDate = input.latestDailyDate?.slice(0, 10);
  const latestWeeklyDate = input.latestWeeklyDate?.slice(0, 10);
  const currentWeek = getWeekStart(now.dateKey);
  const weekend = now.weekday === "Sat" || now.weekday === "Sun";
  const afterClose = now.minuteOfDay >= getMarketCloseMinute(input.symbol);

  const dailyBarComplete = !latestDailyDate
    ? false
    : latestDailyDate !== now.dateKey
      ? true
      : !weekend && afterClose;

  const weeklyBarComplete = !latestWeeklyDate
    ? false
    : latestWeeklyDate !== currentWeek
      ? true
      : weekend || (now.weekday === "Fri" && afterClose);

  return { dailyBarComplete, weeklyBarComplete };
}

export function buildDataQuality(input: DataQualityInput): DataQuality {
  const timestamp = Date.parse(input.asOf);
  const warnings: string[] = [];
  const validTimestamp = Number.isFinite(timestamp);
  const completion = validTimestamp
    ? completedBars(input, timestamp)
    : { dailyBarComplete: false, weeklyBarComplete: false };

  let scoreCap = 5;
  if (input.dailySamples < 60) scoreCap = Math.min(scoreCap, 2.5);
  if (input.weeklySamples < 35) scoreCap = Math.min(scoreCap, 3.2);

  if (!validTimestamp) warnings.push("行情快照时间无效");
  if (!completion.dailyBarComplete) warnings.push("当前日K未完成，日线触发为暂定信号");
  if (!completion.weeklyBarComplete) warnings.push("当前周K未完成，周线信号为暂定信号");

  const missingFamilies = SIGNAL_CATALOG
    .filter((definition) =>
      input.dailySamples < definition.minimumSamples.daily ||
      input.weeklySamples < definition.minimumSamples.weekly
    )
    .map((definition) => definition.family);

  return {
    asOf: input.asOf,
    latestDailyDate: input.latestDailyDate,
    latestWeeklyDate: input.latestWeeklyDate,
    dailyBarComplete: completion.dailyBarComplete,
    weeklyBarComplete: completion.weeklyBarComplete,
    dailySamples: input.dailySamples,
    weeklySamples: input.weeklySamples,
    missingFamilies,
    scoreCap,
    warnings,
  };
}
