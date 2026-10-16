import { barDateOf, primarySamples, TRACK_VERSIONS, VALIDATION_HORIZONS, ValidationOutcome, ValidationOutlook, ValidationRecord, ValidationTrack } from "./records";
import { evaluateTrade } from "./tradeExecution";
import { executionPolicyFor, type CostAssumptions } from "./executionPolicy";

export interface OutcomeCandle {
  date: unknown;
  open?: number;
  complete?: boolean;
  tradable?: boolean;
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
export function evaluateOutcome(record: ValidationRecord, candles: OutcomeCandle[], now: number, costs?: CostAssumptions): ValidationOutcome | undefined {
  const start = candles.findIndex((candle) => barDateOf(candle.date) === record.barDate);
  if (start < 0 || !(record.price > 0)) return undefined;
  const after: OutcomeCandle[] = [];
  for (const candle of candles.slice(start + 1, start + 1 + LONGEST_HORIZON)) {
    if (candle.complete !== true || !Number.isFinite(candle.close) || candle.close <= 0) break;
    after.push(candle);
  }

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

  const triggered = record.opportunity?.status === "triggered" && record.activeSetup !== "none";
  const policy = costs ? executionPolicyFor(record.symbol, costs) : record.executionPolicy;
  outcome.execution = evaluateTrade(record.opportunity?.plan, triggered, record.dailyBarComplete, after, policy);
  if (policy) outcome.costSensitivity = {
    zero: evaluateTrade(record.opportunity?.plan, triggered, record.dailyBarComplete, after,
      { ...policy, roundTripCostBps: 0, slippageBpsPerSide: 0 }),
    doubled: evaluateTrade(record.opportunity?.plan, triggered, record.dailyBarComplete, after,
      { ...policy, roundTripCostBps: policy.roundTripCostBps * 2, slippageBpsPerSide: policy.slippageBpsPerSide * 2 }),
  };
  if (["target", "stop", "timeout", "open"].includes(outcome.execution.status)) {
    outcome.plan = outcome.execution.status as ValidationOutcome["plan"];
    outcome.planBars = outcome.execution.barsHeld;
  }
  return outcome;
}

/** A move smaller than this is noise rather than a directional result. */
export function meaningfulMovePct(record: ValidationRecord): number {
  if (record.forecast) return record.forecast.bandPct;
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
  version: string;
  model?: string;
  horizon?: number;
  market?: string;
  total: number;
  evaluated: number;
  all: GroupStat;
  outlookHitRate?: number;
  outlookJudged: number;
  byOutlook: Record<ValidationOutlook, GroupStat>;
  byScore: { high: GroupStat; middle: GroupStat; low: GroupStat };
  plan: { target: number; stop: number; timeout: number; open: number; winRate?: number };
  execution: { not_triggered: number; unverifiable: number; skipped: number; ambiguous: number;
    resolved: number; averageNetR?: number; averageNetReturnPct?: number; triggerRate?: number;
    zeroCostR?: number; doubledCostR?: number };
}

function groupStat(returns: number[]): GroupStat {
  if (returns.length === 0) return { count: 0 };
  return {
    count: returns.length,
    averageReturnPct: Number((returns.reduce((sum, value) => sum + value, 0) / returns.length).toFixed(2)),
    upRate: Number((returns.filter((value) => value > 0).length / returns.length).toFixed(3)),
  };
}

export function summarizeTrack(track: ValidationTrack, records: ValidationRecord[], version = TRACK_VERSIONS[track]): TrackStats {
  const own = primarySamples(records, track, version);
  const evaluated = own.flatMap((record) => {
    const returnPct = record.outcome?.returns[record.forecast?.horizon ?? SUMMARY_HORIZON];
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
  const executions = own.flatMap(record => record.outcome?.execution ? [record.outcome.execution] : []);
  const resolved = executions.filter(e => ["target", "stop", "timeout"].includes(e.status) && e.netR !== undefined && e.netReturnPct !== undefined);
  const sensitivity = (kind: "zero" | "doubled") => {
    const values = own.flatMap(r => typeof r.outcome?.costSensitivity?.[kind].netR === "number" ? [r.outcome.costSensitivity[kind].netR!] : []);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  };

  return {
    track, version,
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
    execution: {
      not_triggered: executions.filter(e => e.status === "not_triggered").length,
      unverifiable: executions.filter(e => e.status === "unverifiable").length,
      skipped: executions.filter(e => e.status === "skipped").length,
      ambiguous: executions.filter(e => e.status === "ambiguous").length,
      resolved: resolved.length,
      averageNetR: resolved.length ? resolved.reduce((sum, e) => sum + e.netR!, 0) / resolved.length : undefined,
      averageNetReturnPct: resolved.length ? resolved.reduce((sum, e) => sum + e.netReturnPct!, 0) / resolved.length : undefined,
      triggerRate: own.length ? own.filter(r => r.opportunity?.status === "triggered").length / own.length : undefined,
      zeroCostR: sensitivity("zero"), doubledCostR: sensitivity("doubled"),
    },
  };
}

export function validationMarket(symbol: string): string {
  return /\.(SS|SZ|BJ)$/i.test(symbol) ? "CN" : /\.HK$/i.test(symbol) ? "HK" : /\.T$/i.test(symbol) ? "JP" : "US";
}

/** Never pool different decision versions, models, horizons or markets. */
export function summarizeGroups(records: ValidationRecord[]): TrackStats[] {
  const groups = new Map<string, ValidationRecord[]>();
  for (const record of records) {
    if (record.schemaVersion !== 2 || !record.forecast) continue;
    const key = JSON.stringify([record.track, record.trackVersion, record.model ?? "rule", record.forecast.horizon, validationMarket(record.symbol)]);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const first = group[0];
    return { ...summarizeTrack(first.track, group, first.trackVersion), model: first.model,
      horizon: first.forecast?.horizon, market: validationMarket(first.symbol) };
  });
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
export function jevCalibration(records: ValidationRecord[], version = TRACK_VERSIONS["jev-ai"]): CalibrationBucket[] {
  const bounds: Array<[number, number, string]> = [[0, 0.4, "<40%"], [0.4, 0.6, "40-60%"], [0.6, 0.8, "60-80%"], [0.8, 1.01, "≥80%"]];
  const samples = primarySamples(records, "jev-ai", version).flatMap((record) => {
    const probability = record.track === "jev-ai" ? record.outlookProbabilities?.bullish : undefined;
    const returnPct = record.outcome?.returns[record.forecast?.horizon ?? SUMMARY_HORIZON];
    return typeof probability === "number" && typeof returnPct === "number"
      ? [{ probability, up: returnPct > meaningfulMovePct(record) }] : [];
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
