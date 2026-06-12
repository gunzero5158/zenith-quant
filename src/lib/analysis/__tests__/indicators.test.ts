import { describe, it, expect } from 'vitest';
import {
  calculateEMA,
  calculateBOLL,
  calculateMACD,
  calculateKDJ,
  calculateRSI,
  calculateATR,
  Candle
} from '../indicators';

// Helper function to generate Candle[] from close prices
function makeCandles(closes: number[], options?: { volumes?: number[]; highs?: number[]; lows?: number[] }): Candle[] {
  return closes.map((close, i) => {
    const high = options?.highs?.[i] ?? close * 1.01;
    const low = options?.lows?.[i] ?? close * 0.99;
    const open = i > 0 ? closes[i - 1] : close;
    const volume = options?.volumes?.[i] ?? 1000;
    return {
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      open,
      high,
      low,
      close,
      volume
    };
  });
}

describe('indicators', () => {
  describe('calculateEMA', () => {
    it('should return empty array when candles is empty', () => {
      expect(calculateEMA([], 3)).toEqual([]);
    });

    it('should fill NaN for elements before period - 1', () => {
      const candles = makeCandles([10, 11, 12]);
      const ema = calculateEMA(candles, 3);
      expect(ema.length).toBe(3);
      expect(isNaN(ema[0])).toBe(true);
      expect(isNaN(ema[1])).toBe(true);
      expect(ema[2]).toBe(11); // SMA: (10 + 11 + 12) / 3 = 11
    });

    it('should correctly compute EMA using SMA as seed', () => {
      // For period 3, k = 2 / 4 = 0.5
      // candles close: 10, 12, 14, 16
      // i = 2: SMA = (10+12+14)/3 = 12
      // i = 3: EMA = 16 * 0.5 + 12 * 0.5 = 14
      const candles = makeCandles([10, 12, 14, 16]);
      const ema = calculateEMA(candles, 3);
      expect(ema).toEqual([NaN, NaN, 12, 14]);
    });
  });

  describe('calculateBOLL', () => {
    it('should return NaN for initial periods', () => {
      const candles = makeCandles([10, 10, 10]);
      const boll = calculateBOLL(candles, 3);
      expect(boll.middle.length).toBe(3);
      expect(isNaN(boll.middle[0])).toBe(true);
      expect(isNaN(boll.middle[1])).toBe(true);
      expect(boll.middle[2]).toBe(10);
      expect(boll.upper[2]).toBe(10);
      expect(boll.lower[2]).toBe(10);
    });

    it('should calculate BOLL middle, upper, lower bands correctly', () => {
      // Period 3, multiplier 2
      // Close: 10, 12, 14
      // SMA = (10+12+14)/3 = 12
      // Diff square: (10-12)^2 + (12-12)^2 + (14-12)^2 = 4 + 0 + 4 = 8
      // Variance = 8 / 3 = 2.66667
      // StdDev = sqrt(2.66667) = 1.63299
      // Upper = 12 + 2 * 1.63299 = 15.2660
      // Lower = 12 - 2 * 1.63299 = 8.7340
      const candles = makeCandles([10, 12, 14]);
      const boll = calculateBOLL(candles, 3, 2);
      expect(boll.middle[2]).toBe(12);
      expect(boll.upper[2]).toBeCloseTo(15.2660, 3);
      expect(boll.lower[2]).toBeCloseTo(8.7340, 3);
    });
  });

  describe('calculateMACD', () => {
    it('should return empty result for empty candles', () => {
      const macd = calculateMACD([]);
      expect(macd.dif).toEqual([]);
      expect(macd.dea).toEqual([]);
      expect(macd.hist).toEqual([]);
    });

    it('should return NaNs when candles length is shorter than slowPeriod', () => {
      const candles = makeCandles(Array(10).fill(10));
      const macd = calculateMACD(candles, 12, 26, 9);
      expect(macd.dif.every(v => isNaN(v))).toBe(true);
      expect(macd.dea.every(v => isNaN(v))).toBe(true);
      expect(macd.hist.every(v => isNaN(v))).toBe(true);
    });

    it('should calculate MACD for longer series', () => {
      // Fast=3, Slow=5, Signal=3
      // Need at least 5 candles for SMA(Slow) seed
      // Closes: 10, 11, 12, 13, 14, 15, 16, 17, 18, 19
      const candles = makeCandles([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
      const macd = calculateMACD(candles, 3, 5, 3);
      expect(macd.dif.length).toBe(10);
      expect(macd.dea.length).toBe(10);
      expect(macd.hist.length).toBe(10);
      
      // Fast EMA starts at index 2 (SMA 10,11,12 = 11)
      // Slow EMA starts at index 4 (SMA 10,11,12,13,14 = 12)
      // DIF = Fast - Slow
      // For i=4, fast EMA:
      // i=2: 11
      // i=3: 13 * 0.5 + 11 * 0.5 = 12
      // i=4: 14 * 0.5 + 12 * 0.5 = 13
      // slow EMA:
      // i=4: 12
      // So DIF[4] = 13 - 12 = 1.0000
      expect(macd.dif[4]).toBeCloseTo(1, 3);
    });
  });

  describe('calculateKDJ', () => {
    it('should return RSV=50 when high equals low', () => {
      const candles = makeCandles([10, 10, 10], {
        highs: [10, 10, 10],
        lows: [10, 10, 10]
      });
      const kdj = calculateKDJ(candles, 3, 3, 3);
      expect(kdj.k[2]).toBeCloseTo(50, 2);
      expect(kdj.d[2]).toBeCloseTo(50, 2);
      expect(kdj.j[2]).toBeCloseTo(50, 2);
    });

    it('should calculate KDJ values correctly', () => {
      // Period n=3, m1=3, m2=3
      // Closes: 10, 12, 14
      // Highs: 11, 13, 15
      // Lows: 9, 11, 13
      // For i=2:
      // Highs over 3 periods: [11, 13, 15] -> max high = 15
      // Lows over 3 periods: [9, 11, 13] -> min low = 9
      // close[2] = 14
      // RSV = (14 - 9) / (15 - 9) * 100 = 5/6 * 100 = 83.3333
      // lastK = 50, lastD = 50
      // K = 1/3 * 83.3333 + 2/3 * 50 = 27.7778 + 33.3333 = 61.1111
      // D = 1/3 * 61.1111 + 2/3 * 50 = 20.3704 + 33.3333 = 53.7037
      // J = 3 * K - 2 * D = 183.3333 - 107.4074 = 75.9259
      const candles = makeCandles([10, 12, 14], {
        highs: [11, 13, 15],
        lows: [9, 11, 13]
      });
      const kdj = calculateKDJ(candles, 3, 3, 3);
      expect(kdj.k[2]).toBeCloseTo(61.1111, 3);
      expect(kdj.d[2]).toBeCloseTo(53.7037, 3);
      expect(kdj.j[2]).toBeCloseTo(75.9259, 3);
    });
  });

  describe('calculateRSI', () => {
    it('should return all NaNs if candles length is less than 2', () => {
      const candles = makeCandles([10]);
      const rsi = calculateRSI(candles, 3);
      expect(rsi.every(v => isNaN(v))).toBe(true);
    });

    it('should handle avgLoss=0 and approach 100 for monotonically increasing prices', () => {
      const candles = makeCandles([10, 11, 12, 13, 14, 15]);
      const rsi = calculateRSI(candles, 3);
      expect(rsi[3]).toBe(99.0099);
      expect(rsi[4]).toBe(99.0099);
      expect(rsi[5]).toBe(99.0099);
    });

    it('should approach 0 for monotonically decreasing prices', () => {
      const candles = makeCandles([15, 14, 13, 12, 11, 10]);
      const rsi = calculateRSI(candles, 3);
      expect(rsi[3]).toBe(0);
      expect(rsi[4]).toBe(0);
      expect(rsi[5]).toBe(0);
    });
  });

  describe('calculateATR', () => {
    it('should return ATR when no gaps are present', () => {
      // TR = high - low
      // Closes: 10, 10, 10
      // Highs: 12, 12, 12
      // Lows: 9, 9, 9
      // TRs: [3, 3, 3]
      // ATR(3) at index 2: (3+3+3)/3 = 3
      const candles = makeCandles([10, 10, 10], {
        highs: [12, 12, 12],
        lows: [9, 9, 9]
      });
      const atr = calculateATR(candles, 3);
      expect(atr[2]).toBe(3);
    });
  });
});
