import type { ExecutionBar, ExecutionPolicy } from "./tradeExecution";

export interface CostAssumptions {
  roundTripCostBps: number;
  slippageBpsPerSide: number;
}
export const DEFAULT_COSTS: CostAssumptions = { roundTripCostBps: 20, slippageBpsPerSide: 5 };

/** Independent, fully funded cash positions, not account/portfolio simulation.
 * CN funds also use a conservative next-day resale assumption: we do not infer
 * T+0 eligibility from a six-digit fund code. Fee values are user assumptions.
 */
export function executionPolicyFor(symbol: string, costs: CostAssumptions = DEFAULT_COSTS): ExecutionPolicy {
  const clean = symbol.toUpperCase();
  const cn = /^\d{6}\.(SS|SZ|BJ)$/.test(clean);
  const supported = cn || /^\d{4,5}\.HK$/.test(clean) || /^\d{3}[0-9A-Z]\.T$/.test(clean)
    || /^[A-Z][A-Z0-9.-]{0,12}$/.test(clean) && !clean.includes("^") && !/\.(L|TO|AX|DE|F|PA)$/.test(clean);
  return {
    version: "daily-cash-simulation-1", ...costs, minimumHoldBars: cn ? 1 : 0,
    marketConstraintsVerified: supported,
    assumptions: ["independent_fully_funded_position", "daily_bar_fill_approximation",
      "no_account_or_portfolio_model", ...(cn ? ["next_day_resale_including_funds"] : [])],
  };
}

/** A nonzero daily range and volume support a fill assumption, not fill proof.
 * Flat/zero-volume bars may represent suspension or a locked price limit.
 * Keep explicit provider restrictions when available.
 */
export function withDailyTradability<T extends ExecutionBar & { volume?: number }>(bar: T): T {
  return { ...bar, tradable: bar.tradable ?? (Number.isFinite(bar.volume) && bar.volume! > 0 && bar.high > bar.low) };
}
