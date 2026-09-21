// Track record of what each analysis mode concluded, so its conclusions can
// later be compared with what the price actually did. Records live in the
// browser (this deployment has no database) and can be exported as JSON.

export type ValidationTrack = "rule" | "rule-ai" | "ai-native" | "jev-ai";
export type ValidationOutlook = "bullish" | "neutral" | "bearish";

// Bump a track's version whenever its decision logic changes, so results from
// different logic are never pooled into one statistic.
export const TRACK_VERSIONS: Record<ValidationTrack, string> = {
  rule: "2026-08",
  "rule-ai": "2026-08",
  "ai-native": "2026-09-21",
  "jev-ai": "2026-09-21",
};

export const VALIDATION_HORIZONS = [5, 10, 20] as const;
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
}

export interface ValidationRecord {
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
}

interface AssessmentLike {
  finalScore: number;
  ruleScore?: number;
  outlook?: ValidationOutlook;
  aiOutlook?: ValidationOutlook;
  leftStatus: string;
  rightStatus: string;
  activeSetup: "left" | "right" | "none";
  riskPlan?: { stop?: number; target?: number };
}

export interface AnalysisLike {
  symbol: string;
  companyName?: string;
  price: number;
  isMock?: boolean;
  isLLMUsed: boolean;
  analysisMode?: "rule-ai" | "ai-native" | "jev-ai";
  entryAssessment?: AssessmentLike;
  ruleBaseline?: AssessmentLike;
  jevDecision?: { outlookProbabilities?: Record<ValidationOutlook, number>; setupStage?: string };
  dataQuality?: { latestDailyDate?: string };
  dailyCandles: Array<{ date: unknown }>;
  indicators?: { atr?: number[] };
}

export function barDateOf(value: unknown): string {
  return String(value).slice(0, 10);
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
  return {
    id: `${analysis.symbol}|${track}|${barDate}`,
    symbol: analysis.symbol,
    companyName: analysis.companyName,
    track,
    trackVersion: TRACK_VERSIONS[track],
    analyzedAt,
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

/**
 * Re-analyzing the same stock on the same bar replaces that day's record for
 * the track, so one trading day contributes one sample per stock and track.
 * The rule baseline is deterministic for a closed bar, so an existing one is kept
 * together with any outcome already evaluated for it.
 */
export function mergeValidationRecords(existing: ValidationRecord[], incoming: ValidationRecord[]): ValidationRecord[] {
  const merged = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    const previous = merged.get(item.id);
    merged.set(item.id, previous?.outcome && previous.price === item.price ? { ...item, outcome: previous.outcome } : item);
  }
  return [...merged.values()].sort((left, right) => right.analyzedAt - left.analyzedAt);
}
