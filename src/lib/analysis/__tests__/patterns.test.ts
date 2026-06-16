import { describe, it, expect } from 'vitest';
import {
  calculateTDSequential,
  detectDivergence,
  calculateFibonacci,
  detectPatterns
} from '../patterns';
import { calculateSupportResistance } from '../supportResistance';
import { Candle } from '../indicators';

function makeCandles(closes: number[], options?: { highs?: number[]; lows?: number[]; volumes?: number[] }): Candle[] {
  return closes.map((close, i) => {
    const high = options?.highs?.[i] ?? close + 1;
    const low = options?.lows?.[i] ?? close - 1;
    return {
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      open: i > 0 ? closes[i - 1] : close,
      high,
      low,
      close,
      volume: options?.volumes?.[i] ?? 1000
    };
  });
}

describe('patterns and supportResistance', () => {
  describe('TD Sequential', () => {
    it('should return all zeros and None signal if candles count < 5', () => {
      const candles = makeCandles([10, 11, 12, 13]);
      const res = calculateTDSequential(candles);
      expect(res.counts).toEqual([0, 0, 0, 0]);
      expect(res.latestSignal).toBe('None');
    });

    it('should trigger Sell Setup 9 on 9 consecutive up-closes (close > close[i-4])', () => {
      // Need 4 candles as base, then 9 more, total 13
      const closes = [10, 10, 10, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      const candles = makeCandles(closes);
      const res = calculateTDSequential(candles);
      expect(res.counts[12]).toBe(9);
      expect(res.latestSignal).toBe('Sell Setup 9');
    });

    it('should trigger Buy Setup 9 on 9 consecutive down-closes (close < close[i-4])', () => {
      const closes = [20, 20, 20, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11];
      const candles = makeCandles(closes);
      const res = calculateTDSequential(candles);
      expect(res.counts[12]).toBe(-9);
      expect(res.latestSignal).toBe('Buy Setup 9');
    });

    it('should reset counts on equal close', () => {
      // close[i] === close[i-4]
      const closes = [10, 10, 10, 10, 11, 12, 13, 14, 11]; // index 8 close (11) is equal to index 4 close (11)
      const candles = makeCandles(closes);
      const res = calculateTDSequential(candles);
      expect(res.counts[8]).toBe(0);
    });
  });

  describe('detectDivergence', () => {
    it('should return none if length is less than lookback', () => {
      const candles = makeCandles([10, 11, 12]);
      const res = detectDivergence(candles, [1, 2, 3], 30);
      expect(res).toBe('none');
    });
  });

  describe('calculateFibonacci', () => {
    it('should calculate 7 levels for uptrend', () => {
      // Low index first, then high index
      // recent 120 days. Let's make 10 candles.
      // low=10 at index 2, high=20 at index 7. Diff = 10.
      const closes = [15, 14, 10, 12, 15, 18, 19, 20, 18, 17];
      const candles = makeCandles(closes, {
        highs: closes.map((c, i) => i === 7 ? 20.5 : c + 0.1),
        lows: closes.map((c, i) => i === 2 ? 9.5 : c - 0.1)
      });
      // high = 20.5 (idx 7), low = 9.5 (idx 2).
      // Since highIdx (7) > lowIdx (2), it is an uptrend.
      // levels:
      // 0%: 9.5 + 11 * 0 = 9.5
      // 100%: 9.5 + 11 * 1 = 20.5
      const fibs = calculateFibonacci(candles);
      expect(fibs.length).toBe(7);
      expect(fibs.find(f => f.label === '0.0%')?.price).toBeCloseTo(9.5, 1);
      expect(fibs.find(f => f.label === '100.0%')?.price).toBeCloseTo(20.5, 1);
    });

    it('should calculate 7 levels for downtrend', () => {
      // High index first, then low index
      // high=20 at index 2, low=10 at index 7.
      const closes = [15, 16, 20, 18, 15, 13, 11, 10, 12, 13];
      const candles = makeCandles(closes, {
        highs: closes.map((c, i) => i === 2 ? 20.5 : c + 0.1),
        lows: closes.map((c, i) => i === 7 ? 9.5 : c - 0.1)
      });
      const fibs = calculateFibonacci(candles);
      expect(fibs.length).toBe(7);
      expect(fibs.find(f => f.label === '0.0%')?.price).toBeCloseTo(20.5, 1);
      expect(fibs.find(f => f.label === '100.0%')?.price).toBeCloseTo(9.5, 1);
    });
  });

  describe('detectPatterns', () => {
    it('should return all false if candles length is too short to find enough pivots', () => {
      const candles = makeCandles(Array(10).fill(10));
      const res = detectPatterns(candles);
      expect(res.isDoubleBottom).toBe(false);
      expect(res.isHeadAndShoulders).toBe(false);
      expect(res.isCupAndHandle).toBe(false);
      expect(res.isRoundingTop).toBe(false);
    });
  });

  describe('calculateSupportResistance', () => {
    it('should fallback to currentPrice when ema/boll values are NaN', () => {
      const candles = makeCandles([10, 10, 10]);
      const res = calculateSupportResistance(candles, 10, NaN, NaN, NaN, NaN);
      expect(res.dynamicSupportEMA20).toBe(10);
      expect(res.dynamicSupportEMA60).toBe(10);
      expect(res.dynamicBOLLUpper).toBe(10);
      expect(res.dynamicBOLLLower).toBe(10);
    });

    it('should compute horizontal supports and resistances with sufficient data', () => {
      // Let's create a series of 30 candles with clear highs and lows
      // Pivot window leftRight=5, meaning index must be between 5 and len-6.
      // Let's make:
      // index 7: high of 15 (highs: i=7 is peak)
      // index 15: low of 5 (lows: i=15 is trough)
      const closes = Array(25).fill(10);
      closes[7] = 15;
      closes[15] = 5;

      const highs = closes.map((c, idx) => idx === 7 ? 16 : c + 0.5);
      const lows = closes.map((c, idx) => idx === 15 ? 4 : c - 0.5);
      const candles = makeCandles(closes, { highs, lows });

      const res = calculateSupportResistance(candles, 10, 10.5, 9.8, 12.1, 7.9);
      expect(res.volumePOC).toBeDefined();
      expect(res.horizontalSupports).toBeDefined();
      expect(res.horizontalResistances).toBeDefined();
    });
  });
});
