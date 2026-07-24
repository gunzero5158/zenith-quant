import { AShareRealtimeQuote } from "@/lib/analysis/ashareRealtime";

export interface AnalysisQuoteSnapshot {
  symbol: string;
  price: number;
  change: number;
}

export function parseAnalysisQuoteSnapshot(
  value: unknown,
  expectedSymbol: string,
): AnalysisQuoteSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  const symbol = typeof candidate.symbol === "string" ? candidate.symbol.trim().toUpperCase() : "";
  const price = candidate.price;
  const change = candidate.change;

  if (
    symbol !== expectedSymbol.trim().toUpperCase()
    || typeof price !== "number"
    || !Number.isFinite(price)
    || price <= 0
    || typeof change !== "number"
    || !Number.isFinite(change)
    || Math.abs(change) > 100
  ) {
    return null;
  }

  return { symbol, price, change };
}

export function applyAnalysisQuoteSnapshot(
  realtimeQuote: AShareRealtimeQuote | null,
  snapshot: AnalysisQuoteSnapshot | null,
  currentDate: string,
): AShareRealtimeQuote | null {
  if (!snapshot) return realtimeQuote;

  return {
    ...(realtimeQuote ?? { source: "quote-api" as const, date: currentDate }),
    price: snapshot.price,
    changePercent: snapshot.change,
  };
}

export function getShanghaiDateKey(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
