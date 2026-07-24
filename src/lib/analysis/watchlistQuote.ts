export interface WatchQuote {
  price: number;
  change: number;
  isMock?: boolean;
}

interface AnalysisQuoteSnapshot {
  symbol: string;
  price: number;
  changePercent: number;
  isMock?: boolean;
}

export function mergeAnalysisQuoteIntoWatchlist(
  previous: Record<string, WatchQuote>,
  analysis: AnalysisQuoteSnapshot,
): Record<string, WatchQuote> {
  const quote: WatchQuote = {
    price: analysis.price,
    change: analysis.changePercent,
    ...(analysis.isMock ? { isMock: true } : {}),
  };

  return {
    ...previous,
    [analysis.symbol]: quote,
  };
}
