import type { CandidateTradePlan } from "../analysis/opportunities";

export interface ExecutionPolicy {
  /** Explicit simulation assumptions, not a claim about a broker's fills. */
  version: string;
  roundTripCostBps: number;
  slippageBpsPerSide: number;
  minimumHoldBars: number;
  marketConstraintsVerified: boolean;
  assumptions?: string[];
}

export interface ExecutionBar {
  date: unknown;
  open?: number;
  high: number;
  low: number;
  close: number;
  complete?: boolean;
  tradable?: boolean;
}

export interface ExecutionOutcome {
  status: "not_triggered" | "unverifiable" | "skipped" | "open" | "target" | "stop" | "timeout" | "ambiguous";
  reason?: string;
  entryPrice?: number;
  exitPrice?: number;
  barsHeld?: number;
  netReturnPct?: number;
  netR?: number;
  favorableExcursionPct?: number;
  adverseExcursionPct?: number;
  conservativeExitPrice?: number;
  conservativeNetR?: number;
  policy?: ExecutionPolicy;
}

const positive = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;

/** A close-confirmed decision can first fill at the next daily open. No lookahead
 * fills, no assumed ordering of a daily bar's high/low, and no moving old stops.
 */
export function evaluateTrade(
  plan: CandidateTradePlan | undefined, triggered: boolean, dailyBarComplete: boolean | undefined,
  bars: ExecutionBar[], policy: ExecutionPolicy | undefined,
): ExecutionOutcome {
  if (!triggered) return { status: "not_triggered" };
  if (!plan || dailyBarComplete !== true || !policy?.marketConstraintsVerified) {
    return { status: "unverifiable", reason: "Missing closed-bar plan or verified market execution assumptions." };
  }
  if (!positive(plan.stop) || !positive(plan.target) || !Number.isFinite(policy.roundTripCostBps)
    || policy.roundTripCostBps < 0 || !Number.isFinite(policy.slippageBpsPerSide) || policy.slippageBpsPerSide < 0
    || !Number.isInteger(policy.minimumHoldBars) || policy.minimumHoldBars < 0) {
    return { status: "unverifiable", reason: "Invalid plan or execution policy." };
  }
  const available: ExecutionBar[] = [];
  for (const bar of bars.slice(0, plan.horizon)) {
    if (bar.complete !== true) break;
    if (!positive(bar.open) || !positive(bar.high) || !positive(bar.low) || !positive(bar.close)
      || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) {
      return { status: "unverifiable", reason: "Missing or inconsistent OHLC data." };
    }
    available.push(bar);
  }
  if (!available.length) return { status: "open", reason: "Awaiting the next completed trading bar." };
  const first = available[0];
  if (first.tradable !== true) return { status: "unverifiable", reason: "Entry tradability is not established." };
  const slip = policy.slippageBpsPerSide / 10000;
  const entry = first.open! * (1 + slip);
  const risk = entry - plan.stop;
  if (risk < plan.minimumStopDistance || entry > plan.maxEntry || entry >= plan.target
    || (plan.target - entry) / risk < 1.2) {
    return { status: "skipped", entryPrice: entry, reason: "Next-open gap/slippage invalidated the original entry plan.", policy };
  }
  const result: ExecutionOutcome = { status: "open", entryPrice: entry, policy };
  let highest = entry;
  let lowest = entry;
  let closeStopPending = false;
  const finish = (status: ExecutionOutcome["status"], rawExit: number, index: number): ExecutionOutcome => {
    const exit = rawExit * (1 - slip);
    const pnl = exit - entry - entry * policy.roundTripCostBps / 10000;
    return { ...result, status, exitPrice: exit, barsHeld: index + 1,
      netReturnPct: pnl / entry * 100, netR: pnl / risk,
      favorableExcursionPct: (highest / entry - 1) * 100,
      adverseExcursionPct: (lowest / entry - 1) * 100 };
  };
  for (const [index, bar] of available.entries()) {
    if (bar.tradable !== true) return { ...result, status: "unverifiable", reason: "Suspension or execution constraints cannot be reconstructed." };
    const canExit = index >= policy.minimumHoldBars;
    if (canExit && closeStopPending) return finish("stop", bar.open!, index);
    if (canExit && plan.stopTrigger === "intraday" && bar.open! <= plan.stop) return finish("stop", bar.open!, index);
    if (canExit && bar.open! >= plan.target) return finish("target", bar.open!, index);
    const stopped = plan.stopTrigger === "intraday" && bar.low <= plan.stop;
    const targeted = bar.high >= plan.target;
    if (canExit && stopped && targeted) {
      const conservative = finish("stop", plan.stop, index);
      return { ...result, status: "ambiguous", barsHeld: index + 1,
        conservativeExitPrice: conservative.exitPrice, conservativeNetR: conservative.netR,
        reason: "Daily bar touched both stop and target; ordering is unknown." };
    }
    // Do not claim a full exit-day excursion after an intraday exit: ordering is unknown.
    if (canExit && stopped) return finish("stop", plan.stop, index);
    if (canExit && targeted) return finish("target", plan.target, index);
    highest = Math.max(highest, bar.high);
    lowest = Math.min(lowest, bar.low);
    if ((plan.stopTrigger === "close" && bar.close <= plan.stop)
      || (plan.stopTrigger === "intraday" && !canExit && bar.low <= plan.stop)) closeStopPending = true;
    if (index + 1 === plan.horizon) {
      // Horizon-close exit is scheduled at decision time; unlike a newly observed close-stop signal.
      if (!canExit) return { ...result, status: "unverifiable", reason: "Holding restriction extends beyond the plan horizon." };
      return finish("timeout", bar.close, index);
    }
  }
  return { ...result, barsHeld: available.length, favorableExcursionPct: (highest / entry - 1) * 100,
    adverseExcursionPct: (lowest / entry - 1) * 100,
    reason: closeStopPending ? "Close-stop signaled; awaiting the next executable open." : undefined };
}
