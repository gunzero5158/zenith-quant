import { describe, expect, it } from 'vitest';
import { formatMarketPrice, getMarketCurrencySymbol, normalizeManualSymbolInput, replaceDollarPriceSymbols } from '../market';

describe('market currency helpers', () => {
  it('should map common market symbols to their currency symbol', () => {
    expect(getMarketCurrencySymbol('AAPL')).toBe('$');
    expect(getMarketCurrencySymbol('0700.HK')).toBe('HK$');
    expect(getMarketCurrencySymbol('600519.SS')).toBe('¥');
    expect(getMarketCurrencySymbol('603799')).toBe('¥');
    expect(getMarketCurrencySymbol('9984.T')).toBe('¥');
    expect(getMarketCurrencySymbol('285A')).toBe('¥');
  });

  it('should format prices with market-specific currency', () => {
    expect(formatMarketPrice('603799', 51.71)).toBe('¥51.71');
    expect(formatMarketPrice('0700.HK', 385)).toBe('HK$385.00');
  });

  it('should replace dollar-prefixed prices without touching non-price text', () => {
    expect(replaceDollarPriceSymbols('EMA20 $51.70, ticker AAPL', '¥')).toBe('EMA20 ¥51.70, ticker AAPL');
    expect(replaceDollarPriceSymbols('EMA20 $51.70', '$')).toBe('EMA20 $51.70');
    expect(replaceDollarPriceSymbols('POC HK$51.70 and support $48.20', 'HK$')).toBe('POC HK$51.70 and support HK$48.20');
  });
  it('should normalize manually typed ticker codes before analysis', () => {
    expect(normalizeManualSymbolInput('700')).toBe('0700.HK');
    expect(normalizeManualSymbolInput('0700.HK')).toBe('0700.HK');
    expect(normalizeManualSymbolInput('02476')).toBe('02476.HK');
    expect(normalizeManualSymbolInput('02476.HK')).toBe('02476.HK');
    expect(normalizeManualSymbolInput('600519')).toBe('600519.SS');
    expect(normalizeManualSymbolInput('000001')).toBe('000001.SZ');
    expect(normalizeManualSymbolInput('285A')).toBe('285A.T');
    expect(normalizeManualSymbolInput('AAPL')).toBe('AAPL');
  });
});
