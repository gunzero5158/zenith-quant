import type { EvidenceDirection, EvidenceItem, EvidenceSnapshot } from "./evidence";
import { localizedState } from "./fallbackReport";
import { localizedPatternName } from "../i18n/chartLabels";
import type { JevReading } from "./jevDecision";

type ReportLanguage = "zh-CN" | "zh-TW" | "en" | "ja";

interface ReadingLabels {
  heading: string;
  note: string;
  daily: string;
  weekly: string;
  directions: Record<EvidenceDirection, string>;
  tally: (bullish: number, neutral: number, bearish: number) => string;
}

const LABELS: Record<ReportLanguage, ReadingLabels> = {
  "zh-CN": {
    heading: "Jev 逐项判读",
    note: "每条指标的多空由 Jev 结合整体证据逐条判断，百分比是它对该判断的把握。",
    daily: "日线", weekly: "周线",
    directions: { bullish: "偏多", neutral: "中性", bearish: "偏空" },
    tally: (b, n, s) => `合计：偏多 ${b} 项、中性 ${n} 项、偏空 ${s} 项。`,
  },
  "zh-TW": {
    heading: "Jev 逐項判讀",
    note: "每條指標的多空由 Jev 結合整體證據逐條判斷，百分比是它對該判斷的把握。",
    daily: "日線", weekly: "週線",
    directions: { bullish: "偏多", neutral: "中性", bearish: "偏空" },
    tally: (b, n, s) => `合計：偏多 ${b} 項、中性 ${n} 項、偏空 ${s} 項。`,
  },
  en: {
    heading: "Jev signal-by-signal readings",
    note: "Jev reads each signal in the context of all evidence; the percentage is its confidence in that reading.",
    daily: "Daily", weekly: "Weekly",
    directions: { bullish: "Bullish", neutral: "Neutral", bearish: "Bearish" },
    tally: (b, n, s) => `Total: ${b} bullish, ${n} neutral, ${s} bearish.`,
  },
  ja: {
    heading: "Jev の指標別判定",
    note: "各指標の強弱は Jev が全体の根拠を踏まえて個別に判定します。パーセントはその判定の確信度です。",
    daily: "日足", weekly: "週足",
    directions: { bullish: "強気", neutral: "中立", bearish: "弱気" },
    tally: (b, n, s) => `合計：強気 ${b}、中立 ${n}、弱気 ${s}。`,
  },
};

function humanize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
}

function signalLabel(item: EvidenceItem, language: ReportLanguage): string {
  let label = localizedState(item, language);
  // Untranslated machine states read better spaced out than glued to the family name.
  if (/^[\x20-\x7e]+$/.test(item.state) && label.endsWith(item.state)) {
    label = `${label.slice(0, -item.state.length).trimEnd()} ${humanize(item.state)}`;
  }
  // Patterns and candlesticks share one family, so name the specific one.
  const [, group, key] = item.id.split(".");
  if (group === "pattern" && key) return `${localizedPatternName(key, humanize(key), language)} · ${label}`;
  if (group === "candlestick" && key) return `${label} · ${humanize(key)}`;
  return label;
}

/** Markdown list of Jev's per-signal readings, appended to the technical report in Jev mode. */
export function buildJevReadingsSection(
  readings: JevReading[],
  snapshot: EvidenceSnapshot,
  language: ReportLanguage
): string {
  if (readings.length === 0) return "";
  const labels = LABELS[language] ?? LABELS["zh-CN"];
  const items = new Map(snapshot.items.map((item) => [item.id, item]));
  const count = (direction: EvidenceDirection) => readings.filter((reading) => reading.direction === direction).length;

  const lines = readings.flatMap((reading) => {
    const item = items.get(reading.id);
    if (!item) return [];
    const timeframe = reading.timeframe === "weekly" ? labels.weekly : labels.daily;
    return [`- ${timeframe} ${signalLabel(item, language)}：**${labels.directions[reading.direction]}** ${Math.round(reading.probability * 100)}%`];
  });

  return [
    `### ${labels.heading}`,
    labels.note,
    "",
    ...lines,
    "",
    labels.tally(count("bullish"), count("neutral"), count("bearish")),
  ].join("\n");
}
