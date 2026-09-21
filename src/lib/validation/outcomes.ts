import { barDateOf, VALIDATION_HORIZONS, ValidationOutcome, ValidationOutlook, ValidationRecord, ValidationTrack } from "./records";

export interface OutcomeCandle {
  date: unknown;
  high: number;
  low: number;
  close: number;
}

const LONGEST_HORIZON = VALIDATION_HORIZONS[VALIDATION_HORIZONS.length - 1];
/** The horizon the summary statistics are read at; mid-way through the 5-20 day swing window. */
export const SUMMARY_HORIZON = 10;
const FALLBACK_BAND_PCT = 3;

const pct = (from: number, to: number) => Number((((to - from) / from) * 100).toFixed(2));

/** Compares a record with the daily bars that followed it. Returns undefined when its bar is not in the series. */
export function evaluateOutcome(record: ValidationRecord, candles: OutcomeCandle[], now: number): ValidationOutcome | undefined {
  const start = candles.findIndex((candle) => barDateOf(candle.date) >= record.barDate);
  if (start < 0 || !(record.price > 0)) return undefined;
  const after = candles.slice(start + 1, start + 1 + LONGEST_HORIZON);

  const returns: ValidationOutcome["returns"] = {};
  for (const horizon of VALIDATION_HORIZONS) {
    const candle = after[horizon - 1];
    if (candle) returns[horizon] = pct(record.price, candle.close);
  }

  const outcome: ValidationOutcome = {
    evaluatedAt: now,
    barsElapsed: after.length,
    returns,
    complete: after.length >= LONGEST_HORIZON,
  };
  if (after.length > 0) {
    outcome.maxGainPct = pct(record.price, Math.max(...after.map((candle) => candle.high)));
    outcome.maxDrawdownPct = pct(record.price, Math.min(...after.map((candle) => candle.low)));
  }

  if (record.activeSetup !== "none" && record.stop !== undefined && record.target !== undefined) {
    outcome.plan = outcome.complete ? "timeout" : "open";
    for (const [index, candle] of after.entries()) {
      // When one bar spans both levels the order is unknowable from daily data; count it as the stop.
      if (candle.low <= record.stop) {
        outcome.plan = "stop";
        outcome.planBars = index + 1;
        break;
      }
      if (candle.high >= record.target) {
        outcome.plan = "target";
        outcome.planBars = index + 1;
        break;
      }
    }
  }
  return outcome;
}

/** A move smaller than this is noise rather than a directional result. */
export function meaningfulMovePct(record: ValidationRecord): number {
  return record.atrPct && record.atrPct > 0 ? Number((record.atrPct * 1.5).toFixed(2)) : FALLBACK_BAND_PCT;
}

export function isOutlookCorrect(record: ValidationRecord, returnPct: number): boolean | undefined {
  if (!record.outlook) return undefined;
  const band = meaningfulMovePct(record);
  if (record.outlook === "bullish") return returnPct > band;
  if (record.outlook === "bearish") return returnPct < -band;
  return Math.abs(returnPct) <= band;
}

export interface GroupStat {
  count: number;
  averageReturnPct?: number;
  /** Share of the group that closed higher at the summary horizon. */
  upRate?: number;
}

export interface TrackStats {
  track: ValidationTrack;
  total: number;
  evaluated: number;
  all: GroupStat;
  outlookHitRate?: number;
  outlookJudged: number;
  byOutlook: Record<ValidationOutlook, GroupStat>;
  byScore: { high: GroupStat; middle: GroupStat; low: GroupStat };
  plan: { target: number; stop: number; timeout: number; open: number; winRate?: number };
}

function groupStat(returns: number[]): GroupStat {
  if (returns.length === 0) return { count: 0 };
  return {
    count: returns.length,
    averageReturnPct: Number((returns.reduce((sum, value) => sum + value, 0) / returns.length).toFixed(2)),
    upRate: Number((returns.filter((value) => value > 0).length / returns.length).toFixed(3)),
  };
}

export function summarizeTrack(track: ValidationTrack, records: ValidationRecord[]): TrackStats {
  const own = records.filter((record) => record.track === track);
  const evaluated = own.flatMap((record) => {
    const returnPct = record.outcome?.returns[SUMMARY_HORIZON];
    return typeof returnPct === "number" ? [{ record, returnPct }] : [];
  });
  const returnsWhere = (test: (record: ValidationRecord) => boolean) =>
    evaluated.filter(({ record }) => test(record)).map(({ returnPct }) => returnPct);

  const judged = evaluated.flatMap(({ record, returnPct }) => {
    const correct = isOutlookCorrect(record, returnPct);
    return correct === undefined ? [] : [correct];
  });
  const plans = own.map((record) => record.outcome?.plan);
  const target = plans.filter((plan) => plan === "target").length;
  const stop = plans.filter((plan) => plan === "stop").length;

  return {
    track,
    total: own.length,
    evaluated: evaluated.length,
    all: groupStat(evaluated.map(({ returnPct }) => returnPct)),
    outlookJudged: judged.length,
    outlookHitRate: judged.length > 0 ? Number((judged.filter(Boolean).length / judged.length).toFixed(3)) : undefined,
    byOutlook: {
      bullish: groupStat(returnsWhere((record) => record.outlook === "bullish")),
      neutral: groupStat(returnsWhere((record) => record.outlook === "neutral")),
      bearish: groupStat(returnsWhere((record) => record.outlook === "bearish")),
    },
    byScore: {
      high: groupStat(returnsWhere((record) => record.score >= 3.5)),
      middle: groupStat(returnsWhere((record) => record.score >= 2.5 && record.score < 3.5)),
      low: groupStat(returnsWhere((record) => record.score < 2.5)),
    },
    plan: {
      target,
      stop,
      timeout: plans.filter((plan) => plan === "timeout").length,
      open: plans.filter((plan) => plan === "open").length,
      winRate: target + stop > 0 ? Number((target / (target + stop)).toFixed(3)) : undefined,
    },
  };
}

export interface CalibrationBucket {
  label: string;
  count: number;
  /** Mean bullish probability Jev stated for the bucket. */
  statedProbability?: number;
  /** Share of the bucket that actually closed higher. */
  actualUpRate?: number;
}

/** Does a stated "bullish 70%" come true about 70% of the time? */
export function jevCalibration(records: ValidationRecord[]): CalibrationBucket[] {
  const bounds: Array<[number, number, string]> = [[0, 0.4, "<40%"], [0.4, 0.6, "40-60%"], [0.6, 0.8, "60-80%"], [0.8, 1.01, "≥80%"]];
  const samples = records.flatMap((record) => {
    const probability = record.track === "jev-ai" ? record.outlookProbabilities?.bullish : undefined;
    const returnPct = record.outcome?.returns[SUMMARY_HORIZON];
    return typeof probability === "number" && typeof returnPct === "number" ? [{ probability, up: returnPct > 0 }] : [];
  });
  return bounds.map(([min, max, label]) => {
    const bucket = samples.filter((sample) => sample.probability >= min && sample.probability < max);
    if (bucket.length === 0) return { label, count: 0 };
    return {
      label,
      count: bucket.length,
      statedProbability: Number((bucket.reduce((sum, sample) => sum + sample.probability, 0) / bucket.length).toFixed(3)),
      actualUpRate: Number((bucket.filter((sample) => sample.up).length / bucket.length).toFixed(3)),
    };
  });
}
