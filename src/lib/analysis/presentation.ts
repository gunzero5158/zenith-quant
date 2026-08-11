import type { AiEntryAssessment, AiMarketOutlook } from "./aiAnalysisResult";
import type { DataQuality, ScenarioStatus } from "./evidence";

type SupportedLanguage = "zh-CN" | "zh-TW" | "en" | "ja";

interface PresentationLabels {
  score: string;
  confidence: string;
  outlook: string;
  left: string;
  right: string;
  outlooks: Record<AiMarketOutlook, string>;
  statuses: Record<ScenarioStatus, string>;
  dailyProvisional: string;
  weeklyProvisional: string;
}

const LABELS: Record<SupportedLanguage, PresentationLabels> = {
  "zh-CN": {
    score: "AI 评分",
    confidence: "置信度",
    outlook: "走势",
    left: "左侧",
    right: "右侧",
    outlooks: { bullish: "看多", neutral: "中性", bearish: "看空" },
    statuses: { not_formed: "未形成", watch: "观察", triggered: "触发", too_late: "过晚" },
    dailyProvisional: "日线暂定",
    weeklyProvisional: "周线暂定",
  },
  "zh-TW": {
    score: "AI 評分",
    confidence: "置信度",
    outlook: "走勢",
    left: "左側",
    right: "右側",
    outlooks: { bullish: "看多", neutral: "中性", bearish: "看空" },
    statuses: { not_formed: "未形成", watch: "觀察", triggered: "觸發", too_late: "過晚" },
    dailyProvisional: "日線暫定",
    weeklyProvisional: "週線暫定",
  },
  en: {
    score: "AI score",
    confidence: "Confidence",
    outlook: "Outlook",
    left: "Left",
    right: "Right",
    outlooks: { bullish: "Bullish", neutral: "Neutral", bearish: "Bearish" },
    statuses: { not_formed: "Not formed", watch: "Watch", triggered: "Triggered", too_late: "Too late" },
    dailyProvisional: "Daily provisional",
    weeklyProvisional: "Weekly provisional",
  },
  ja: {
    score: "AI スコア",
    confidence: "確信度",
    outlook: "見通し",
    left: "左側",
    right: "右側",
    outlooks: { bullish: "強気", neutral: "中立", bearish: "弱気" },
    statuses: { not_formed: "未形成", watch: "監視", triggered: "発動", too_late: "遅すぎ" },
    dailyProvisional: "日足暫定",
    weeklyProvisional: "週足暫定",
  },
};

export interface EntryScorePresentation {
  scoreLabel: string;
  confidenceLabel: string;
  outlookLabel: string;
  leftLabel: string;
  rightLabel: string;
  scoreText: string;
  confidenceText: string;
  confidenceReason: string;
  outlookText: string;
  leftText: string;
  rightText: string;
  dataStatus: string;
}

export function buildEntryScorePresentation(
  assessment: AiEntryAssessment,
  language: string,
  dataQuality?: DataQuality
): EntryScorePresentation {
  const normalized = language === "zh-TW" || language === "en" || language === "ja" ? language : "zh-CN";
  const labels = LABELS[normalized];
  const statusParts: string[] = [];
  if (dataQuality) {
    statusParts.push(dataQuality.asOf.slice(0, 16).replace("T", " "));
    if (!dataQuality.dailyBarComplete) statusParts.push(labels.dailyProvisional);
    if (!dataQuality.weeklyBarComplete) statusParts.push(labels.weeklyProvisional);
  }
  return {
    scoreLabel: labels.score,
    confidenceLabel: labels.confidence,
    outlookLabel: labels.outlook,
    leftLabel: labels.left,
    rightLabel: labels.right,
    scoreText: assessment.finalScore.toFixed(1),
    confidenceText: `${Math.round(assessment.confidence * 100)}%`,
    confidenceReason: assessment.confidenceReason,
    outlookText: labels.outlooks[assessment.outlook],
    leftText: labels.statuses[assessment.leftStatus],
    rightText: labels.statuses[assessment.rightStatus],
    dataStatus: statusParts.join(" | "),
  };
}
