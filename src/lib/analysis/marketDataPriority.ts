export type AnalysisMarketDataProvider =
  | "yahoo"
  | "yahoo-chart"
  | "kabutan"
  | "eastmoney"
  | "tonghuashun"
  | "optional-provider"
  | "tencent";

export type QuoteMarketDataProvider =
  | "kabutan"
  | "ashare-realtime"
  | "tonghuashun"
  | "eastmoney"
  | "yahoo"
  | "optional-provider"
  | "tencent";

export function isHongKongSymbol(symbol: string): boolean {
  return /^\d{1,5}\.HK$/i.test(symbol.trim());
}

export function getAnalysisMarketDataPriority(
  symbol: string,
  isAShare: boolean,
): AnalysisMarketDataProvider[] {
  if (isAShare) {
    return [
      "eastmoney",
      "tonghuashun",
      "yahoo",
      "yahoo-chart",
      "optional-provider",
      "tencent",
    ];
  }

  if (isHongKongSymbol(symbol)) {
    return [
      "yahoo",
      "yahoo-chart",
      "eastmoney",
      "tencent",
      "optional-provider",
      "tonghuashun",
    ];
  }

  return [
    "yahoo",
    "yahoo-chart",
    "kabutan",
    "eastmoney",
    "tonghuashun",
    "optional-provider",
    "tencent",
  ];
}

export function getQuoteMarketDataPriority(symbol: string): QuoteMarketDataProvider[] {
  if (isHongKongSymbol(symbol)) {
    return [
      "kabutan",
      "ashare-realtime",
      "eastmoney",
      "yahoo",
      "optional-provider",
      "tencent",
      "tonghuashun",
    ];
  }

  return [
    "kabutan",
    "ashare-realtime",
    "tonghuashun",
    "eastmoney",
    "yahoo",
    "optional-provider",
    "tencent",
  ];
}
