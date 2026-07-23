import { EvidenceSnapshot } from "./evidence";
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

function latestAtr(snapshot: EvidenceSnapshot): number | undefined {
  const value = snapshot.items.find((item) => item.timeframe === "daily" && item.family === "atr")?.values?.value;
  return typeof value === "number" && value > 0 ? value : undefined;
}

export function buildStrategyAdvice(snapshot: EvidenceSnapshot, assessment: EntryAssessment): StrategyAdvice {
  const hasBullishTrend = snapshot.items.some((item) =>
    item.timeframe === "daily" && item.family === "ema" && item.direction === "bullish" && item.state !== "holder_only"
  );
  const confirmedBearishStructure = snapshot.items.some((item) =>
    item.family === "classicalPattern" && item.direction === "bearish" && item.state === "confirmed"
  );

  let holder: StrategyAdvice["holder"];
  if (snapshot.dailyPhase === "breakdown" && confirmedBearishStructure) {
    holder = { action: "exit", text: "日线破位且空头结构已确认，持仓应执行退出。" };
  } else if (snapshot.dailyPhase === "breakdown" || snapshot.weeklyRegime === "bearish") {
    holder = { action: "reduce", text: "趋势完整性转弱，持仓应降低仓位并收紧保护位。" };
  } else if (snapshot.dailyPhase === "extended" && hasBullishTrend) {
    holder = { action: "hold_protect", text: "趋势仍完整但价格过热，已有仓位可持有并上移保护位。" };
  } else {
    holder = { action: "hold", text: "趋势尚未触发结构失效，已有仓位可按计划持有。" };
  }

  const leftEntry: StrategyAdvice["leftEntry"] = assessment.leftStatus === "triggered"
    ? { action: "probe", text: "左侧条件已触发，可用试探仓验证，失效即退出。" }
    : assessment.leftStatus === "watch"
      ? { action: "wait", text: "左侧仅处于观察阶段，等待位置与短期确认同时成立。" }
      : { action: "not_applicable", text: "当前不适用左侧开仓，不以超卖或强势状态替代触发条件。" };

  const rightAdd: StrategyAdvice["rightAdd"] = assessment.rightStatus === "triggered"
    ? { action: "add_on_retest", text: "右侧突破已确认，优先等待回踩承接后再加仓。" }
    : assessment.rightStatus === "too_late"
      ? { action: "avoid_chasing", text: "价格已进入过热区，右侧策略避免追涨。" }
      : { action: "wait_breakout", text: "右侧条件未完整确认，等待关键位突破与量价确认。" };

  const atr = latestAtr(snapshot);
  const structuralStop = assessment.riskPlan.stop;
  const atrStop = atr ? Number((snapshot.price - atr * 3.2).toFixed(2)) : undefined;
  const trigger: StrategyAdvice["exitStop"]["trigger"] = snapshot.dailyPhase === "breakdown" ? "intraday" : "close";
  const stopParts = [
    structuralStop !== undefined ? `结构止损 ${structuralStop.toFixed(2)}` : undefined,
    atrStop !== undefined ? `ATR止损 ${atrStop.toFixed(2)}` : undefined,
  ].filter(Boolean);
  const exitStop: StrategyAdvice["exitStop"] = {
    structuralStop,
    atrStop,
    trigger,
    text: `${stopParts.join("，") || "当前缺少可执行止损位"}；按${trigger === "close" ? "收盘" : "盘中"}触发口径执行。`,
  };

  return { holder, leftEntry, rightAdd, exitStop };
}
