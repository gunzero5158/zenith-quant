import { describe, it, expect } from 'vitest';
import {
  resolveInclusions,
  detectFenXing,
  generateStrokes,
  analyzeChanLun,
  MergedKLine,
  FenXing
} from '../chanlun';
import { Candle } from '../indicators';

function makeCandles(closes: number[], options?: { highs?: number[]; lows?: number[] }): Candle[] {
  return closes.map((close, i) => {
    const high = options?.highs?.[i] ?? close + 1;
    const low = options?.lows?.[i] ?? close - 1;
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

describe('chanlun', () => {
  describe('resolveInclusions', () => {
    it('should return empty array when candles is empty', () => {
      expect(resolveInclusions([])).toEqual([]);
    });

    it('should return same length and values if there are no inclusions', () => {
      // Monotonically increasing without inclusion
      const candles = makeCandles([10, 12, 14, 16], {
        highs: [11, 13, 15, 17],
        lows: [9, 11, 13, 15]
      });
      const merged = resolveInclusions(candles);
      expect(merged.length).toBe(4);
      expect(merged[0].high).toBe(11);
      expect(merged[1].high).toBe(13);
    });

    it('should merge UP when prev.high > prevPrev.high and there is inclusion', () => {
      // UP trend
      // Candle 0: H=11, L=9
      // Candle 1: H=13, L=11
      // Candle 2: H=12, L=11.5 (Inclusion: H2 <= H1, L2 >= L1)
      // Since H1 (13) > H0 (11), direction is UP.
      // Merge result: max high (13, 12) = 13, max low (11, 11.5) = 11.5
      const candles = makeCandles([10, 12, 12], {
        highs: [11, 13, 12],
        lows: [9, 11, 11.5]
      });
      const merged = resolveInclusions(candles);
      expect(merged.length).toBe(2); // 0 and (1 merged with 2)
      expect(merged[1].high).toBe(13);
      expect(merged[1].low).toBe(11.5);
    });

    it('should merge DOWN when prev.high <= prevPrev.high and there is inclusion', () => {
      // DOWN trend
      // Candle 0: H=20, L=18
      // Candle 1: H=18, L=16
      // Candle 2: H=19, L=17 (Inclusion: H2 >= H1, L2 <= L1 - wait, no: H2 (19) >= H1 (18), L2 (17) >= L1 (16), this is not inclusion.
      // For inclusion: current is inside prev (H2<=H1, L2>=L1) or prev inside current (H2>=H1, L2<=L1).
      // Let's do current inside prev: Candle 2: H=17.5, L=16.5
      // Direction: H1 (18) < H0 (20) -> DOWN.
      // Merge result: min high (18, 17.5) = 17.5, min low (16, 16.5) = 16
      const candles = makeCandles([19, 17, 17], {
        highs: [20, 18, 17.5],
        lows: [18, 16, 16.5]
      });
      const merged = resolveInclusions(candles);
      expect(merged.length).toBe(2);
      expect(merged[1].high).toBe(17.5);
      expect(merged[1].low).toBe(16);
    });
  });

  describe('detectFenXing', () => {
    it('should return empty array if merged K-lines length is less than 3', () => {
      const merged: MergedKLine[] = [
        { date: '1', open: 10, high: 11, low: 9, close: 10 },
        { date: '2', open: 11, high: 12, low: 10, close: 11 }
      ];
      expect(detectFenXing(merged)).toEqual([]);
    });

    it('should detect Ding Fen Xing', () => {
      // Ding: middle has highest high and highest low
      // i=0: H=10, L=8
      // i=1: H=15, L=12  <- Ding
      // i=2: H=11, L=9
      const merged: MergedKLine[] = [
        { date: '1', open: 9, high: 10, low: 8, close: 9 },
        { date: '2', open: 13, high: 15, low: 12, close: 13 },
        { date: '3', open: 10, high: 11, low: 9, close: 10 }
      ];
      const fx = detectFenXing(merged);
      expect(fx.length).toBe(1);
      expect(fx[0].type).toBe('ding');
      expect(fx[0].index).toBe(1);
      expect(fx[0].high).toBe(15);
      expect(fx[0].low).toBe(12);
    });

    it('should detect Di Fen Xing', () => {
      // Di: middle has lowest high and lowest low
      // i=0: H=15, L=12
      // i=1: H=10, L=8   <- Di
      // i=2: H=14, L=11
      const merged: MergedKLine[] = [
        { date: '1', open: 13, high: 15, low: 12, close: 13 },
        { date: '2', open: 9, high: 10, low: 8, close: 9 },
        { date: '3', open: 12, high: 14, low: 11, close: 12 }
      ];
      const fx = detectFenXing(merged);
      expect(fx.length).toBe(1);
      expect(fx[0].type).toBe('di');
      expect(fx[0].index).toBe(1);
      expect(fx[0].high).toBe(10);
      expect(fx[0].low).toBe(8);
    });
  });

  describe('generateStrokes', () => {
    it('should return empty if fenXingList length is less than 2', () => {
      const merged: MergedKLine[] = Array(10).fill({ date: '1', open: 10, high: 11, low: 9, close: 10 });
      expect(generateStrokes(merged, [])).toEqual([]);
      expect(generateStrokes(merged, [{ index: 1, type: 'ding', high: 15, low: 12, date: '1' }])).toEqual([]);
    });

    it('should create strokes when alternating pivots are at least distance >= 4', () => {
      // Di at index 1: low = 5
      // Ding at index 5: high = 15
      // Distance: 5 - 1 = 4. Meets requirement!
      const merged: MergedKLine[] = Array(10).fill(null).map((_, i) => ({
        date: String(i),
        open: 10,
        high: i === 5 ? 15 : 10,
        low: i === 1 ? 5 : 9,
        close: 10
      }));

      const fx: FenXing[] = [
        { index: 1, type: 'di', high: 7, low: 5, date: '1' },
        { index: 5, type: 'ding', high: 15, low: 13, date: '5' }
      ];

      const strokes = generateStrokes(merged, fx);
      expect(strokes.length).toBe(1);
      expect(strokes[0].type).toBe('up');
      expect(strokes[0].startIndex).toBe(1);
      expect(strokes[0].endIndex).toBe(5);
      expect(strokes[0].startPrice).toBe(5);
      expect(strokes[0].endPrice).toBe(15);
    });

    it('should not create stroke if distance < 4', () => {
      const merged: MergedKLine[] = Array(10).fill(null).map((_, i) => ({
        date: String(i),
        open: 10,
        high: i === 4 ? 15 : 10,
        low: i === 1 ? 5 : 9,
        close: 10
      }));

      const fx: FenXing[] = [
        { index: 1, type: 'di', high: 7, low: 5, date: '1' },
        { index: 4, type: 'ding', high: 15, low: 13, date: '4' } // distance = 3
      ];

      const strokes = generateStrokes(merged, fx);
      expect(strokes.length).toBe(0);
    });

    it('should update activePivot if distance < 4 but new pivot is more extreme', () => {
      // Di at index 1: low = 5
      // Ding at index 3: high = 12 (too close, no stroke)
      // Since it is a ding and next is a ding (wait, fx has alternating types, but since distance is short we update activePivot?)
      // Let's check:
      // if (distance >= 4) { ... } else {
      //   if (activePivot.type === 'ding' && nextPivot.high > activePivot.high) activePivot = nextPivot;
      //   else if (activePivot.type === 'di' && nextPivot.low < activePivot.low) activePivot = nextPivot;
      // }
      // activePivot is 'di' at index 1, low = 5.
      // nextPivot is 'ding' at index 3, high = 12. distance = 2 (< 4).
      // Since activePivot is 'di', it does not update activePivot (type is not 'ding', and low of 'ding' is not < low of 'di').
      // Let's create two Dings of different values to test same type update:
      // activePivot is 'ding' at index 1, high = 12.
      // nextPivot is 'ding' at index 3, high = 15.
      // Since they are the same type 'ding', we check: if (nextPivot.high > activePivot.high) activePivot = nextPivot.
      const merged: MergedKLine[] = Array(10).fill(null).map((_, i) => ({
        date: String(i),
        open: 10,
        high: i === 1 ? 12 : (i === 3 ? 15 : 10),
        low: 8,
        close: 10
      }));

      const fx: FenXing[] = [
        { index: 1, type: 'ding', high: 12, low: 10, date: '1' },
        { index: 3, type: 'ding', high: 15, low: 11, date: '3' },
        { index: 7, type: 'di', high: 6, low: 4, date: '7' } // distance from 3 to 7 is 4
      ];

      const strokes = generateStrokes(merged, fx);
      expect(strokes.length).toBe(1);
      expect(strokes[0].type).toBe('down');
      expect(strokes[0].startIndex).toBe(3); // Start index updated from 1 to 3 because 3 had a higher ding
      expect(strokes[0].endIndex).toBe(7);
      expect(strokes[0].startPrice).toBe(15);
      expect(strokes[0].endPrice).toBe(4);
    });
  });

  describe('analyzeChanLun', () => {
    it('should return default description when there are no strokes', () => {
      const candles = makeCandles([10, 10, 10, 10]);
      const result = analyzeChanLun(candles);
      expect(result.strokes.length).toBe(0);
      expect(result.chanlunDescription).toContain('暂未生成标准的');
    });

    it('should analyze strokes and mid central pivot when they exist', () => {
      // We need to construct a dataset with 3 alternating strokes of distance >= 4
      // Let's create:
      // Di at index 1 (Price ~ 10)
      // Ding at index 5 (Price ~ 20)  => Stroke 1: UP (10 -> 20)
      // Di at index 9 (Price ~ 12)    => Stroke 2: DOWN (20 -> 12)
      // Ding at index 13 (Price ~ 22)  => Stroke 3: UP (12 -> 22)
      // Total candles: 16
      const closes = [
        12, 10, 12, 14, 16, 20, 18, 16, 14, 12, 14, 16, 18, 22, 20, 19
      ];
      const highs = closes.map((c, idx) => {
        if (idx === 5) return 21; // Ding 1
        if (idx === 13) return 23; // Ding 2
        return c + 0.5;
      });
      const lows = closes.map((c, idx) => {
        if (idx === 1) return 9; // Di 1
        if (idx === 9) return 11; // Di 2
        return c - 0.5;
      });

      const candles = makeCandles(closes, { highs, lows });
      const result = analyzeChanLun(candles);

      expect(result.strokes.length).toBeGreaterThanOrEqual(1);
      expect(result.chanlunDescription).toContain('缠论');
    });
  });
});
