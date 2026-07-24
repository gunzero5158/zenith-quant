import { isAShareSymbol } from "./analysisCache";
import { DataQuality, SIGNAL_CATALOG } from "./evidence";
import { getWeekStart } from "./weeklyCandles";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface DataQualityInput {
  symbol: string;
  asOf: string;
  dailySamples: number;
  weeklySamples: number;
  latestDailyDate?: string;
  latestWeeklyDate?: string;
}

interface DateParts {
  date: string;
  day: number;
  minuteOfDay: number;
}

function dateParts(timestamp: number, offsetMs: number): DateParts {
  const shifted = new Date(timestamp + offsetMs);
  return {
    date: shifted.toISOString().slice(0, 10),
    day: shifted.getUTCDay(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function completedBars(input: DataQualityInput, timestamp: number): {
  dailyBarComplete: boolean;
  weeklyBarComplete: boolean;
} {
  const aShare = isAShareSymbol(input.symbol);
  const now = dateParts(timestamp, aShare ? BEIJING_OFFSET_MS : 0);
  const latestDailyDate = input.latestDailyDate?.slice(0, 10);
  const latestWeeklyDate = input.latestWeeklyDate?.slice(0, 10);
  const currentWeek = getWeekStart(now.date);

  const dailyBarComplete = !latestDailyDate
    ? false
    : latestDailyDate !== now.date
      ? true
      : aShare
        ? (now.day === 0 || now.day === 6 || now.minuteOfDay >= 15 * 60)
        : false;

  const weeklyBarComplete = !latestWeeklyDate
    ? false
    : latestWeeklyDate !== currentWeek
      ? true
      : now.day === 0 || now.day === 6 || (aShare && now.day === 5 && now.minuteOfDay >= 15 * 60);

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
  if (!isAShareSymbol(input.symbol) && input.latestDailyDate === input.asOf.slice(0, 10)) {
    warnings.push("当前日K完成状态由行情供应商确认");
  }

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
