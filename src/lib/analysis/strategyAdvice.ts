import { EvidenceSnapshot, ScenarioStatus } from "./evidence";
import { EntryAssessment } from "./scoring";

export interface StrategyAdvice {
  holder: { action: "hold" | "hold_protect" | "reduce" | "exit"; text: string };
  leftEntry: { action: "wait" | "probe" | "not_applicable"; text: string };
  rightAdd: { action: "wait_breakout" | "add_on_retest" | "avoid_chasing"; text: string };
  exitStop: {
    structuralStop?: number;
    atrStop?: number;
    trigger: "close" | "intraday";
    text: string;
  };
}

type AdviceLanguage = "zh-CN" | "zh-TW" | "en" | "ja";
type HolderAction = StrategyAdvice["holder"]["action"];

const HOLDER_TEXT: Record<AdviceLanguage, Record<HolderAction, string>> = {
  "zh-CN": {
    exit: "日线破位且空头结构已确认，持仓应执行退出。",
    reduce: "趋势完整性转弱，持仓应降低仓位并收紧保护位。",
    hold_protect: "趋势仍完整但价格过热，已有仓位可持有并上移保护位。",
    hold: "趋势尚未触发结构失效，已有仓位可按计划持有。",
  },
  "zh-TW": {
    exit: "日線破位且空頭結構已確認，持倉應執行退出。",
    reduce: "趨勢完整性轉弱，持倉應降低倉位並收緊保護位。",
    hold_protect: "趨勢仍完整但價格過熱，已有倉位可持有並上移保護位。",
    hold: "趨勢尚未觸發結構失效，已有倉位可按計劃持有。",
  },
  en: {
    exit: "The daily structure has broken down and the bearish pattern is confirmed; exit existing positions.",
    reduce: "Trend integrity has weakened; reduce exposure and tighten protection.",
    hold_protect: "The trend remains intact but price is extended; hold existing positions and raise the protective level.",
    hold: "The trend has not invalidated structurally; existing positions can be held according to plan.",
  },
  ja: {
    exit: "日足が下方へ崩れ、弱気構造も確認済みです。保有ポジションは撤退します。",
    reduce: "トレンドの健全性が弱まっています。ポジションを減らし、保護水準を引き上げます。",
    hold_protect: "トレンドは維持されていますが過熱気味です。保有を継続し、保護水準を引き上げます。",
    hold: "構造的な無効化は発生していません。計画に沿って保有を継続できます。",
  },
};

const LEFT_TEXT: Record<AdviceLanguage, Record<ScenarioStatus, string>> = {
  "zh-CN": {
    triggered: "左侧条件已确认，可用试探仓验证，失效即退出。",
    provisional: "左侧条件盘中暂时成立，等待日线收盘确认后再执行。",
    watch: "左侧仅处于观察阶段，等待位置与短期确认同时成立。",
    too_late: "左侧机会已离开低风险区域或盈亏比不足，不再追价。",
    not_formed: "当前不适用左侧开仓，不以超卖或强势状态替代触发条件。",
  },
  "zh-TW": {
    triggered: "左側條件已確認，可用試探倉驗證，失效即退出。",
    provisional: "左側條件盤中暫時成立，等待日線收盤確認後再執行。",
    watch: "左側僅處於觀察階段，等待位置與短期確認同時成立。",
    too_late: "左側機會已離開低風險區域或盈虧比不足，不再追價。",
    not_formed: "目前不適用左側開倉，不以超賣或強勢狀態替代觸發條件。",
  },
  en: {
    triggered: "Left-side conditions are confirmed; a small probe position is acceptable with immediate exit on invalidation.",
    provisional: "Left-side conditions are only valid intraday; wait for the daily close before acting.",
    watch: "The left-side setup is on watch; wait for price location and short-term confirmation to align.",
    too_late: "The left-side opportunity has left the low-risk area or lacks sufficient reward-to-risk; do not chase.",
    not_formed: "A left-side entry is not applicable; oversold or strong readings do not replace trigger conditions.",
  },
  ja: {
    triggered: "左側条件は確認済みです。小さな試し玉で検証し、無効化時は直ちに撤退します。",
    provisional: "左側条件は日中のみ暫定成立しています。日足終値の確認を待ちます。",
    watch: "左側は監視段階です。価格位置と短期確認がそろうまで待ちます。",
    too_late: "左側機会は低リスク領域を離れたか、損益比が不足しています。追いかけません。",
    not_formed: "現在は左側エントリーの対象外です。売られ過ぎや強さだけでは発動条件になりません。",
  },
};

const RIGHT_TEXT: Record<AdviceLanguage, Record<ScenarioStatus, string>> = {
  "zh-CN": {
    triggered: "右侧突破已确认，优先等待回踩承接后再加仓。",
    provisional: "右侧突破盘中暂时成立，等待收盘或回踩确认。",
    watch: "右侧条件处于观察阶段，等待关键位突破与量价确认。",
    too_late: "价格已远离突破位或盈亏比不足，右侧策略避免追涨。",
    not_formed: "右侧条件尚未形成，等待关键位突破与量价确认。",
  },
  "zh-TW": {
    triggered: "右側突破已確認，優先等待回踩承接後再加倉。",
    provisional: "右側突破盤中暫時成立，等待收盤或回踩確認。",
    watch: "右側條件處於觀察階段，等待關鍵位突破與量價確認。",
    too_late: "價格已遠離突破位或盈虧比不足，右側策略避免追漲。",
    not_formed: "右側條件尚未形成，等待關鍵位突破與量價確認。",
  },
  en: {
    triggered: "The right-side breakout is confirmed; prefer adding only after a successful retest.",
    provisional: "The right-side breakout is only provisional intraday; wait for the close or a confirmed retest.",
    watch: "The right-side setup is on watch; wait for a key-level breakout with price-volume confirmation.",
    too_late: "Price is too far from the breakout level or reward-to-risk is insufficient; avoid chasing.",
    not_formed: "The right-side setup has not formed; wait for a key-level breakout with price-volume confirmation.",
  },
  ja: {
    triggered: "右側ブレイクアウトは確認済みです。押し目での支持確認後に追加する方針を優先します。",
    provisional: "右側ブレイクアウトは日中の暫定状態です。終値または押し目確認を待ちます。",
    watch: "右側は監視段階です。重要水準の突破と出来高確認を待ちます。",
    too_late: "価格が突破水準から離れ過ぎているか、損益比が不足しています。高値追いを避けます。",
    not_formed: "右側条件はまだ形成されていません。重要水準の突破と出来高確認を待ちます。",
  },
};

function normalizeLanguage(language?: string): AdviceLanguage {
  if (language === "en" || language === "ja") return language;
  if (language === "zh-TW" || language === "zh-HK") return "zh-TW";
  return "zh-CN";
}

function latestAtr(snapshot: EvidenceSnapshot): number | undefined {
  const value = snapshot.items.find((item) => item.timeframe === "daily" && item.family === "atr")?.values?.value;
  return typeof value === "number" && value > 0 ? value : undefined;
}

function exitStopText(
  language: AdviceLanguage,
  structuralStop: number | undefined,
  atrStop: number | undefined,
  trigger: StrategyAdvice["exitStop"]["trigger"]
): string {
  if (language === "en") {
    const levels = [
      structuralStop !== undefined ? `Structural stop ${structuralStop.toFixed(2)}` : undefined,
      atrStop !== undefined ? `ATR stop ${atrStop.toFixed(2)}` : undefined,
    ].filter(Boolean);
    return `${levels.join(", ") || "No executable stop is currently available"}. Execute on an ${trigger === "close" ? "end-of-day close" : "intraday"} basis.`;
  }
  if (language === "ja") {
    const levels = [
      structuralStop !== undefined ? `構造ストップ ${structuralStop.toFixed(2)}` : undefined,
      atrStop !== undefined ? `ATRストップ ${atrStop.toFixed(2)}` : undefined,
    ].filter(Boolean);
    return `${levels.join("、") || "現在、実行可能なストップ水準はありません"}。${trigger === "close" ? "終値" : "日中"}基準で執行します。`;
  }
  const traditional = language === "zh-TW";
  const levels = [
    structuralStop !== undefined ? `${traditional ? "結構止損" : "结构止损"} ${structuralStop.toFixed(2)}` : undefined,
    atrStop !== undefined ? `ATR${traditional ? "止損" : "止损"} ${atrStop.toFixed(2)}` : undefined,
  ].filter(Boolean);
  const fallback = traditional ? "目前缺少可執行止損位" : "当前缺少可执行止损位";
  const basis = trigger === "close" ? (traditional ? "收盤" : "收盘") : (traditional ? "盤中" : "盘中");
  return `${levels.join(traditional ? "，" : "，") || fallback}；按${basis}${traditional ? "觸發口徑執行。" : "触发口径执行。"}`;
}

export function buildStrategyAdvice(
  snapshot: EvidenceSnapshot,
  assessment: EntryAssessment,
  language: string = "zh-CN"
): StrategyAdvice {
  const normalizedLanguage = normalizeLanguage(language);
  const hasBullishTrend = snapshot.items.some((item) =>
    item.timeframe === "daily" && item.family === "ema" && item.direction === "bullish" && item.state !== "holder_only"
  );
  const confirmedBearishStructure = snapshot.items.some((item) =>
    item.family === "classicalPattern" && item.direction === "bearish" && item.state === "confirmed"
  );

  const holderAction: HolderAction = snapshot.dailyPhase === "breakdown" && confirmedBearishStructure
    ? "exit"
    : snapshot.dailyPhase === "breakdown" || snapshot.weeklyRegime === "bearish"
      ? "reduce"
      : snapshot.dailyPhase === "extended" && hasBullishTrend
        ? "hold_protect"
        : "hold";
  const holder: StrategyAdvice["holder"] = {
    action: holderAction,
    text: HOLDER_TEXT[normalizedLanguage][holderAction],
  };

  const leftAction: StrategyAdvice["leftEntry"]["action"] = assessment.leftStatus === "triggered"
    ? "probe"
    : assessment.leftStatus === "watch" || assessment.leftStatus === "provisional"
      ? "wait"
      : "not_applicable";
  const leftEntry: StrategyAdvice["leftEntry"] = {
    action: leftAction,
    text: LEFT_TEXT[normalizedLanguage][assessment.leftStatus],
  };

  const rightAction: StrategyAdvice["rightAdd"]["action"] = assessment.rightStatus === "triggered"
    ? "add_on_retest"
    : assessment.rightStatus === "too_late"
      ? "avoid_chasing"
      : "wait_breakout";
  const rightAdd: StrategyAdvice["rightAdd"] = {
    action: rightAction,
    text: RIGHT_TEXT[normalizedLanguage][assessment.rightStatus],
  };

  const atr = latestAtr(snapshot);
  const structuralStop = assessment.riskPlan.stop;
  const atrStop = atr ? Number((snapshot.price - atr * 3.2).toFixed(2)) : undefined;
  const trigger: StrategyAdvice["exitStop"]["trigger"] = snapshot.dailyPhase === "breakdown" ? "intraday" : "close";
  const exitStop: StrategyAdvice["exitStop"] = {
    structuralStop,
    atrStop,
    trigger,
    text: exitStopText(normalizedLanguage, structuralStop, atrStop, trigger),
  };

  return { holder, leftEntry, rightAdd, exitStop };
}
