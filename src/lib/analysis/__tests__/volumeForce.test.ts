import { describe, it, expect } from 'vitest';
import { calculateOBV, calculateCMF, analyzePriceVolume } from '@/lib/analysis/volumeForce';
import type { Candle } from '@/lib/analysis/indicators';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a single candle with sensible defaults.
 * Only the fields relevant to the test need to be specified.
 */
function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    date: overrides.date ?? '2024-01-01',
    open: overrides.open ?? 100,
    high: overrides.high ?? 105,
    low: overrides.low ?? 95,
    close: overrides.close ?? 100,
    volume: overrides.volume ?? 1000,
  };
}

/**
 * Generate an array of candles with linearly changing close prices.
 * Useful for constructing trends.
 *
 * @param count  Number of candles to generate
 * @param opts   Configuration for the generated series
 */
function generateCandles(
  count: number,
  opts: {
    startClose?: number;
    closeStep?: number;
    volume?: number | ((i: number) => number);
    highSpread?: number;
    lowSpread?: number;
  } = {},
): Candle[] {
  const {
    startClose = 100,
    closeStep = 0,
    volume = 1000,
    highSpread = 5,
    lowSpread = 5,
  } = opts;

  return Array.from({ length: count }, (_, i) => {
    const close = startClose + closeStep * i;
    const vol = typeof volume === 'function' ? volume(i) : volume;
    return makeCandle({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: close - closeStep * 0.5,
      high: close + highSpread,
      low: close - lowSpread,
      close,
      volume: vol,
    });
  });
}

// ===========================================================================
// calculateOBV
// ===========================================================================
describe('calculateOBV', () => {
  it('returns empty array for empty input', () => {
    expect(calculateOBV([])).toEqual([]);
  });

  it('returns [0] for a single candle', () => {
    const result = calculateOBV([makeCandle()]);
    expect(result).toEqual([0]);
  });

  it('adds volume on up-close', () => {
    const candles: Candle[] = [
      makeCandle({ close: 100, volume: 500 }),
      makeCandle({ close: 110, volume: 300 }),
    ];
    const obv = calculateOBV(candles);
    expect(obv).toEqual([0, 300]);
  });

  it('subtracts volume on down-close', () => {
    const candles: Candle[] = [
      makeCandle({ close: 100, volume: 500 }),
      makeCandle({ close: 90, volume: 200 }),
    ];
    const obv = calculateOBV(candles);
    expect(obv).toEqual([0, -200]);
  });

  it('keeps OBV unchanged on equal close', () => {
    const candles: Candle[] = [
      makeCandle({ close: 100, volume: 500 }),
      makeCandle({ close: 100, volume: 700 }),
    ];
    const obv = calculateOBV(candles);
    expect(obv).toEqual([0, 0]);
  });

  it('handles mixed up/down/flat sequence correctly', () => {
    const candles: Candle[] = [
      makeCandle({ close: 100, volume: 1000 }),
      makeCandle({ close: 110, volume: 200 }),   // up  -> +200  => 200
      makeCandle({ close: 110, volume: 300 }),   // flat -> 0     => 200
      makeCandle({ close: 105, volume: 400 }),   // down -> -400  => -200
      makeCandle({ close: 120, volume: 500 }),   // up  -> +500   => 300
    ];
    const obv = calculateOBV(candles);
    expect(obv).toEqual([0, 200, 200, -200, 300]);
  });

  it('returns correct length equal to input length', () => {
    const candles = generateCandles(10, { closeStep: 1 });
    const obv = calculateOBV(candles);
    expect(obv).toHaveLength(10);
  });

  it('accumulates large volumes correctly', () => {
    const candles: Candle[] = [
      makeCandle({ close: 50, volume: 1_000_000 }),
      makeCandle({ close: 60, volume: 2_000_000 }),
      makeCandle({ close: 70, volume: 3_000_000 }),
    ];
    const obv = calculateOBV(candles);
    expect(obv).toEqual([0, 2_000_000, 5_000_000]);
  });
});

// ===========================================================================
// calculateCMF
// ===========================================================================
describe('calculateCMF', () => {
  it('returns empty array for empty input', () => {
    expect(calculateCMF([])).toEqual([]);
  });

  it('returns all NaN when candles.length < period', () => {
    const candles = generateCandles(3);
    const cmf = calculateCMF(candles, 5);
    expect(cmf).toHaveLength(3);
    cmf.forEach((v) => expect(v).toBeNaN());
  });

  it('produces NaN for first (period-1) elements and numbers after', () => {
    const candles = generateCandles(5, { closeStep: 1 });
    const cmf = calculateCMF(candles, 3);
    expect(cmf).toHaveLength(5);
    // First 2 (period-1 = 2) should be NaN
    expect(cmf[0]).toBeNaN();
    expect(cmf[1]).toBeNaN();
    // Rest should be finite numbers
    expect(Number.isFinite(cmf[2])).toBe(true);
    expect(Number.isFinite(cmf[3])).toBe(true);
    expect(Number.isFinite(cmf[4])).toBe(true);
  });

  it('returns multiplier=0 when high === low', () => {
    // All candles with high === low => multiplier = 0 => MFV = 0 => CMF = 0
    const candles: Candle[] = Array.from({ length: 3 }, (_, i) =>
      makeCandle({
        date: `2024-01-${i + 1}`,
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1000,
      }),
    );
    const cmf = calculateCMF(candles, 3);
    // First 2 NaN, index 2 should be 0 (MFV sum = 0, volume sum = 3000)
    expect(cmf[0]).toBeNaN();
    expect(cmf[1]).toBeNaN();
    expect(cmf[2]).toBe(0);
  });

  it('returns 0 when volumeSum is 0', () => {
    // All volumes are 0 => volumeSum = 0 => CMF returns 0
    const candles: Candle[] = Array.from({ length: 3 }, (_, i) =>
      makeCandle({
        date: `2024-01-${i + 1}`,
        volume: 0,
      }),
    );
    const cmf = calculateCMF(candles, 3);
    expect(cmf[2]).toBe(0);
  });

  it('calculates correct CMF for a known small dataset', () => {
    // Build 3 candles with known values, period=3
    // Candle 0: H=110, L=90, C=100, V=1000
    //   MF multiplier = ((100-90)-(110-100))/(110-90) = (10-10)/20 = 0
    //   MFV = 0
    // Candle 1: H=120, L=100, C=115, V=2000
    //   multiplier = ((115-100)-(120-115))/(120-100) = (15-5)/20 = 0.5
    //   MFV = 0.5*2000 = 1000
    // Candle 2: H=115, L=105, C=107, V=1500
    //   multiplier = ((107-105)-(115-107))/(115-105) = (2-8)/10 = -0.6
    //   MFV = -0.6*1500 = -900
    // CMF at index 2 = (0 + 1000 + (-900)) / (1000+2000+1500) = 100/4500 ≈ 0.0222
    const candles: Candle[] = [
      makeCandle({ high: 110, low: 90, close: 100, volume: 1000 }),
      makeCandle({ high: 120, low: 100, close: 115, volume: 2000 }),
      makeCandle({ high: 115, low: 105, close: 107, volume: 1500 }),
    ];
    const cmf = calculateCMF(candles, 3);
    expect(cmf[0]).toBeNaN();
    expect(cmf[1]).toBeNaN();
    // 100 / 4500 = 0.02222... → toFixed(4) → 0.0222
    expect(cmf[2]).toBeCloseTo(0.0222, 4);
  });

  it('uses default period of 21', () => {
    const candles = generateCandles(25, { closeStep: 0.5 });
    const cmf = calculateCMF(candles);
    expect(cmf).toHaveLength(25);
    // First 20 should be NaN (period-1 = 20)
    for (let i = 0; i < 20; i++) {
      expect(cmf[i]).toBeNaN();
    }
    // Index 20 onward should be finite
    for (let i = 20; i < 25; i++) {
      expect(Number.isFinite(cmf[i])).toBe(true);
    }
  });

  it('CMF is bounded between -1 and 1 for normal data', () => {
    const candles = generateCandles(30, { closeStep: 2 });
    const cmf = calculateCMF(candles, 5);
    cmf.forEach((v) => {
      if (!isNaN(v)) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });

  it('CMF equals 1 when close always equals high (max bullish)', () => {
    // close = high => multiplier = ((high-low) - 0) / (high-low) = 1
    const candles: Candle[] = Array.from({ length: 5 }, (_, i) =>
      makeCandle({
        date: `2024-01-${i + 1}`,
        high: 110,
        low: 100,
        close: 110,
        volume: 1000,
      }),
    );
    const cmf = calculateCMF(candles, 3);
    expect(cmf[2]).toBeCloseTo(1, 4);
    expect(cmf[3]).toBeCloseTo(1, 4);
    expect(cmf[4]).toBeCloseTo(1, 4);
  });

  it('CMF equals -1 when close always equals low (max bearish)', () => {
    // close = low => multiplier = (0 - (high-low)) / (high-low) = -1
    const candles: Candle[] = Array.from({ length: 5 }, (_, i) =>
      makeCandle({
        date: `2024-01-${i + 1}`,
        high: 110,
        low: 100,
        close: 100,
        volume: 1000,
      }),
    );
    const cmf = calculateCMF(candles, 3);
    expect(cmf[2]).toBeCloseTo(-1, 4);
    expect(cmf[3]).toBeCloseTo(-1, 4);
    expect(cmf[4]).toBeCloseTo(-1, 4);
  });
});

// ===========================================================================
// analyzePriceVolume
// ===========================================================================
describe('analyzePriceVolume', () => {
  // -----------------------------------------------------------------------
  // Insufficient data
  // -----------------------------------------------------------------------
  describe('insufficient data (<20 candles)', () => {
    it('returns default flags when length < 20', () => {
      const candles = generateCandles(10);
      const result = analyzePriceVolume(candles);

      expect(result.hasVolumeBreakout).toBe(false);
      expect(result.isVolumeExpanding).toBe(false);
      expect(result.hasPriceVolumeDivergence).toBe(false);
      expect(result.volumeDescription).toContain('数据样本不足');
    });

    it('still returns obv, cmf, volume20SMA arrays even if data is insufficient', () => {
      const candles = generateCandles(5);
      const result = analyzePriceVolume(candles);

      expect(result.obv).toHaveLength(5);
      expect(result.cmf).toHaveLength(5);
      expect(result.volume20SMA).toHaveLength(5);
    });

    it('returns defaults for exactly 19 candles', () => {
      const candles = generateCandles(19);
      const result = analyzePriceVolume(candles);
      expect(result.hasVolumeBreakout).toBe(false);
      expect(result.volumeDescription).toContain('数据样本不足');
    });
  });

  // -----------------------------------------------------------------------
  // Boundary: exactly 20 candles
  // -----------------------------------------------------------------------
  describe('boundary at exactly 20 candles', () => {
    it('does NOT return insufficient-data message for exactly 20 candles', () => {
      const candles = generateCandles(20);
      const result = analyzePriceVolume(candles);
      expect(result.volumeDescription).not.toContain('数据样本不足');
    });

    it('produces a valid volume20SMA at the last element', () => {
      const candles = generateCandles(20, { volume: 1000 });
      const result = analyzePriceVolume(candles);
      // All 20 volumes are 1000, so SMA = 1000
      expect(result.volume20SMA[19]).toBe(1000);
    });
  });

  // -----------------------------------------------------------------------
  // Volume breakout detection
  // -----------------------------------------------------------------------
  describe('hasVolumeBreakout', () => {
    it('detects breakout when last-day volume > 1.5x SMA and price change > 1.5%', () => {
      // 19 candles with moderate volume, then one huge volume + big price move
      const baseCandles = generateCandles(19, {
        startClose: 100,
        closeStep: 0,
        volume: 1000,
      });
      // Last candle: volume = 2000 (> 1000*1.5 = 1500), close jumps from 100 to 103 (3% change)
      const lastCandle = makeCandle({
        date: '2024-01-20',
        open: 100,
        high: 105,
        low: 99,
        close: 103,
        volume: 2000,
      });
      const candles = [...baseCandles, lastCandle];
      const result = analyzePriceVolume(candles);
      expect(result.hasVolumeBreakout).toBe(true);
    });

    it('does not detect breakout when volume is high but price change <= 1.5%', () => {
      const baseCandles = generateCandles(19, {
        startClose: 100,
        closeStep: 0,
        volume: 1000,
      });
      // Big volume but tiny price change (100 → 101 = 1%)
      const lastCandle = makeCandle({
        date: '2024-01-20',
        close: 101,
        volume: 5000,
      });
      const candles = [...baseCandles, lastCandle];
      const result = analyzePriceVolume(candles);
      expect(result.hasVolumeBreakout).toBe(false);
    });

    it('does not detect breakout when price change is large but volume <= 1.5x SMA', () => {
      const baseCandles = generateCandles(19, {
        startClose: 100,
        closeStep: 0,
        volume: 1000,
      });
      // Large price jump but same volume as average
      const lastCandle = makeCandle({
        date: '2024-01-20',
        close: 110,
        volume: 1000,
      });
      const candles = [...baseCandles, lastCandle];
      const result = analyzePriceVolume(candles);
      expect(result.hasVolumeBreakout).toBe(false);
    });

    it('detects breakout on big down-move too (negative price change)', () => {
      const baseCandles = generateCandles(19, {
        startClose: 100,
        closeStep: 0,
        volume: 1000,
      });
      // Crash: close drops from 100 → 95 = -5%, volume 3000 > 1500
      const lastCandle = makeCandle({
        date: '2024-01-20',
        close: 95,
        volume: 3000,
      });
      const candles = [...baseCandles, lastCandle];
      const result = analyzePriceVolume(candles);
      expect(result.hasVolumeBreakout).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Volume expanding
  // -----------------------------------------------------------------------
  describe('isVolumeExpanding', () => {
    it('detects volume expansion when recent 5 vol > prev 5 vol * 1.1', () => {
      // 20 candles: first 15 at volume 1000, last 5 at volume 2000
      // recent5 sum = 10000, prev5 sum = 5000, 10000 > 5000*1.1 = 5500 → true
      const candles = generateCandles(20, {
        volume: (i) => (i >= 15 ? 2000 : 1000),
      });
      const result = analyzePriceVolume(candles);
      expect(result.isVolumeExpanding).toBe(true);
    });

    it('does not detect expansion when volumes are stable', () => {
      const candles = generateCandles(20, { volume: 1000 });
      const result = analyzePriceVolume(candles);
      // recent5 = prev5 = 5000, 5000 > 5500 is false
      expect(result.isVolumeExpanding).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Price-volume divergence
  // -----------------------------------------------------------------------
  describe('hasPriceVolumeDivergence', () => {
    it('detects divergence when price rises but OBV falls over last 10 bars', () => {
      // Strategy: build 20 candles where the last 10 have rising close prices
      // but each up-close has small volume and each down-close has huge volume,
      // causing OBV to decline overall.
      //
      // We'll alternate: small up-days (+1) and big down-days (-0.5)
      // Net price trend is up, but OBV drops due to heavy volume on down-days.

      const candles: Candle[] = [];
      let close = 100;

      // First 10 candles: flat, just setup
      for (let i = 0; i < 10; i++) {
        candles.push(
          makeCandle({
            date: `2024-01-${String(i + 1).padStart(2, '0')}`,
            close,
            volume: 1000,
          }),
        );
      }

      // Next 10 candles: alternate up (tiny volume) and down (huge volume)
      // to create price-up but OBV-down scenario
      for (let i = 10; i < 20; i++) {
        const prevClose = close;
        if (i % 2 === 0) {
          // Up day: close rises +3, tiny volume
          close = prevClose + 3;
          candles.push(
            makeCandle({
              date: `2024-01-${String(i + 1).padStart(2, '0')}`,
              close,
              volume: 100,
            }),
          );
        } else {
          // Down day: close drops -1, huge volume
          close = prevClose - 1;
          candles.push(
            makeCandle({
              date: `2024-01-${String(i + 1).padStart(2, '0')}`,
              close,
              volume: 10000,
            }),
          );
        }
      }

      // Verify net price is up over the last 10 bars
      expect(candles[19].close).toBeGreaterThan(candles[9].close);

      const result = analyzePriceVolume(candles);

      // OBV should have declined over last 10 bars
      // because down-day volumes (10000) >> up-day volumes (100)
      expect(result.obv[19]).toBeLessThan(result.obv[9]);
      expect(result.hasPriceVolumeDivergence).toBe(true);
    });

    it('does not flag divergence when both price and OBV rise', () => {
      // Steadily rising close with consistent volume → OBV keeps climbing
      const candles = generateCandles(20, {
        startClose: 100,
        closeStep: 1,
        volume: 1000,
      });
      const result = analyzePriceVolume(candles);
      expect(result.hasPriceVolumeDivergence).toBe(false);
    });

    it('does not flag divergence when price falls even if OBV also falls', () => {
      // Declining prices → priceTrendUp is false
      const candles = generateCandles(20, {
        startClose: 200,
        closeStep: -1,
        volume: 1000,
      });
      const result = analyzePriceVolume(candles);
      expect(result.hasPriceVolumeDivergence).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Description content
  // -----------------------------------------------------------------------
  describe('volumeDescription', () => {
    it('mentions 放量突破 on up-breakout', () => {
      const baseCandles = generateCandles(19, {
        startClose: 100,
        closeStep: 0,
        volume: 1000,
      });
      const lastCandle = makeCandle({
        date: '2024-01-20',
        close: 103,
        volume: 3000,
      });
      const result = analyzePriceVolume([...baseCandles, lastCandle]);
      expect(result.volumeDescription).toContain('放量突破');
    });

    it('mentions 放量下跌 on down-breakout', () => {
      const baseCandles = generateCandles(19, {
        startClose: 100,
        closeStep: 0,
        volume: 1000,
      });
      const lastCandle = makeCandle({
        date: '2024-01-20',
        close: 95,
        volume: 3000,
      });
      const result = analyzePriceVolume([...baseCandles, lastCandle]);
      expect(result.volumeDescription).toContain('放量下跌');
    });

    it('mentions 量价背离 when divergence is detected', () => {
      // Reuse divergence setup
      const candles: Candle[] = [];
      let close = 100;
      for (let i = 0; i < 10; i++) {
        candles.push(makeCandle({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, close, volume: 1000 }));
      }
      for (let i = 10; i < 20; i++) {
        const prevClose = close;
        if (i % 2 === 0) {
          close = prevClose + 3;
          candles.push(makeCandle({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, close, volume: 100 }));
        } else {
          close = prevClose - 1;
          candles.push(makeCandle({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, close, volume: 10000 }));
        }
      }
      const result = analyzePriceVolume(candles);
      expect(result.volumeDescription).toContain('量价背离');
    });
  });

  // -----------------------------------------------------------------------
  // Output structure
  // -----------------------------------------------------------------------
  describe('output structure', () => {
    it('returns arrays of correct length for all series', () => {
      const candles = generateCandles(30);
      const result = analyzePriceVolume(candles);
      expect(result.obv).toHaveLength(30);
      expect(result.cmf).toHaveLength(30);
      expect(result.volume20SMA).toHaveLength(30);
    });

    it('volume20SMA has NaN for first 19 elements and numbers after', () => {
      const candles = generateCandles(25, { volume: 1000 });
      const result = analyzePriceVolume(candles);
      for (let i = 0; i < 19; i++) {
        expect(result.volume20SMA[i]).toBeNaN();
      }
      for (let i = 19; i < 25; i++) {
        expect(Number.isFinite(result.volume20SMA[i])).toBe(true);
      }
    });
  });
});
