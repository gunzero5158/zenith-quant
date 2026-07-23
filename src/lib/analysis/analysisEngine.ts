import { analyzeChanLun } from "./chanlun";
import { detectCandlestickPatterns } from "./candlestickPatterns";
import { buildDataQuality } from "./dataQuality";
import { buildEvidenceSnapshot, TechnicalFrameEvidence } from "./evidenceBuilder";
import { generateLocalReport, StructuredReport } from "./fallbackReport";
import {
  calculateATR,
  calculateBOLL,
  calculateEMA,
  calculateIchimoku,
  calculateKDJ,
  calculateMACD,
  calculateRSI,
  Candle,
} from "./indicators";
import { analyzePatterns, calculateTDSequential } from "./patterns";
import { calculateEntryAssessment, EntryAssessment, ScoreDetail, toLegacyScoreDetail } from "./scoring";
import { buildStrategyAdvice, StrategyAdvice } from "./strategyAdvice";
import { calculateSupportResistance } from "./supportResistance";
import {
  analyzeAtr,
  analyzeBoll,
  analyzeEma,
  analyzeIchimoku,
  analyzeKdj,
  analyzeMacd,
  analyzeRsi,
} from "./technicalSignals";
import { analyzePriceVolume } from "./volumeForce";
import { analyzeWaveTheory } from "./waveTheory";
import { mergeCurrentWeekFromDaily, toIsoDateKey } from "./weeklyCandles";
import { EvidenceSnapshot } from "./evidence";

export interface AnalysisEngineInput {
  symbol: string;
  dailyCandles: Candle[];
  weeklyCandles: Candle[];
  asOf: string;
  language?: string;
}

interface CalculatedFrame {
  ema5: number[];
  ema10: number[];
  ema20: number[];
  ema60: number[];
  boll: ReturnType<typeof calculateBOLL>;
  macd: ReturnType<typeof calculateMACD>;
  kdj: ReturnType<typeof calculateKDJ>;
  rsi: number[];
  atr: number[];
  ichimoku: ReturnType<typeof calculateIchimoku>;
  volume: ReturnType<typeof analyzePriceVolume>;
}

export interface AnalysisEngineResult {
  dailyCandles: Candle[];
  weeklyCandles: Candle[];
  daily: CalculatedFrame;
  weekly: CalculatedFrame;
  snapshot: EvidenceSnapshot;
  entryAssessment: EntryAssessment;
  legacyScore: ScoreDetail;
  strategyAdvice: StrategyAdvice;
  localReport: StructuredReport;
  patterns: ReturnType<typeof analyzePatterns>;
  wave: ReturnType<typeof analyzeWaveTheory>;
  chanlun: ReturnType<typeof analyzeChanLun>;
  supportResistance: ReturnType<typeof calculateSupportResistance>;
  candlesticks: ReturnType<typeof detectCandlestickPatterns>;
}

function calculateFrame(candles: Candle[]): CalculatedFrame {
  return {
    ema5: calculateEMA(candles, 5),
    ema10: calculateEMA(candles, 10),
    ema20: calculateEMA(candles, 20),
    ema60: calculateEMA(candles, 60),
    boll: calculateBOLL(candles, 20, 2),
    macd: calculateMACD(candles, 12, 26, 9),
    kdj: calculateKDJ(candles, 9, 3, 3),
    rsi: calculateRSI(candles, 14),
    atr: calculateATR(candles, 14),
    ichimoku: calculateIchimoku(candles),
    volume: analyzePriceVolume(candles),
  };
}

function frameEvidence(frame: CalculatedFrame, candles: Candle[], provisional: boolean): TechnicalFrameEvidence {
  const index = candles.length - 1;
  const price = candles[index]?.close ?? Number.NaN;
  return {
    ema: analyzeEma({ price, ema5: frame.ema5, ema10: frame.ema10, ema20: frame.ema20, ema60: frame.ema60, index, provisional }),
    boll: analyzeBoll({ price, middle: frame.boll.middle, upper: frame.boll.upper, lower: frame.boll.lower, index, provisional }),
    ichimoku: analyzeIchimoku({
      price,
      tenkan: frame.ichimoku.tenkanSen,
      kijun: frame.ichimoku.kijunSen,
      spanA: frame.ichimoku.senkouSpanA,
      spanB: frame.ichimoku.senkouSpanB,
      index,
      provisional,
    }),
    macd: analyzeMacd(frame.macd.dif, frame.macd.dea, frame.macd.hist, index, provisional),
    kdj: analyzeKdj(frame.kdj.k, frame.kdj.d, frame.kdj.j, index, provisional),
    rsi: analyzeRsi(frame.rsi, index, provisional),
    atr: analyzeAtr(frame.atr, price, index, provisional),
    volume: frame.volume,
  };
}

function latestFinite(values: number[]): number {
  for (let index = values.length - 1; index >= 0; index--) {
    if (Number.isFinite(values[index])) return values[index];
  }
  return Number.NaN;
}

export function runAnalysisEngine(input: AnalysisEngineInput): AnalysisEngineResult {
  if (input.dailyCandles.length === 0) throw new Error("Analysis requires at least one daily candle");
  const normalizeAndSortCandles = (candles: Candle[]): Candle[] => candles
    .map((candle) => ({ ...candle, date: toIsoDateKey(candle.date) }))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const dailyCandles = normalizeAndSortCandles(input.dailyCandles);
  const weeklyCandles = mergeCurrentWeekFromDaily(normalizeAndSortCandles(input.weeklyCandles), dailyCandles);
  const price = dailyCandles.at(-1)!.close;
  const dataQuality = buildDataQuality({
    symbol: input.symbol,
    asOf: input.asOf,
    dailySamples: dailyCandles.length,
    weeklySamples: weeklyCandles.length,
    latestDailyDate: String(dailyCandles.at(-1)!.date),
    latestWeeklyDate: weeklyCandles.length > 0 ? String(weeklyCandles.at(-1)!.date) : undefined,
  });

  const daily = calculateFrame(dailyCandles);
  const weekly = calculateFrame(weeklyCandles);
  const latestCmf = [...daily.volume.cmf].reverse().find(Number.isFinite);
  const patterns = analyzePatterns(dailyCandles, daily.macd.dif, daily.rsi, daily.kdj.k, {
    relativeVolume: daily.volume.relativeVolume,
    cmf: latestCmf,
    retestHeld: daily.volume.isLowVolumePullback,
  });
  const td = calculateTDSequential(dailyCandles);
  const wave = analyzeWaveTheory(dailyCandles);
  const chanlun = analyzeChanLun(dailyCandles);
  const supportResistance = calculateSupportResistance(
    dailyCandles,
    price,
    latestFinite(daily.ema20),
    latestFinite(daily.ema60),
    latestFinite(daily.boll.upper),
    latestFinite(daily.boll.lower)
  );
  const candlesticks = detectCandlestickPatterns(
    dailyCandles,
    daily.atr,
    supportResistance.typedLevels ?? [],
    { ema20: daily.ema20 }
  );

  const snapshot = buildEvidenceSnapshot({
    symbol: input.symbol,
    price,
    dataQuality,
    daily: frameEvidence(daily, dailyCandles, !dataQuality.dailyBarComplete),
    weekly: frameEvidence(weekly, weeklyCandles, !dataQuality.weeklyBarComplete),
    patterns: {
      activePatterns: patterns.activePatterns,
      fibonacci: patterns.fibonacci,
      macdDivergence: patterns.macdDivergence,
      rsiDivergence: patterns.rsiDivergence,
      kdjDivergence: patterns.kdjDivergence,
      tdSequential: td.counts,
      tdSignal: td.latestSignal,
      latestCount: td.latestCount,
      latestSetup: td.latestSetup,
      barsSinceSetup9: td.barsSinceSetup9,
    },
    candlesticks,
    chanlun,
    elliottWave: {
      state: wave.currentWave,
      direction: wave.waveScoreContribution > 0 ? "bullish" : wave.waveScoreContribution < 0 ? "bearish" : "neutral",
      description: wave.waveDescription,
    },
    levels: supportResistance.typedLevels ?? [],
  });
  const entryAssessment = calculateEntryAssessment(snapshot);
  const legacyScore = toLegacyScoreDetail(entryAssessment);
  const strategyAdvice = buildStrategyAdvice(snapshot, entryAssessment);
  const localReport = generateLocalReport({ snapshot, entryAssessment, strategyAdvice }, input.language ?? "zh-CN");
  return {
    dailyCandles,
    weeklyCandles,
    daily,
    weekly,
    snapshot,
    entryAssessment,
    legacyScore,
    strategyAdvice,
    localReport,
    patterns,
    wave,
    chanlun,
    supportResistance,
    candlesticks,
  };
}
