import { DataQuality, ScenarioStatus } from "./evidence";
import { EntryAssessment } from "./scoring";

type SupportedLanguage = "zh-CN" | "zh-TW" | "en" | "ja";

interface PresentationLabels {
  rule: string;
  adjustment: string;
  final: string;
  left: string;
  right: string;
  statuses: Record<ScenarioStatus, string>;
  dailyProvisional: string;
  weeklyProvisional: string;
}

const LABELS: Record<SupportedLanguage, PresentationLabels> = {
  "zh-CN": {
    rule: "规则基础分", adjustment: "AI调整", final: "最终综合分", left: "左侧", right: "右侧",
    statuses: { not_formed: "未形成", watch: "观察", triggered: "触发", too_late: "过晚" },
    dailyProvisional: "日线暂定", weeklyProvisional: "周线暂定",
  },
  "zh-TW": {
    rule: "規則基礎分", adjustment: "AI調整", final: "最終綜合分", left: "左側", right: "右側",
    statuses: { not_formed: "未形成", watch: "觀察", triggered: "觸發", too_late: "過晚" },
    dailyProvisional: "日線暫定", weeklyProvisional: "週線暫定",
  },
  en: {
    rule: "Rule score", adjustment: "AI adjustment", final: "Final score", left: "Left", right: "Right",
    statuses: { not_formed: "Not formed", watch: "Watch", triggered: "Triggered", too_late: "Too late" },
    dailyProvisional: "Daily provisional", weeklyProvisional: "Weekly provisional",
  },
  ja: {
    rule: "ルールスコア", adjustment: "AI調整", final: "最終スコア", left: "左側", right: "右側",
    statuses: { not_formed: "未形成", watch: "監視", triggered: "発動", too_late: "手遅れ" },
    dailyProvisional: "日足暫定", weeklyProvisional: "週足暫定",
  },
};

export interface EntryScorePresentation {
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
}

export function buildEntryScorePresentation(
  assessment: EntryAssessment,
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
