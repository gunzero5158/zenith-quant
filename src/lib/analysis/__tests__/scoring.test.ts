import { describe, it, expect } from 'vitest';
import { calculateStockScore } from '../scoring';
import { Candle } from '../indicators';
import { VolumeAnalysisResult } from '../volumeForce';
import { PatternResult } from '../patterns';
import { WaveAnalysisResult } from '../waveTheory';

// Helper to construct basic Candle
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

// Helper to construct default VolumeAnalysisResult
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

// Helper to construct default PatternResult
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

// Helper to construct default WaveAnalysisResult
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
      { dif: [], dea: [] }
    );

    expect(score.totalScore).toBe(0);
    expect(score.scoreReasons).toContain('数据不足');
  });

  it('should return correct fields and values when input is valid', () => {
    const dailyCandles = [makeCandle(10)];
    const weeklyCandles = [makeCandle(10)];

    const dailyEMAs = { ema5: [10.5], ema10: [10.3], ema20: [10.1], ema60: [9.8] }; // Bullish alignment
    const dailyMACD = { dif: [0.5], dea: [0.3], hist: [0.4] };
    const dailyKDJ = { k: [60], d: [50], j: [80] };
    const dailyRSI = [55]; // RSI in 50-70 range -> momPoints += 0.2

    const volumeAnalysis = makeDefaultVolumeAnalysis();
    volumeAnalysis.cmf = [0.2]; // CMF > 0.15 -> volPoints += 0.3
    volumeAnalysis.obv = Array(15).fill(100);

    const pattern = makeDefaultPattern();
    pattern.tdSignal = 'Buy Setup 9'; // -> patPoints += 0.4
    const wave = makeDefaultWave();

    const weeklyEMAs = { ema5: [10.5], ema10: [10.3], ema20: [10.1], ema60: [9.8] }; // Weekly bullish -> weeklyPoints += 0.8
    const weeklyMACD = { dif: [0.2], dea: [0.1] }; // Weekly MACD golden cross -> weeklyPoints += 0.2

    const score = calculateStockScore(
      dailyCandles,
      dailyEMAs,
      dailyMACD,
      dailyKDJ,
      dailyRSI,
      volumeAnalysis,
      pattern,
      wave,
      weeklyCandles,
      weeklyEMAs,
      weeklyMACD
    );

    expect(score.baseTrendScore).toBe(1.5);
    expect(score.momentumScore).toBeGreaterThan(0);
    expect(score.volumeScore).toBeGreaterThan(0);
    expect(score.patternsScore).toBeGreaterThan(0);
    expect(score.weeklyResonanceScore).toBe(1.0); // clamped at 1.0
    expect(score.totalScore).toBeGreaterThan(0);
    expect(score.totalScore).toBeLessThanOrEqual(5.0);
    expect(score.scoreReasons.length).toBeGreaterThan(0);
  });

  it('should clamp totalScore between 0 and 5.0', () => {
    // Let's create an extremely bullish setup with 10 days of data to satisfy OBV SMA calculations
    const dailyCandles = Array(10).fill(null).map(() => makeCandle(100));
    const weeklyCandles = [makeCandle(100)];

    const dailyEMAs = {
      ema5: Array(10).fill(150),
      ema10: Array(10).fill(140),
      ema20: Array(10).fill(130),
      ema60: Array(10).fill(120)
    }; // baseTrendScore = 1.5

    const dailyMACD = {
      dif: Array(10).fill(10),
      dea: Array(10).fill(5),
      hist: Array(10).fill(10)
    }; // dif > 0 and dif > dea -> momPoints += 0.5
    
    const dailyKDJ = {
      k: Array(10).fill(20),
      d: Array(10).fill(15),
      j: Array(10).fill(30)
    }; // k>d and d<30 -> momPoints += 0.3
    
    const dailyRSI = Array(10).fill(60); // momPoints += 0.2. Total momPoints = 1.0 (clamped momentumScore = 1.0)
    
    const volumeAnalysis = makeDefaultVolumeAnalysis();
    volumeAnalysis.cmf = Array(10).fill(0.5); // volPoints += 0.3
    volumeAnalysis.hasVolumeBreakout = true; // volPoints += 0.3
    volumeAnalysis.obv = Array(10).fill(100);
    volumeAnalysis.obv[9] = 200; // latest OBV (200) > obv10SMA (100) -> volPoints += 0.2. Total volPoints = 0.8 (clamped volumeScore = 0.8)

    const pattern = makeDefaultPattern();
    pattern.tdSignal = 'Buy Setup 9'; // patPoints += 0.4
    pattern.isDoubleBottom = true; // patPoints += 0.3
    
    const wave = makeDefaultWave();
    wave.waveScoreContribution = 0.5; // patPoints += 0.5. Total patPoints = 1.2 (clamped patternsScore = 0.7)

    const weeklyEMAs = { ema5: [150], ema10: [140], ema20: [130], ema60: [120] }; // weeklyPoints += 0.8
    const weeklyMACD = { dif: [5], dea: [2] }; // weeklyPoints += 0.2. Total weeklyPoints = 1.0 (clamped weeklyResonanceScore = 1.0)

    // Sum of scores: 1.5 + 1.0 + 0.8 + 0.7 + 1.0 = 5.0
    const score = calculateStockScore(
      dailyCandles,
      dailyEMAs,
      dailyMACD,
      dailyKDJ,
      dailyRSI,
      volumeAnalysis,
      pattern,
      wave,
      weeklyCandles,
      weeklyEMAs,
      weeklyMACD
    );

    expect(score.totalScore).toBe(5.0);
  });

  it('should return weeklyResonanceScore as 0.5 if weeklyCandles is empty', () => {
    const dailyCandles = [makeCandle(10)];
    const score = calculateStockScore(
      dailyCandles,
      { ema5: [10], ema10: [10], ema20: [10], ema60: [10] },
      { dif: [0], dea: [0], hist: [0] },
      { k: [50], d: [50], j: [50] },
      [50],
      makeDefaultVolumeAnalysis(),
      makeDefaultPattern(),
      makeDefaultWave(),
      [], // Empty weekly candles
      { ema5: [], ema10: [], ema20: [], ema60: [] },
      { dif: [], dea: [] }
    );

    expect(score.weeklyResonanceScore).toBe(0.5);
  });
});
