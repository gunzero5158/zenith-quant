import type { AiEntryAssessment } from "./aiAnalysisResult";
import type { EntryAssessment } from "./scoring";
import { planIsExecutable, roundPrice } from "./opportunities";

const labels = {
  "zh-CN": { score: "入场参考", note: "当前机会的入场质量，不是上涨概率。", daily: "日线", weekly: "周线", days: "个交易日",
    kind: { rebound: "短期反弹", pullback: "趋势回踩", breakout: "突破机会" },
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

export function opportunityPresentation(assessment: Pick<EntryAssessment | AiEntryAssessment, "opportunity" | "currentTrend" | "forecast">, language: string) {
  const t = labels[language === "en" || language === "ja" || language === "zh-TW" ? language : "zh-CN"];
  const opportunity = assessment.opportunity;
  const trend = assessment.currentTrend;
  const plan = opportunity?.plan;
  const copy = language === "en" ? {
    pending: "Observation only — no entry authorized", ready: "Confirmed entry conditions",
    conflict: "Confirmation lies beyond the first obstacle or viable entry range. Reassess after the price structure changes.",
    risk: "Insufficient room to the first obstacle for the current risk. No executable plan.",
    price: "Wait for price confirmation and independent improvement; oversold alone is not an entry signal.",
    candidate: "Candidate levels, not an active trade", obstacle: "First obstacle", stop: "Candidate stop",
  } : language === "ja" ? {
    pending: "監視のみ・新規エントリー未承認", ready: "エントリー条件確認済み",
    conflict: "確認価格が最初の抵抗または許容エントリー範囲を超えています。価格構造の変化後に再評価します。",
    risk: "最初の抵抗までの値幅がリスクに見合いません。実行可能な計画はありません。",
    price: "価格確認と独立した改善根拠を待ちます。売られ過ぎだけでは入場条件になりません。",
    candidate: "候補価格・実行中の計画ではありません", obstacle: "最初の抵抗", stop: "候補ストップ",
  } : {
    pending: "仅观察，尚不支持入场", ready: "入场条件已确认",
    conflict: "确认价已超过首个阻力或可接受入场区间，当前路径不成立；需等待价格结构改变后重新评估。",
    risk: "到首个阻力的空间不足以覆盖当前风险，尚无可执行方案。",
    price: "等待价格确认及独立改善证据，超卖本身不是入场信号。",
    candidate: "候选价位，非执行计划", obstacle: "首个阻力", stop: "候选止损",
  };
  const executable = opportunity?.status === "triggered" && planIsExecutable(plan) && plan?.priceConfirmed === true;
  const conflict = plan && !plan.priceConfirmed && plan.trigger !== undefined
    && ((plan.target !== undefined && plan.trigger >= plan.target)
      || (plan.stop !== undefined && plan.target !== undefined && plan.trigger > plan.maxEntry));
  const warning = !plan ? undefined : conflict ? copy.conflict : !planIsExecutable(plan) ? copy.risk
    : !plan.priceConfirmed ? copy.price : undefined;
  return {
    label: t.score, note: t.note, detailsLabel: t.details,
    action: executable ? copy.ready : copy.pending,
    warning, planLabel: executable ? t.score : copy.candidate,
    kind: opportunity ? t.kind[opportunity.kind] : t.none,
    status: opportunity ? t.status[opportunity.status] : undefined,
    horizon: (assessment.forecast?.horizon ?? opportunity?.horizon) ? `${assessment.forecast?.horizon ?? opportunity?.horizon} ${t.days}` : undefined,
    trend: trend ? `${t.daily} ${t.trend[trend.daily]} · ${t.weekly} ${t.trend[trend.weekly]}` : undefined,
    opportunity: opportunity ? `${t.kind[opportunity.kind]} · ${t.status[opportunity.status]} · ${opportunity.horizon} ${t.days}` : t.none,
    plan: plan ? [plan.trigger !== undefined ? `${t.trigger} ${roundPrice(plan.trigger)}` : undefined,
      plan.stop !== undefined ? `${!executable ? copy.stop : plan.stopBasis === "volatility" ? t.volatility : t.stop} ${roundPrice(plan.stop)}` : undefined,
      plan.target !== undefined ? `${executable ? t.target : copy.obstacle} ${roundPrice(plan.target)}` : undefined,
      executable && plan.stop !== undefined && plan.target !== undefined ? `${t.max} ${roundPrice(plan.maxEntry)}` : undefined,
    ].filter(Boolean).join(" · ") : undefined,
  };
}
