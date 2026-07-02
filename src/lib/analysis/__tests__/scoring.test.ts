import { describe, it, expect } from 'vitest';
import { calculateStockScore } from '../scoring';
import { Candle, IchimokuResult } from '../indicators';
import { VolumeAnalysisResult } from '../volumeForce';
import { PatternResult } from '../patterns';
import { WaveAnalysisResult } from '../waveTheory';
import { SupportResistanceResult } from '../supportResistance';
import { ChanLunResult } from '../chanlun';

function makeCandle(close: number): Candle {
  return {
    date: '2026-06-11',
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000
  };
}

function makeDefaultVolumeAnalysis(): VolumeAnalysisResult {
  return {
    obv: [100],
    cmf: [0.1],
    volume20SMA: [1000],
    isVolumeExpanding: false,
    hasVolumeBreakout: false,
    hasPriceVolumeDivergence: false,
    volumeDescription: 'Default volume description'
  };
}

function makeDefaultPattern(): PatternResult {
  return {
    tdSequential: [0],
    tdSignal: 'None',
    fibonacciLevels: [],
    activePatterns: [],
    isDoubleBottom: false,
    isDoubleTop: false,
    isTripleBottom: false,
    isTripleTop: false,
    isHeadAndShoulders: false,
    isCupAndHandle: false,
    isRoundingTop: false,
    isBullFlag: false,
    isBearFlag: false,
    isRectangle: false,
    isTrianglePennant: false,
    isRisingWedge: false,
    isFallingWedge: false,
    macdDivergence: 'none',
    rsiDivergence: 'none',
    kdjDivergence: 'none',
    patternDescription: 'Default pattern description'
  };
}

function makeDefaultWave(): WaveAnalysisResult {
  return {
    currentWave: 'Consolidation',
    waveDescription: 'Default wave description',
    wavePoints: [],
    waveScoreContribution: 0
  };
}

function makeDefaultChanLun(overrides: Partial<ChanLunResult> = {}): ChanLunResult {
  return {
    mergedKLines: [],
    fenXingList: [],
    strokes: [],
    currentStrokeDirection: 'up',
    chanlunDescription: 'Default ChanLun description',
    ...overrides
  };
}

function makeDefaultIchimoku(length: number = 1, signal: IchimokuResult['cloudSignal'] = 'neutral'): IchimokuResult {
  return {
    tenkanSen: Array(length).fill(100),
    kijunSen: Array(length).fill(99),
    senkouSpanA: Array(length).fill(98),
    senkouSpanB: Array(length).fill(97),
    chikouSpan: Array(length).fill(96),
    cloudSignal: signal,
    cloudDescription: 'Default cloud description'
  };
}

function makeDefaultSR(overrides: Partial<SupportResistanceResult> = {}): SupportResistanceResult {
  return {
    horizontalSupports: [95],
    horizontalResistances: [112],
    volumePOC: 100,
    volumeSupportNodes: [96],
    volumeResistanceNodes: [110],
    volumeProfile: {
      poc: 100,
      valueAreaHigh: 108,
      valueAreaLow: 94,
      nodes: [{ price: 100, volume: 1000, volumeShare: 0.4 }]
    },
    dynamicSupportEMA20: 100,
    dynamicSupportEMA60: 96,
    dynamicBOLLUpper: 115,
    dynamicBOLLLower: 92,
    srDescription: 'Default S/R description',
    ...overrides
  };
}

describe('scoring', () => {
  it('should return empty score details with reason when dailyCandles is empty', () => {
    const score = calculateStockScore(
      [],
      { ema5: [], ema10: [], ema20: [], ema60: [] },
      { dif: [], dea: [], hist: [] },
      { k: [], d: [], j: [] },
      [],
      [],
      makeDefaultIchimoku(0),
      makeDefaultVolumeAnalysis(),
      makeDefaultPattern(),
      makeDefaultWave(),
      makeDefaultSR(),
      makeDefaultChanLun(),
      [],
      { ema5: [], ema10: [], ema20: [], ema60: [] },
      { dif: [], dea: [], hist: [] }
    );

    expect(score.totalScore).toBe(0);
    expect(score.scoreReasons).toHaveLength(1);
  });

  it('should return populated fields when input is valid', () => {
    const volumeAnalysis = makeDefaultVolumeAnalysis();
    volumeAnalysis.cmf = [0.2];
    volumeAnalysis.obv = Array(15).fill(100);

    const pattern = makeDefaultPattern();
    pattern.tdSignal = 'Buy Setup 9';

    const score = calculateStockScore(
      [makeCandle(10)],
      { ema5: [10.5], ema10: [10.3], ema20: [10.1], ema60: [9.8] },
      { dif: [0.5], dea: [0.3], hist: [0.4] },
      { k: [60], d: [50], j: [80] },
      [55],
      [1],
      makeDefaultIchimoku(1, 'bullish'),
      volumeAnalysis,
      pattern,
      makeDefaultWave(),
      makeDefaultSR(),
      makeDefaultChanLun(),
      [makeCandle(10)],
      { ema5: [10.5], ema10: [10.3], ema20: [10.1], ema60: [9.8] },
      { dif: [0.2], dea: [0.1], hist: [0.1] }
    );

    expect(score.baseTrendScore).toBeGreaterThan(0);
    expect(score.momentumScore).toBeGreaterThan(0);
    expect(score.volumeScore).toBeGreaterThan(0);
    expect(score.patternsScore).toBeGreaterThan(0);
    expect(score.weeklyResonanceScore).toBeGreaterThan(0);
    expect(score.totalScore).toBeGreaterThan(0);
    expect(score.totalScore).toBeLessThanOrEqual(5.0);
    expect(score.scoreReasons.length).toBeGreaterThan(0);
  });

  it('should avoid giving a perfect score to overheated breakouts', () => {
    const dailyCandles = Array(10).fill(null).map(() => makeCandle(100));
    dailyCandles[9] = makeCandle(160);

    const volumeAnalysis = makeDefaultVolumeAnalysis();
    volumeAnalysis.cmf = Array(10).fill(0.5);
    volumeAnalysis.hasVolumeBreakout = true;
    volumeAnalysis.obv = Array(10).fill(100);
    volumeAnalysis.obv[9] = 200;

    const pattern = makeDefaultPattern();
    pattern.tdSignal = 'Buy Setup 9';
    pattern.activePatterns = [{ key: 'doubleBottom', name: 'Double bottom', bias: 'bullish', confidence: 0.7, description: 'Confirmed' }];

    const wave = makeDefaultWave();
    wave.waveScoreContribution = 0.5;

    const score = calculateStockScore(
      dailyCandles,
      {
        ema5: Array(10).fill(150),
        ema10: Array(10).fill(140),
        ema20: Array(10).fill(130),
        ema60: Array(10).fill(120)
      },
      { dif: Array(10).fill(10), dea: Array(10).fill(5), hist: Array(10).fill(10) },
      { k: Array(10).fill(20), d: Array(10).fill(15), j: Array(10).fill(30) },
      Array(10).fill(82),
      Array(10).fill(3),
      makeDefaultIchimoku(10, 'bullish'),
      volumeAnalysis,
      pattern,
      wave,
      makeDefaultSR(),
      makeDefaultChanLun(),
      [makeCandle(160)],
      { ema5: [150], ema10: [140], ema20: [130], ema60: [120] },
      { dif: [5], dea: [2], hist: [3] }
    );

    expect(score.totalScore).toBeLessThan(4.2);
    expect(score.scoreReasons.some((reason) => reason.includes('EMA20') || reason.includes('赔率'))).toBe(true);
  });

  it('should rate a healthy pullback above a hot but extended setup', () => {
    const baseCandles = Array(10).fill(null).map(() => makeCandle(100));
    const healthyCandles = baseCandles.map((c) => ({ ...c }));
    healthyCandles[9] = makeCandle(103);

    const extendedCandles = baseCandles.map((c) => ({ ...c }));
    extendedCandles[9] = makeCandle(145);

    const healthyScore = calculateStockScore(
      healthyCandles,
      {
        ema5: Array(10).fill(104),
        ema10: Array(10).fill(103),
        ema20: Array(10).fill(101),
        ema60: Array(10).fill(96)
      },
      { dif: Array(10).fill(0.4), dea: Array(10).fill(0.2), hist: Array(10).fill(0.2) },
      { k: Array(10).fill(45), d: Array(10).fill(40), j: Array(10).fill(55) },
      Array(10).fill(55),
      Array(10).fill(2),
      makeDefaultIchimoku(10, 'bullish'),
      {
        ...makeDefaultVolumeAnalysis(),
        cmf: Array(10).fill(0.12),
        obv: Array(10).fill(120)
      },
      makeDefaultPattern(),
      makeDefaultWave(),
      makeDefaultSR(),
      makeDefaultChanLun(),
      [makeCandle(103)],
      { ema5: [105], ema10: [103], ema20: [100], ema60: [96] },
      { dif: [0.2], dea: [0.1], hist: [0.1] }
    );

    const hotVolume = makeDefaultVolumeAnalysis();
    hotVolume.hasVolumeBreakout = true;
    hotVolume.cmf = Array(10).fill(0.3);
    hotVolume.obv = Array(10).fill(100);
    hotVolume.obv[9] = 200;

    const hotScore = calculateStockScore(
      extendedCandles,
      {
        ema5: Array(10).fill(135),
        ema10: Array(10).fill(125),
        ema20: Array(10).fill(110),
        ema60: Array(10).fill(95)
      },
      { dif: Array(10).fill(1.4), dea: Array(10).fill(1.0), hist: Array(10).fill(0.2) },
      { k: Array(10).fill(88), d: Array(10).fill(82), j: Array(10).fill(95) },
      Array(10).fill(82),
      Array(10).fill(3),
      makeDefaultIchimoku(10, 'bullish'),
      hotVolume,
      makeDefaultPattern(),
      makeDefaultWave(),
      makeDefaultSR(),
      makeDefaultChanLun(),
      [makeCandle(145)],
      { ema5: [135], ema10: [125], ema20: [110], ema60: [95] },
      { dif: [0.2], dea: [0.1], hist: [0.1] }
    );

    expect(healthyScore.totalScore).toBeGreaterThan(hotScore.totalScore);
  });

  it('should give a high score to a good-odds trend pullback with support confluence', () => {
    const dailyCandles = Array(30).fill(null).map(() => makeCandle(100));
    dailyCandles[29] = makeCandle(102);

    const volumeAnalysis = {
      ...makeDefaultVolumeAnalysis(),
      cmf: Array(30).fill(0.18),
      obv: Array.from({ length: 30 }, (_, i) => 100 + i * 5),
      isVolumeExpanding: true
    };

    const pattern = makeDefaultPattern();
    pattern.fibonacciLevels = [
      { label: '38.2%', price: 99.8 },
      { label: '50.0%', price: 104 },
      { label: '61.8%', price: 118 }
    ];
    pattern.activePatterns = [
      { key: 'fallingWedge', name: 'Falling wedge', bias: 'bullish', confidence: 0.72, description: 'Compression near support' }
    ];

    const score = calculateStockScore(
      dailyCandles,
      {
        ema5: Array(30).fill(103),
        ema10: Array(30).fill(102),
        ema20: Array(30).fill(100),
        ema60: Array(30).fill(94)
      },
      { dif: Array(30).fill(0.4), dea: Array(30).fill(0.2), hist: Array(30).fill(0.25) },
      { k: Array(30).fill(48), d: Array(30).fill(42), j: Array(30).fill(60) },
      Array(30).fill(54),
      Array(30).fill(2),
      makeDefaultIchimoku(30, 'bullish'),
      volumeAnalysis,
      pattern,
      makeDefaultWave(),
      makeDefaultSR({
        horizontalSupports: [100],
        horizontalResistances: [118],
        volumeSupportNodes: [99],
        volumeResistanceNodes: [121],
        volumePOC: 100,
        volumeProfile: {
          poc: 100,
          valueAreaHigh: 108,
          valueAreaLow: 98,
          nodes: [{ price: 100, volume: 3000, volumeShare: 0.5 }]
        },
        dynamicSupportEMA20: 100,
        dynamicSupportEMA60: 94,
        dynamicBOLLUpper: 120,
        dynamicBOLLLower: 96
      }),
      makeDefaultChanLun({
        currentStrokeDirection: 'up',
        chanlunDescription: '缠论结构：最近已确立一笔向上笔，当前多头延续。'
      }),
      [makeCandle(103)],
      { ema5: [104], ema10: [102], ema20: [99], ema60: [92] },
      { dif: [0.3], dea: [0.1], hist: [0.2] }
    );

    expect(score.totalScore).toBeGreaterThanOrEqual(4);
    expect(score.scoreReasons.some((reason) => reason.includes('赔率'))).toBe(true);
  });

  it('should suppress a hot breakout when reward/risk is poor despite strong indicators', () => {
    const dailyCandles = Array(30).fill(null).map(() => makeCandle(100));
    dailyCandles[28] = makeCandle(132);
    dailyCandles[29] = makeCandle(145);

    const volumeAnalysis = {
      ...makeDefaultVolumeAnalysis(),
      cmf: Array(30).fill(0.35),
      obv: Array.from({ length: 30 }, (_, i) => 100 + i * 20),
      hasVolumeBreakout: true,
      isVolumeExpanding: true
    };

    const pattern = makeDefaultPattern();
    pattern.activePatterns = [
      { key: 'cupAndHandle', name: 'Cup and handle', bias: 'bullish', confidence: 0.8, description: 'Breakout' }
    ];

    const score = calculateStockScore(
      dailyCandles,
      {
        ema5: Array(30).fill(138),
        ema10: Array(30).fill(130),
        ema20: Array(30).fill(112),
        ema60: Array(30).fill(96)
      },
      { dif: Array(30).fill(2.2), dea: Array(30).fill(1.2), hist: Array(30).fill(1.1) },
      { k: Array(30).fill(90), d: Array(30).fill(84), j: Array(30).fill(98) },
      Array(30).fill(82),
      Array(30).fill(4),
      makeDefaultIchimoku(30, 'bullish'),
      volumeAnalysis,
      pattern,
      { ...makeDefaultWave(), waveScoreContribution: 0.5, currentWave: 'Wave 3 (Upward Impulse)' },
      makeDefaultSR({
        horizontalSupports: [120],
        horizontalResistances: [150],
        volumeSupportNodes: [118],
        volumeResistanceNodes: [151],
        volumePOC: 118,
        volumeProfile: {
          poc: 118,
          valueAreaHigh: 136,
          valueAreaLow: 108,
          nodes: [{ price: 118, volume: 3000, volumeShare: 0.5 }]
        },
        dynamicSupportEMA20: 112,
        dynamicSupportEMA60: 96,
        dynamicBOLLUpper: 152,
        dynamicBOLLLower: 90
      }),
      makeDefaultChanLun({
        currentStrokeDirection: 'up',
        chanlunDescription: '缠论结构：最近已确立一笔向上笔，当前在该笔冲高后，正在形成潜在的顶分型结构。'
      }),
      [makeCandle(145)],
      { ema5: [138], ema10: [130], ema20: [112], ema60: [96] },
      { dif: [0.8], dea: [0.3], hist: [0.5] }
    );

    expect(score.totalScore).toBeLessThan(3.5);
    expect(score.scoreReasons.some((reason) => reason.includes('赔率'))).toBe(true);
  });

  it('should use Fibonacci and ChanLun context to improve a left-side reversal score', () => {
    const dailyCandles = Array(30).fill(null).map(() => makeCandle(100));
    dailyCandles[29] = makeCandle(96);

    const patternWithoutContext = makeDefaultPattern();
    patternWithoutContext.tdSignal = 'Buy Setup 9';
    patternWithoutContext.rsiDivergence = 'bottom';

    const patternWithContext = {
      ...patternWithoutContext,
      fibonacciLevels: [
        { label: '61.8%', price: 95.8 },
        { label: '78.6%', price: 92 }
      ]
    };

    const commonArgs = {
      dailyCandles,
      dailyEMAs: {
        ema5: Array(30).fill(97),
        ema10: Array(30).fill(98),
        ema20: Array(30).fill(101),
        ema60: Array(30).fill(104)
      },
      dailyMACD: { dif: Array(30).fill(-0.4), dea: Array(30).fill(-0.6), hist: Array(30).fill(0.1) },
      dailyKDJ: { k: Array(30).fill(24), d: Array(30).fill(20), j: Array(30).fill(32) },
      dailyRSI: Array(30).fill(34),
      dailyATR: Array(30).fill(2.2),
      dailyIchimoku: makeDefaultIchimoku(30, 'neutral'),
      dailyVolumeAnalysis: {
        ...makeDefaultVolumeAnalysis(),
        cmf: Array(30).fill(0.08),
        obv: Array.from({ length: 30 }, (_, i) => 100 + i)
      },
      dailyWaveResult: makeDefaultWave(),
      dailySupportResistance: makeDefaultSR({
        horizontalSupports: [94],
        horizontalResistances: [108],
        volumeSupportNodes: [95],
        volumeResistanceNodes: [110],
        volumePOC: 97,
        volumeProfile: {
          poc: 97,
          valueAreaHigh: 103,
          valueAreaLow: 94,
          nodes: [{ price: 97, volume: 3000, volumeShare: 0.5 }]
        }
      }),
      weeklyCandles: [makeCandle(96)],
      weeklyEMAs: { ema5: [98], ema10: [100], ema20: [102], ema60: [104] },
      weeklyMACD: { dif: [-0.3], dea: [-0.5], hist: [0.2] }
    };

    const withoutContext = calculateStockScore(
      commonArgs.dailyCandles,
      commonArgs.dailyEMAs,
      commonArgs.dailyMACD,
      commonArgs.dailyKDJ,
      commonArgs.dailyRSI,
      commonArgs.dailyATR,
      commonArgs.dailyIchimoku,
      commonArgs.dailyVolumeAnalysis,
      patternWithoutContext,
      commonArgs.dailyWaveResult,
      commonArgs.dailySupportResistance,
      makeDefaultChanLun({ currentStrokeDirection: 'down', chanlunDescription: '缠论结构：向下笔延续。' }),
      commonArgs.weeklyCandles,
      commonArgs.weeklyEMAs,
      commonArgs.weeklyMACD
    );

    const withContext = calculateStockScore(
      commonArgs.dailyCandles,
      commonArgs.dailyEMAs,
      commonArgs.dailyMACD,
      commonArgs.dailyKDJ,
      commonArgs.dailyRSI,
      commonArgs.dailyATR,
      commonArgs.dailyIchimoku,
      commonArgs.dailyVolumeAnalysis,
      patternWithContext,
      commonArgs.dailyWaveResult,
      commonArgs.dailySupportResistance,
      makeDefaultChanLun({ currentStrokeDirection: 'down', chanlunDescription: '缠论结构：向下笔探底后，正在形成潜在的底分型结构。' }),
      commonArgs.weeklyCandles,
      commonArgs.weeklyEMAs,
      commonArgs.weeklyMACD
    );

    expect(withContext.totalScore).toBeGreaterThan(withoutContext.totalScore);
    expect(withContext.scoreReasons.some((reason) => reason.includes('斐波纳契'))).toBe(true);
    expect(withContext.scoreReasons.some((reason) => reason.includes('缠论'))).toBe(true);
  });

  it('should return neutral weeklyResonanceScore if weeklyCandles is empty and no extra risk applies', () => {
    const score = calculateStockScore(
      [makeCandle(10)],
      { ema5: [10], ema10: [10], ema20: [10], ema60: [10] },
      { dif: [0], dea: [0], hist: [0] },
      { k: [50], d: [50], j: [50] },
      [50],
      [0.5],
      makeDefaultIchimoku(1),
      makeDefaultVolumeAnalysis(),
      makeDefaultPattern(),
      makeDefaultWave(),
      makeDefaultSR(),
      makeDefaultChanLun(),
      [],
      { ema5: [], ema10: [], ema20: [], ema60: [] },
      { dif: [], dea: [], hist: [] }
    );

    expect(score.weeklyResonanceScore).toBe(0.5);
  });
});
