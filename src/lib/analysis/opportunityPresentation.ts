import type { AiEntryAssessment } from "./aiAnalysisResult";
import type { EntryAssessment } from "./scoring";
import { roundPrice } from "./opportunities";

const labels = {
  "zh-CN": { score: "入场参考", note: "当前机会的入场质量，不是上涨概率。", daily: "日线", weekly: "周线", days: "个交易日",
    kind: { rebound: "短期反弹", pullback: "趋势回踩", breakout: "突破确认" },
    trend: { bullish: "偏强", bearish: "偏弱", neutral: "震荡" },
    status: { not_formed: "未形成", watch: "观察", provisional: "待收盘确认", triggered: "确认", too_late: "过晚", invalidated: "失效" },
    trigger: "触发参考", stop: "失效止损", volatility: "波动止损", target: "首个目标", max: "最高参考入场价", details: "模型判断详情（非交易胜率）", none: "无可执行机会" },
  "zh-TW": { score: "入場參考", note: "目前機會的入場品質，不是上漲機率。", daily: "日線", weekly: "週線", days: "個交易日",
    kind: { rebound: "短期反彈", pullback: "趨勢回踩", breakout: "突破確認" },
    trend: { bullish: "偏強", bearish: "偏弱", neutral: "震盪" },
    status: { not_formed: "未形成", watch: "觀察", provisional: "待收盤確認", triggered: "確認", too_late: "過晚", invalidated: "失效" },
    trigger: "觸發參考", stop: "失效止損", volatility: "波動止損", target: "首個目標", max: "最高參考入場價", details: "模型判斷詳情（非交易勝率）", none: "無可執行機會" },
  en: { score: "Entry quality", note: "Quality of this entry opportunity, not the probability of a rise.", daily: "Daily", weekly: "Weekly", days: "trading days",
    kind: { rebound: "Short rebound", pullback: "Trend pullback", breakout: "Breakout" },
    trend: { bullish: "bullish", bearish: "bearish", neutral: "neutral" },
    status: { not_formed: "Not formed", watch: "Watch", provisional: "Awaiting close", triggered: "Confirmed", too_late: "Too late", invalidated: "Invalidated" },
    trigger: "Trigger reference", stop: "Invalidation stop", volatility: "Volatility stop", target: "First target", max: "Maximum reference entry", details: "Model details (not trading win rates)", none: "No executable opportunity" },
  ja: { score: "エントリー参考", note: "現在のエントリー機会の評価であり、上昇確率ではありません。", daily: "日足", weekly: "週足", days: "取引日",
    kind: { rebound: "短期反発", pullback: "トレンド押し目", breakout: "ブレイクアウト" },
    trend: { bullish: "強気", bearish: "弱気", neutral: "中立" },
    status: { not_formed: "未形成", watch: "監視", provisional: "終値確認待ち", triggered: "確認", too_late: "機会経過", invalidated: "無効" },
    trigger: "発動参考値", stop: "無効化ストップ", volatility: "変動幅ストップ", target: "第一目標", max: "参考エントリー上限", details: "モデル判断の詳細（取引勝率ではありません）", none: "実行可能な機会なし" },
};

export function opportunityPresentation(assessment: Pick<EntryAssessment | AiEntryAssessment, "opportunity" | "currentTrend">, language: string) {
  const t = labels[language === "en" || language === "ja" || language === "zh-TW" ? language : "zh-CN"];
  const opportunity = assessment.opportunity;
  const trend = assessment.currentTrend;
  const plan = opportunity?.plan;
  return {
    label: t.score, note: t.note, detailsLabel: t.details,
    trend: trend ? `${t.daily} ${t.trend[trend.daily]} · ${t.weekly} ${t.trend[trend.weekly]}` : undefined,
    opportunity: opportunity ? `${t.kind[opportunity.kind]} · ${t.status[opportunity.status]} · ${opportunity.horizon} ${t.days}` : t.none,
    plan: plan ? [plan.trigger !== undefined ? `${t.trigger} ${roundPrice(plan.trigger)}` : undefined,
      plan.stop !== undefined ? `${plan.stopBasis === "volatility" ? t.volatility : t.stop} ${roundPrice(plan.stop)}` : undefined,
      plan.target !== undefined ? `${t.target} ${roundPrice(plan.target)}` : undefined,
      plan.stop !== undefined && plan.target !== undefined ? `${t.max} ${roundPrice(plan.maxEntry)}` : undefined,
    ].filter(Boolean).join(" · ") : undefined,
  };
}
