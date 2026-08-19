import { DataQuality, ScenarioStatus } from "./evidence";
import { EntryAssessment } from "./scoring";
import { AiEntryAssessment } from "./aiAnalysisResult";

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
