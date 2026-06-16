import { describe, it, expect } from 'vitest';
import { calculateStockScore } from '../scoring';
import { Candle } from '../indicators';
import { VolumeAnalysisResult } from '../volumeForce';
import { PatternResult } from '../patterns';
import { WaveAnalysisResult } from '../waveTheory';

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
    isDoubleBottom: false,
    isHeadAndShoulders: false,
    isCupAndHandle: false,
    isRoundingTop: false,
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

describe('scoring', () => {
  it('should return empty score details with reason when dailyCandles is empty', () => {
    const score = calculateStockScore(
      [],
      { ema5: [], ema10: [], ema20: [], ema60: [] },
      { dif: [], dea: [], hist: [] },
      { k: [], d: [], j: [] },
      [],
      makeDefaultVolumeAnalysis(),
      makeDefaultPattern(),
      makeDefaultWave(),
      [],
      { ema5: [], ema10: [], ema20: [], ema60: [] },
      { dif: [], dea: [], hist: [] }
    );

    expect(score.totalScore).toBe(0);
    expect(score.scoreReasons).toContain('数据不足');
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
      volumeAnalysis,
      pattern,
      makeDefaultWave(),
      [makeCandle(10)],
      { ema5: [10.5], ema10: [10.3], ema20: [10.1], ema60: [9.8] },
      { dif: [0.2], dea: [0.1], hist: [0.1] }
    );

    expect(score.baseTrendScore).toBe(1.3);
    expect(score.momentumScore).toBeGreaterThan(0);
    expect(score.volumeScore).toBeGreaterThan(0);
    expect(score.patternsScore).toBeGreaterThan(0);
    expect(score.weeklyResonanceScore).toBeGreaterThan(0.5);
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
    pattern.isDoubleBottom = true;

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
      volumeAnalysis,
      pattern,
      wave,
      [makeCandle(160)],
      { ema5: [150], ema10: [140], ema20: [130], ema60: [120] },
      { dif: [5], dea: [2], hist: [3] }
    );

    expect(score.totalScore).toBeLessThan(4.2);
    expect(score.scoreReasons.some((reason) => reason.includes('追高风险'))).toBe(true);
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
      {
        ...makeDefaultVolumeAnalysis(),
        cmf: Array(10).fill(0.12),
        obv: Array(10).fill(120)
      },
      makeDefaultPattern(),
      makeDefaultWave(),
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
      hotVolume,
      makeDefaultPattern(),
      makeDefaultWave(),
      [makeCandle(145)],
      { ema5: [135], ema10: [125], ema20: [110], ema60: [95] },
      { dif: [0.2], dea: [0.1], hist: [0.1] }
    );

    expect(healthyScore.totalScore).toBeGreaterThan(hotScore.totalScore);
  });

  it('should return weeklyResonanceScore as 0.5 if weeklyCandles is empty', () => {
    const score = calculateStockScore(
      [makeCandle(10)],
      { ema5: [10], ema10: [10], ema20: [10], ema60: [10] },
      { dif: [0], dea: [0], hist: [0] },
      { k: [50], d: [50], j: [50] },
      [50],
      makeDefaultVolumeAnalysis(),
      makeDefaultPattern(),
      makeDefaultWave(),
      [],
      { ema5: [], ema10: [], ema20: [], ema60: [] },
      { dif: [], dea: [], hist: [] }
    );

    expect(score.weeklyResonanceScore).toBe(0.5);
  });
});
