import { DataQuality, ScenarioStatus } from "./evidence";
import { EntryAssessment } from "./scoring";
import { AiEntryAssessment } from "./aiAnalysisResult";

type SupportedLanguage = "zh-CN" | "zh-TW" | "en" | "ja";

interface PresentationLabels {
  ai: string;
  confidence: string;
  outlook: string;
  rule: string;
  adjustment: string;
  final: string;
  left: string;
  right: string;
  statuses: Record<ScenarioStatus, string>;
  outlooks: Record<AiEntryAssessment["outlook"], string>;
  dailyProvisional: string;
  weeklyProvisional: string;
}

const LABELS: Record<SupportedLanguage, PresentationLabels> = {
  "zh-CN": {
    ai: "AI 评分", confidence: "置信度", outlook: "走势", rule: "规则基础分", adjustment: "AI调整", final: "最终综合分", left: "左侧", right: "右侧",
    statuses: { not_formed: "未形成", watch: "观察", provisional: "盘中暂定", triggered: "确认", too_late: "过晚" },
    outlooks: { bullish: "看多", neutral: "中性", bearish: "看空" },
    dailyProvisional: "日线暂定", weeklyProvisional: "周线暂定",
  },
  "zh-TW": {
    ai: "AI 評分", confidence: "置信度", outlook: "走勢", rule: "規則基礎分", adjustment: "AI調整", final: "最終綜合分", left: "左側", right: "右側",
    statuses: { not_formed: "未形成", watch: "觀察", provisional: "盤中暫定", triggered: "確認", too_late: "過晚" },
    outlooks: { bullish: "看多", neutral: "中性", bearish: "看空" },
    dailyProvisional: "日線暫定", weeklyProvisional: "週線暫定",
  },
  en: {
    ai: "AI score", confidence: "Confidence", outlook: "Outlook", rule: "Rule score", adjustment: "AI adjustment", final: "Final score", left: "Left", right: "Right",
    statuses: { not_formed: "Not formed", watch: "Watch", provisional: "Intraday provisional", triggered: "Confirmed", too_late: "Too late" },
    outlooks: { bullish: "Bullish", neutral: "Neutral", bearish: "Bearish" },
    dailyProvisional: "Daily provisional", weeklyProvisional: "Weekly provisional",
  },
  ja: {
    ai: "AI スコア", confidence: "確信度", outlook: "見通し", rule: "ルールスコア", adjustment: "AI調整", final: "最終スコア", left: "左側", right: "右側",
    statuses: { not_formed: "未形成", watch: "監視", provisional: "日中暫定", triggered: "確認", too_late: "手遅れ" },
    outlooks: { bullish: "強気", neutral: "中立", bearish: "弱気" },
    dailyProvisional: "日足暫定", weeklyProvisional: "週足暫定",
  },
};

export interface EntryScorePresentation {
  mode: "rule-ai" | "ai-native";
  ruleLabel: string;
  adjustmentLabel: string;
  finalLabel: string;
  leftLabel: string;
  rightLabel: string;
  ruleText: string;
  adjustmentText: string;
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
    statusParts.push(dataQuality.asOf.slice(0, 16).replace("T", " "));
    if (!dataQuality.dailyBarComplete) statusParts.push(labels.dailyProvisional);
    if (!dataQuality.weeklyBarComplete) statusParts.push(labels.weeklyProvisional);
  }
  if (isAiEntryAssessment(assessment)) {
    return {
      mode: "ai-native",
      ruleLabel: "",
      adjustmentLabel: "",
      finalLabel: labels.ai,
      leftLabel: labels.left,
      rightLabel: labels.right,
      ruleText: "",
      adjustmentText: "",
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
    mode: "rule-ai",
    ruleLabel: labels.rule,
    adjustmentLabel: labels.adjustment,
    finalLabel: labels.final,
    leftLabel: labels.left,
    rightLabel: labels.right,
    ruleText: assessment.ruleScore.toFixed(1),
    adjustmentText: `${assessment.aiAdjustment >= 0 ? "+" : ""}${assessment.aiAdjustment.toFixed(1)}`,
    finalText: assessment.finalScore.toFixed(1),
    leftText: labels.statuses[assessment.leftStatus],
    rightText: labels.statuses[assessment.rightStatus],
    dataStatus: statusParts.join(" · "),
  };
}
