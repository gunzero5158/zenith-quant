import { describe, it, expect } from 'vitest';
import { analyzeWaveTheory } from '../waveTheory';
import { Candle } from '../indicators';

function makeCandles(closes: number[], options?: { highs?: number[]; lows?: number[] }): Candle[] {
  return closes.map((close, i) => {
    const high = options?.highs?.[i] ?? close + 0.1;
    const low = options?.lows?.[i] ?? close - 0.1;
    return {
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      open: i > 0 ? closes[i - 1] : close,
      high,
      low,
      close,
      volume: 1000
    };
  });
}

describe('waveTheory', () => {
  it('should return consolidation when candles length is less than 15', () => {
    const candles = makeCandles(Array(10).fill(10));
    const result = analyzeWaveTheory(candles);
    expect(result.currentWave).toContain('Consolidation');
    expect(result.wavePoints).toEqual([]);
    expect(result.waveScoreContribution).toBe(0);
  });

  it('should return consolidation if prices are monotonically increasing and no pivots are found', () => {
    // 30 candles, monotonically increasing (no swing pivots will be found)
    const closes = Array(30).fill(null).map((_, i) => 10 + i);
    const candles = makeCandles(closes);
    const result = analyzeWaveTheory(candles);
    expect(result.currentWave).toContain('Consolidation');
    expect(result.wavePoints).toEqual([]);
  });

  it('should return correct structure and valid waveScoreContribution range', () => {
    // 30 candles, simple uptrend
    const closes = Array(30).fill(null).map((_, i) => 10 + i);
    const candles = makeCandles(closes);
    const result = analyzeWaveTheory(candles);
    expect(result.currentWave).toBeDefined();
    expect(result.waveDescription).toBeDefined();
    expect(result.wavePoints).toBeDefined();
    expect(result.waveScoreContribution).toBeGreaterThanOrEqual(-0.2);
    expect(result.waveScoreContribution).toBeLessThanOrEqual(0.5);
  });

  it('should detect Wave 3 Impulse when Low-High-Low pattern is present and price rises above Wave 1 high', () => {
    // We need at least 15 candles.
    // Let's create:
    // candles 0 to 7: flat-ish (~10)
    // candle 8: Low0 at index 8 (low = 9)
    // candle 16: High1 at index 16 (high = 20)
    // candle 24: Low2 at index 24 (low = 15)
    // candle 32: current price = 25 (higher than High1 which was 20)
    // Pivot window is leftRight=7, so index i can be a pivot if it's the extreme in i-7 to i+7.
    // index 8 low is 9: in [1..15], closes are around 10 except index 8 is 9. So index 8 is a Low.
    // index 16 high is 20: in [9..23], closes are 9 to 15, index 16 is 20, then declines to 15. So index 16 is a High.
    // index 24 low is 15: in [17..31], index 24 is 15, surrounding are 20 (index 16) and rising to 22. So index 24 is a Low.
    // Let's build this data series:
    const closes = Array(40).fill(10);
    // index 0 to 7: 10
    closes[8] = 9;   // Low 0
    // index 9 to 15: rise to 18
    for (let i = 9; i <= 15; i++) closes[i] = 10 + (i - 8);
    closes[16] = 20;  // High 1
    // index 17 to 23: decline to 16
    for (let i = 17; i <= 23; i++) closes[i] = 20 - (i - 16) * 0.7;
    closes[24] = 15;  // Low 2
    // index 25 to 39: rise to 25 (above 20)
    for (let i = 25; i <= 39; i++) closes[i] = 15 + (i - 24);

    const highs = closes.map((c, i) => i === 16 ? 20.1 : c + 0.1);
    const lows = closes.map((c, i) => i === 8 ? 8.9 : (i === 24 ? 14.9 : c - 0.1));
    const candles = makeCandles(closes, { highs, lows });

    const result = analyzeWaveTheory(candles);
    expect(result.currentWave).toContain('主升浪');
    expect(result.waveScoreContribution).toBe(0.5);
  });
});
