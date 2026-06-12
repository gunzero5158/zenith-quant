import { describe, it, expect } from 'vitest';
import { generateFallbackReport, StructuredReport } from '../fallbackReport';
import { ScoreDetail } from '../scoring';
import { VolumeAnalysisResult } from '../volumeForce';
import { PatternResult } from '../patterns';
import { WaveAnalysisResult } from '../waveTheory';
import { ChanLunResult } from '../chanlun';
import { SupportResistanceResult } from '../supportResistance';

function makeMockScore(totalScore: number): ScoreDetail {
  return {
    baseTrendScore: totalScore * 0.3,
    momentumScore: totalScore * 0.2,
    volumeScore: totalScore * 0.2,
    patternsScore: totalScore * 0.1,
    weeklyResonanceScore: totalScore * 0.2,
    totalScore,
    scoreReasons: ['Mock reason']
  };
}

function makeMockVolume(): VolumeAnalysisResult {
  return {
    obv: [1000],
    cmf: [0.1],
    volume20SMA: [1000],
    isVolumeExpanding: false,
    hasVolumeBreakout: false,
    hasPriceVolumeDivergence: false,
    volumeDescription: '成交量稳定'
  };
}

function makeMockPatterns(): PatternResult {
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
    patternDescription: '经典形态暂无'
  };
}

function makeMockWave(): WaveAnalysisResult {
  return {
    currentWave: '第 3 浪主升浪',
    waveDescription: '价格强劲',
    wavePoints: [],
    waveScoreContribution: 0.5
  };
}

function makeMockChanlun(): ChanLunResult {
  return {
    mergedKLines: [],
    fenXingList: [],
    strokes: [],
    currentStrokeDirection: 'up',
    chanlunDescription: '向上延伸'
  };
}

function makeMockSR(): SupportResistanceResult {
  return {
    horizontalSupports: [90, 85],
    horizontalResistances: [110, 115],
    volumePOC: 95,
    volumeSupportNodes: [],
    volumeResistanceNodes: [],
    dynamicSupportEMA20: 98,
    dynamicSupportEMA60: 95,
    dynamicBOLLUpper: 105,
    dynamicBOLLLower: 85,
    srDescription: '下方支撑在均线附近'
  };
}

describe('fallbackReport', () => {
  const symbol = 'AAPL';
  const price = 100;
  const changePercent = 2.5;

  it('should routing lang "zh-CN" to simplified Chinese', () => {
    const score = makeMockScore(4.5);
    const report = generateFallbackReport(
      symbol,
      price,
      changePercent,
      score,
      makeMockVolume(),
      makeMockPatterns(),
      makeMockWave(),
      makeMockChanlun(),
      makeMockSR(),
      'zh-CN'
    );
    expect(report.overview).toContain('强劲');
    expect(report.overview).toContain('强烈买入');
  });

  it('should routing lang "en" to English', () => {
    const score = makeMockScore(4.5);
    const report = generateFallbackReport(
      symbol,
      price,
      changePercent,
      score,
      makeMockVolume(),
      makeMockPatterns(),
      makeMockWave(),
      makeMockChanlun(),
      makeMockSR(),
      'en'
    );
    expect(report.overview).toContain('Currently');
    expect(report.overview).toContain('Strong Buy');
  });

  it('should routing lang "ja" to Japanese', () => {
    const score = makeMockScore(4.5);
    const report = generateFallbackReport(
      symbol,
      price,
      changePercent,
      score,
      makeMockVolume(),
      makeMockPatterns(),
      makeMockWave(),
      makeMockChanlun(),
      makeMockSR(),
      'ja'
    );
    expect(report.overview).toContain('現在');
    expect(report.overview).toContain('買い推奨');
  });

  it('should routing lang "zh-TW" or "zh-HK" to Traditional Chinese', () => {
    const score = makeMockScore(4.5);
    const reportTW = generateFallbackReport(
      symbol,
      price,
      changePercent,
      score,
      makeMockVolume(),
      makeMockPatterns(),
      makeMockWave(),
      makeMockChanlun(),
      makeMockSR(),
      'zh-TW'
    );
    const reportHK = generateFallbackReport(
      symbol,
      price,
      changePercent,
      score,
      makeMockVolume(),
      makeMockPatterns(),
      makeMockWave(),
      makeMockChanlun(),
      makeMockSR(),
      'zh-HK'
    );
    expect(reportTW.overview).toContain('當前');
    expect(reportTW.overview).toContain('強烈買入');
    expect(reportHK.overview).toContain('當前');
  });

  it('should recommend Strong Buy when score >= 4.0', () => {
    const score = makeMockScore(4.2);
    const report = generateFallbackReport(
      symbol,
      price,
      changePercent,
      score,
      makeMockVolume(),
      makeMockPatterns(),
      makeMockWave(),
      makeMockChanlun(),
      makeMockSR()
    );
    expect(report.overview).toContain('强烈买入/持有');
  });

  it('should recommend Sell when score <= 1.5', () => {
    const score = makeMockScore(1.2);
    const report = generateFallbackReport(
      symbol,
      price,
      changePercent,
      score,
      makeMockVolume(),
      makeMockPatterns(),
      makeMockWave(),
      makeMockChanlun(),
      makeMockSR()
    );
    expect(report.overview).toContain('建议卖出/避险');
  });

  it('should contain correct structure and reference symbol and price', () => {
    const score = makeMockScore(3.5);
    const report = generateFallbackReport(
      symbol,
      price,
      changePercent,
      score,
      makeMockVolume(),
      makeMockPatterns(),
      makeMockWave(),
      makeMockChanlun(),
      makeMockSR()
    );

    expect(report.overview).toBeTruthy();
    expect(report.recommendation).toBeTruthy();
    expect(report.technicalAnalysis).toBeTruthy();
    expect(report.overview).toContain(symbol);
    expect(report.overview).toContain('$95'); // POC price
  });
});
