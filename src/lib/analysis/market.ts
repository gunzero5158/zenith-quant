export function getMarketCurrencySymbol(symbol: string): string {
  const clean = symbol.trim().toUpperCase();

  if (clean.endsWith(".HK") || (/^\d{4,5}$/.test(clean) && !clean.includes("."))) {
    return "HK$";
  }

  if (clean.endsWith(".T") || /^\d{3}[A-Z]$/.test(clean)) {
    return "\u00A5";
  }

  if (
    clean.endsWith(".SS") ||
    clean.endsWith(".SH") ||
    clean.endsWith(".SZ") ||
    /^\d{6}$/.test(clean)
  ) {
    return "\u00A5";
  }

  return "$";
}

export function formatMarketPrice(symbol: string, price: number): string {
  const currency = getMarketCurrencySymbol(symbol);
  return `${currency}${price.toFixed(2)}`;
}

export function replaceDollarPriceSymbols(text: string, currencySymbol: string): string {
  if (currencySymbol === "$") return text;
  return text.replace(/(^|[^A-Za-z])\$(?=\d)/g, (_match, prefix: string) => `${prefix}${currencySymbol}`);
}
