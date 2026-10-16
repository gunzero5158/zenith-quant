// Track record of what each analysis mode concluded, so its conclusions can
// later be compared with what the price actually did. Records live in the
// browser (this deployment has no database) and can be exported as JSON.

import type { CandidateTradePlan, ForecastEvent, OpportunityAssessment } from "../analysis/opportunities";
import { DECISION_VERSION } from "../analysis/opportunities";
import type { ExecutionOutcome, ExecutionPolicy } from "./tradeExecution";
import { executionPolicyFor } from "./executionPolicy";

export type ValidationTrack = "rule" | "rule-ai" | "ai-native" | "jev-ai";
export type ValidationOutlook = "bullish" | "neutral" | "bearish";

// Bump a track's version whenever its decision logic changes, so results from
// different logic are never pooled into one statistic.
export const TRACK_VERSIONS: Record<ValidationTrack, string> = {
  rule: DECISION_VERSION,
  "rule-ai": DECISION_VERSION,
  "ai-native": DECISION_VERSION,
  "jev-ai": DECISION_VERSION,
};

export const VALIDATION_HORIZONS = [3, 5, 10, 20] as const;
export type ValidationHorizon = (typeof VALIDATION_HORIZONS)[number];

export interface ValidationOutcome {
  evaluatedAt: number;
  /** Daily bars that have closed after the analysis bar. */
  barsElapsed: number;
  /** Percent return from the analysis price to the close N bars later. */
  returns: Partial<Record<ValidationHorizon, number>>;
  maxGainPct?: number;
  maxDrawdownPct?: number;
  /** Only for records that recommended an entry with a stop and a target. */
  plan?: "target" | "stop" | "open" | "timeout";
  planBars?: number;
  /** True once the longest horizon has elapsed; the record is then final. */
  complete: boolean;
  execution?: ExecutionOutcome;
  costSensitivity?: { zero: ExecutionOutcome; doubled: ExecutionOutcome };
}

export interface ValidationRecord {
  schemaVersion?: 2;
  id: string;
  symbol: string;
  companyName?: string;
  track: ValidationTrack;
  trackVersion: string;
  /** Which LLM wrote or judged this record, when one was involved. */
  model?: string;
  analyzedAt: number;
  /** Date (YYYY-MM-DD) of the daily bar the analysis was based on. */
  barDate: string;
  price: number;
  /** Daily ATR as a percent of price; sizes the "meaningful move" band. */
  atrPct?: number;
  outlook?: ValidationOutlook;
  outlookProbabilities?: Record<ValidationOutlook, number>;
  score: number;
  leftStatus: string;
  rightStatus: string;
  activeSetup: "left" | "right" | "none";
  stage?: string;
  stop?: number;
  target?: number;
  outcome?: ValidationOutcome;
  snapshotId?: string;
  decisionId?: string;
  dataSource?: string;
  dailyBarComplete?: boolean;
  forecast?: ForecastEvent;
  opportunity?: OpportunityAssessment;
  executionPolicy?: ExecutionPolicy;
}

interface AssessmentLike {
  decisionVersion?: string;
  forecast?: ForecastEvent;
  opportunity?: OpportunityAssessment;
  finalScore: number;
  ruleScore?: number;
  outlook?: ValidationOutlook;
  aiOutlook?: ValidationOutlook;
  leftStatus: string;
  rightStatus: string;
  activeSetup: "left" | "right" | "none";
  riskPlan?: Partial<CandidateTradePlan>;
}

export interface AnalysisLike {
  symbol: string;
  companyName?: string;
  price: number;
  isMock?: boolean;
  snapshotId?: string;
  decisionId?: string;
  decisionTime?: string;
  dataSource?: string;
  isLLMUsed: boolean;
  analysisMode?: "rule-ai" | "ai-native" | "jev-ai";
  entryAssessment?: AssessmentLike;
  ruleBaseline?: AssessmentLike;
  legacyComparison?: AssessmentLike;
  jevDecision?: { outlookProbabilities?: Record<ValidationOutlook, number>; setupStage?: string };
  dataQuality?: { latestDailyDate?: string; dailyBarComplete?: boolean; asOf?: string };
  dailyCandles: Array<{ date: unknown }>;
  indicators?: { atr?: number[] };
}

export function barDateOf(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function record(
  analysis: AnalysisLike,
  track: ValidationTrack,
  assessment: AssessmentLike,
  analyzedAt: number,
  extra: Partial<ValidationRecord> = {}
): ValidationRecord {
  const barDate = barDateOf(analysis.dataQuality?.latestDailyDate ?? analysis.dailyCandles.at(-1)?.date ?? "");
  const atr = analysis.indicators?.atr?.at(-1);
  const trackVersion = assessment.decisionVersion ?? TRACK_VERSIONS[track];
  const decisionTime = analysis.decisionTime ? Date.parse(analysis.decisionTime) : analyzedAt;
  const decisionId = analysis.decisionId ?? `${decisionTime}`;
  return {
    schemaVersion: 2,
    id: `${analysis.symbol}|${track}|${trackVersion}|${barDate}|${decisionId}`,
    symbol: analysis.symbol,
    companyName: analysis.companyName,
    track,
    trackVersion,
    analyzedAt: decisionTime,
    decisionId,
    snapshotId: analysis.snapshotId,
    dataSource: analysis.dataSource,
    dailyBarComplete: analysis.dataQuality?.dailyBarComplete,
    forecast: assessment.forecast,
    opportunity: assessment.opportunity,
    executionPolicy: executionPolicyFor(analysis.symbol),
    barDate,
    price: analysis.price,
    atrPct: typeof atr === "number" && Number.isFinite(atr) && analysis.price > 0
      ? Number(((atr / analysis.price) * 100).toFixed(2))
      : undefined,
    score: assessment.finalScore,
    leftStatus: assessment.leftStatus,
    rightStatus: assessment.rightStatus,
    activeSetup: assessment.activeSetup,
    stop: assessment.riskPlan?.stop,
    target: assessment.riskPlan?.target,
    ...extra,
  };
}

/**
 * One analysis yields the record of the mode that ran plus the pure rule
 * baseline, which the engine computes on every request at no cost.
 */
export function recordsFromAnalysis(analysis: AnalysisLike, analyzedAt: number, model?: string): ValidationRecord[] {
  const assessment = analysis.entryAssessment;
  if (analysis.isMock || !assessment || !(analysis.price > 0) || analysis.dailyCandles.length === 0) return [];
  const mode = analysis.analysisMode ?? "rule-ai";
  const records: ValidationRecord[] = [];
  if (analysis.legacyComparison) {
    records.push(record(analysis, "rule", analysis.legacyComparison, analyzedAt));
  }

  if (mode === "rule-ai") {
    records.push(record(analysis, "rule", { ...assessment, finalScore: assessment.ruleScore ?? assessment.finalScore }, analyzedAt));
    if (analysis.isLLMUsed) {
      records.push(record(analysis, "rule-ai", assessment, analyzedAt, { outlook: assessment.aiOutlook, model }));
    }
    return records;
  }

  if (analysis.ruleBaseline) {
    const baseline = analysis.ruleBaseline;
    records.push(record(analysis, "rule", { ...baseline, finalScore: baseline.ruleScore ?? baseline.finalScore }, analyzedAt));
  }
  records.push(record(analysis, mode, assessment, analyzedAt, {
    outlook: assessment.outlook,
    model,
    ...(mode === "jev-ai" ? {
      outlookProbabilities: analysis.jevDecision?.outlookProbabilities,
      stage: analysis.jevDecision?.setupStage,
    } : {}),
  }));
  return records;
}

const STORAGE_KEY = "zenith_validation_records_v1";
const MAX_RECORDS = 5000;

export function isValidationRecord(value: unknown): value is ValidationRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ValidationRecord>;
  return typeof item.id === "string" && typeof item.symbol === "string" && typeof item.track === "string"
    && typeof item.barDate === "string" && typeof item.price === "number" && typeof item.score === "number";
}

export function loadValidationRecords(): ValidationRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isValidationRecord) : [];
  } catch {
    return [];
  }
}

export function saveValidationRecords(records: ValidationRecord[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
    return true;
  } catch {
    return false;
  }
}

/** Decisions are immutable. Refreshing outcomes is a separate operation. */
export function mergeValidationRecords(existing: ValidationRecord[], incoming: ValidationRecord[]): ValidationRecord[] {
  const merged = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    const previous = merged.get(item.id);
    if (!previous) merged.set(item.id, item);
  }
  return [...merged.values()].sort((left, right) => right.analyzedAt - left.analyzedAt);
}

/** First completed-bar decision per day, model and version is the primary sample.
 * All other runs remain available for audit/export, not extra statistical votes.
 */
export function primarySamples(records: ValidationRecord[], track: ValidationTrack, version = TRACK_VERSIONS[track]): ValidationRecord[] {
  const samples = new Map<string, ValidationRecord>();
  for (const record of [...records].sort((a, b) => a.analyzedAt - b.analyzedAt)) {
    if (record.track !== track || record.trackVersion !== version || record.schemaVersion !== 2
      || !record.snapshotId || !record.forecast || record.dailyBarComplete !== true) continue;
    const key = `${record.symbol}|${record.barDate}|${record.model ?? "rule"}|${record.forecast.horizon}`;
    if (!samples.has(key)) samples.set(key, record);
  }
  return [...samples.values()];
}
