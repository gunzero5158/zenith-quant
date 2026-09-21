import { DataQuality, ScenarioStatus } from "./evidence";
import { EntryAssessment } from "./scoring";
import { AiEntryAssessment } from "./aiAnalysisResult";
import type { JevDecision, JevSetupStage } from "./jevDecision";

type SupportedLanguage = "zh-CN" | "zh-TW" | "en" | "ja";

interface PresentationLabels {
  ai: string;
  aiTrend: string;
  confidence: string;
  outlook: string;
  final: string;
  left: string;
  right: string;
  statuses: Record<ScenarioStatus, string>;
  outlooks: Record<AiEntryAssessment["outlook"], string>;
  outlookUnavailable: string;
  dailyProvisional: string;
  weeklyProvisional: string;
}

const LABELS: Record<SupportedLanguage, PresentationLabels> = {
  "zh-CN": {
    ai: "AI 评分", aiTrend: "AI趋势", confidence: "置信度", outlook: "走势", final: "最终综合分", left: "左侧", right: "右侧",
    statuses: { not_formed: "未形成", watch: "观察", provisional: "盘中暂定", triggered: "确认", too_late: "过晚" },
    outlooks: { bullish: "看多", neutral: "震荡", bearish: "看空" },
    outlookUnavailable: "未判断",
    dailyProvisional: "日线暂定", weeklyProvisional: "周线暂定",
  },
  "zh-TW": {
    ai: "AI 評分", aiTrend: "AI趨勢", confidence: "置信度", outlook: "走勢", final: "最終綜合分", left: "左側", right: "右側",
    statuses: { not_formed: "未形成", watch: "觀察", provisional: "盤中暫定", triggered: "確認", too_late: "過晚" },
    outlooks: { bullish: "看多", neutral: "震盪", bearish: "看空" },
    outlookUnavailable: "未判斷",
    dailyProvisional: "日線暫定", weeklyProvisional: "週線暫定",
  },
  en: {
    ai: "AI score", aiTrend: "AI trend", confidence: "Confidence", outlook: "Outlook", final: "Final score", left: "Left", right: "Right",
    statuses: { not_formed: "Not formed", watch: "Watch", provisional: "Intraday provisional", triggered: "Confirmed", too_late: "Too late" },
    outlooks: { bullish: "Bullish", neutral: "Neutral", bearish: "Bearish" },
    outlookUnavailable: "Unavailable",
    dailyProvisional: "Daily provisional", weeklyProvisional: "Weekly provisional",
  },
  ja: {
    ai: "AI スコア", aiTrend: "AIトレンド", confidence: "確信度", outlook: "見通し", final: "最終スコア", left: "左側", right: "右側",
    statuses: { not_formed: "未形成", watch: "監視", provisional: "日中暫定", triggered: "確認", too_late: "手遅れ" },
    outlooks: { bullish: "強気", neutral: "中立", bearish: "弱気" },
    outlookUnavailable: "未判定",
    dailyProvisional: "日足暫定", weeklyProvisional: "週足暫定",
  },
};

export interface EntryScorePresentation {
  finalLabel: string;
  leftLabel: string;
  rightLabel: string;
  finalText: string;
  leftText: string;
  rightText: string;
  dataStatus: string;
  confidenceLabel?: string;
  confidenceText?: string;
  confidenceReason?: string;
  outlookLabel?: string;
  outlookText?: string;
}

function isAiEntryAssessment(
  assessment: EntryAssessment | AiEntryAssessment
): assessment is AiEntryAssessment {
  return "source" in assessment && assessment.source === "ai";
}

export function buildEntryScorePresentation(
  assessment: EntryAssessment | AiEntryAssessment,
  language: string,
  dataQuality?: DataQuality
): EntryScorePresentation {
  const normalized = language === "zh-TW" || language === "en" || language === "ja" ? language : "zh-CN";
  const labels = LABELS[normalized];
  const statusParts: string[] = [];
  if (dataQuality) {
    statusParts.push(formatDataAsOf(dataQuality.asOf));
    if (!dataQuality.dailyBarComplete) statusParts.push(labels.dailyProvisional);
    if (!dataQuality.weeklyBarComplete) statusParts.push(labels.weeklyProvisional);
  }
  if (isAiEntryAssessment(assessment)) {
    return {
      finalLabel: labels.ai,
      leftLabel: labels.left,
      rightLabel: labels.right,
      finalText: assessment.finalScore.toFixed(1),
      leftText: labels.statuses[assessment.leftStatus],
      rightText: labels.statuses[assessment.rightStatus],
      dataStatus: statusParts.join(" · "),
      confidenceLabel: labels.confidence,
      confidenceText: `${Math.round(assessment.confidence * 100)}%`,
      confidenceReason: assessment.confidenceReason,
      outlookLabel: labels.outlook,
      outlookText: labels.outlooks[assessment.outlook],
    };
  }

  return {
    finalLabel: labels.final,
    leftLabel: labels.left,
    rightLabel: labels.right,
    finalText: assessment.finalScore.toFixed(1),
    leftText: labels.statuses[assessment.leftStatus],
    rightText: labels.statuses[assessment.rightStatus],
    dataStatus: statusParts.join(" · "),
    outlookLabel: labels.aiTrend,
    outlookText: assessment.aiOutlook ? labels.outlooks[assessment.aiOutlook] : labels.outlookUnavailable,
  };
}

interface JevLabels {
  score: string;
  stage: string;
  conflict: string;
  levels: Record<"low" | "medium" | "high", string>;
  timeframesOppose: string;
  stages: Record<JevSetupStage, string>;
}

const JEV_LABELS: Record<SupportedLanguage, JevLabels> = {
  "zh-CN": {
    score: "Jev 评分", stage: "阶段", conflict: "多空分歧",
    levels: { low: "低", medium: "中", high: "高" }, timeframesOppose: "日周相反",
    stages: {
      none: "无机会", breakdown: "已破位", left_watch: "左侧酝酿", left_triggered: "左侧可执行", range_watch: "窄幅震荡",
      rebound_underway: "反弹途中", right_watch: "右侧酝酿", right_triggered: "右侧可执行", extended: "已涨过头",
    },
  },
  "zh-TW": {
    score: "Jev 評分", stage: "階段", conflict: "多空分歧",
    levels: { low: "低", medium: "中", high: "高" }, timeframesOppose: "日週相反",
    stages: {
      none: "無機會", breakdown: "已破位", left_watch: "左側醞釀", left_triggered: "左側可執行", range_watch: "窄幅震盪",
      rebound_underway: "反彈途中", right_watch: "右側醞釀", right_triggered: "右側可執行", extended: "已漲過頭",
    },
  },
  en: {
    score: "Jev score", stage: "Stage", conflict: "Disagreement",
    levels: { low: "low", medium: "moderate", high: "high" }, timeframesOppose: "daily vs weekly",
    stages: {
      none: "No setup", breakdown: "Breakdown", left_watch: "Left developing", left_triggered: "Left executable", range_watch: "Tight range",
      rebound_underway: "Rebound underway", right_watch: "Right developing", right_triggered: "Right executable", extended: "Extended",
    },
  },
  ja: {
    score: "Jev スコア", stage: "段階", conflict: "強弱の対立",
    levels: { low: "小", medium: "中", high: "大" }, timeframesOppose: "日足と週足が逆",
    stages: {
      none: "機会なし", breakdown: "下抜け", left_watch: "左側形成中", left_triggered: "左側実行可", range_watch: "狭いレンジ",
      rebound_underway: "反発途中", right_watch: "右側形成中", right_triggered: "右側実行可", extended: "過熱",
    },
  },
};

export interface JevScorePresentation {
  finalLabel: string;
  /** Outlook probabilities as whole percentages that always sum to 100. */
  outlook: Array<{ key: AiEntryAssessment["outlook"]; label: string; percent: number }>;
  stageLabel?: string;
  stageText?: string;
  /** Absent for results cached before disagreement was counted from the readings. */
  conflictLabel?: string;
  conflictText?: string;
}

export function buildJevScorePresentation(
  decision: Pick<JevDecision, "outlookProbabilities"> & Partial<Pick<JevDecision, "setupStage" | "disagreement">>,
  language: string
): JevScorePresentation {
  const normalized = language === "zh-TW" || language === "en" || language === "ja" ? language : "zh-CN";
  const labels = JEV_LABELS[normalized];
  const keys = ["bullish", "neutral", "bearish"] as const;
  const raw = keys.map((key) => Math.max(0, decision.outlookProbabilities?.[key] ?? 0));
  const total = raw.reduce((sum, value) => sum + value, 0) || 1;
  const percents = raw.map((value) => Math.round((value / total) * 100));
  // Rounding can leave the three parts at 99 or 101; settle the difference on the largest part.
  percents[percents.indexOf(Math.max(...percents))] += 100 - percents.reduce((sum, value) => sum + value, 0);
  const stageText = decision.setupStage ? labels.stages[decision.setupStage] : undefined;

  return {
    finalLabel: labels.score,
    outlook: keys.map((key, index) => ({ key, label: LABELS[normalized].outlooks[key], percent: percents[index] })),
    stageLabel: stageText ? labels.stage : undefined,
    stageText,
    ...(decision.disagreement ? {
      conflictLabel: labels.conflict,
      conflictText: `${labels.levels[decision.disagreement.level]} (${decision.disagreement.bullish}:${decision.disagreement.bearish})${decision.disagreement.timeframesOppose ? ` · ${labels.timeframesOppose}` : ""}`,
    } : {}),
  };
}

export function formatDataAsOf(asOf: string, timeZone?: string): string {
  const date = new Date(asOf);
  if (!Number.isFinite(date.getTime())) return asOf.slice(0, 16).replace("T", " ");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}
