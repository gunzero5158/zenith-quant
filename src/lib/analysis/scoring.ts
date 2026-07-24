import { Candle, IchimokuResult } from "./indicators";
import { VolumeAnalysisResult } from "./volumeForce";
import { PatternResult } from "./patterns";
import { WaveAnalysisResult } from "./waveTheory";
import { SupportResistanceResult } from "./supportResistance";
import { ChanLunResult } from "./chanlun";
import { EvidenceSnapshot, ScenarioStatus } from "./evidence";

export interface ScoreDetail {
  baseTrendScore: number;
  momentumScore: number;
  volumeScore: number;
  patternsScore: number;
  weeklyResonanceScore: number;
  totalScore: number;
  scoreReasons: string[];
}

export interface EntryAssessment {
  ruleScore: number;
  aiAdjustment: number;
  finalScore: number;
  hardCap: number;
  dimensions: {
    priceLocation: number;
    payoffQuality: number;
    setupMaturity: number;
    timeframeContext: number;
    confirmationQuality: number;
  };
  leftStatus: ScenarioStatus;
  rightStatus: ScenarioStatus;
  activeSetup: "left" | "right" | "none";
  riskPlan: { stop?: number; target?: number; rewardRisk?: number; stopDistancePct?: number };
  reasons: string[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const isValid = (value: number | undefined): value is number => typeof value === "number" && Number.isFinite(value);

const BULLISH_REVERSAL_PATTERNS = new Set(["doubleBottom", "tripleBottom", "fallingWedge"]);
const BULLISH_BREAKOUT_PATTERNS = new Set(["cupAndHandle", "bullFlag", "doubleBottom", "tripleBottom"]);
const BEARISH_TOP_PATTERNS = new Set(["doubleTop", "tripleTop", "headAndShoulders", "roundingTop", "bearFlag", "risingWedge"]);

function pctDistance(price: number, base: number): number {
  if (!base) return 0;
  return ((price - base) / base) * 100;
}

function pctFromCurrent(currentPrice: number, level: number): number {
  if (!currentPrice) return 0;
  return Math.abs((currentPrice - level) / currentPrice) * 100;
}

function latestValid(values: number[]): number | undefined {
  for (let i = values.length - 1; i >= 0; i--) {
    if (isValid(values[i])) return values[i];
  }
  return undefined;
}

function valueAt(values: number[], index: number): number | undefined {
  if (index < 0) return undefined;
  return isValid(values[index]) ? values[index] : latestValid(values);
}

/**
 * Strict lookup without the latest-value fallback. Used for previous-bar values:
 * falling back to the latest value there would compare "today vs today" and
 * fabricate crossover signals.
 */
function strictValueAt(values: number[], index: number): number | undefined {
  if (index < 0 || index >= values.length) return undefined;
  return isValid(values[index]) ? values[index] : undefined;
}

function uniqueLevels(levels: Array<number | undefined>): number[] {
  const seen = new Set<string>();
  const result: number[] = [];

  for (const level of levels) {
    if (!isValid(level) || level <= 0) continue;
    const key = level.toFixed(2);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(level);
    }
  }

  return result;
}

function levelsBelow(levels: Array<number | undefined>, currentPrice: number): number[] {
  return uniqueLevels(levels)
    .filter((level) => level < currentPrice)
    .sort((a, b) => b - a);
}

function levelsAbove(levels: Array<number | undefined>, currentPrice: number): number[] {
  return uniqueLevels(levels)
    .filter((level) => level > currentPrice)
    .sort((a, b) => a - b);
}

function hasPattern(patterns: PatternResult["activePatterns"], keys: Set<string>): boolean {
  return patterns.some((pattern) => keys.has(pattern.key));
}

function patternNames(patterns: PatternResult["activePatterns"]): string {
  return patterns.map((pattern) => pattern.name).join("、");
}

/**
 * Computes a 0-5 buy-point attractiveness score.
 *
 * A high score means the current price offers attractive buy odds first,
 * then receives confirmation from one of three setup paths: left-side reversal,
 * trend pullback, or right-side breakout.
 */
export function calculateStockScore(
  dailyCandles: Candle[],
  dailyEMAs: { ema5: number[]; ema10: number[]; ema20: number[]; ema60: number[] },
  dailyMACD: { dif: number[]; dea: number[]; hist: number[] },
  dailyKDJ: { k: number[]; d: number[]; j: number[] },
  dailyRSI: number[],
  dailyATR: number[],
  dailyIchimoku: IchimokuResult,
  dailyVolumeAnalysis: VolumeAnalysisResult,
  dailyPatternResult: PatternResult,
  dailyWaveResult: WaveAnalysisResult,
  dailySupportResistance: SupportResistanceResult,
  dailyChanLunResult: ChanLunResult,
  weeklyCandles: Candle[],
  weeklyEMAs: { ema5: number[]; ema10: number[]; ema20: number[]; ema60: number[] },
  weeklyMACD: { dif: number[]; dea: number[]; hist: number[] }
): ScoreDetail {
  const scoreReasons: string[] = [];
  const latestD = dailyCandles.length - 1;
  const latestW = weeklyCandles.length - 1;

  if (latestD < 0) {
    return {
      baseTrendScore: 0,
      momentumScore: 0,
      volumeScore: 0,
      patternsScore: 0,
      weeklyResonanceScore: 0,
      totalScore: 0,
      scoreReasons: ["数据不足"],
    };
  }

  const currentPrice = dailyCandles[latestD].close;
  const prevPrice = dailyCandles[latestD - 1]?.close ?? currentPrice;
  const dayChangePct = prevPrice ? pctDistance(currentPrice, prevPrice) : 0;

  const de5 = valueAt(dailyEMAs.ema5, latestD);
  const de10 = valueAt(dailyEMAs.ema10, latestD);
  const de20 = valueAt(dailyEMAs.ema20, latestD);
  const de60 = valueAt(dailyEMAs.ema60, latestD);
  const distFromEma20 = isValid(de20) ? pctDistance(currentPrice, de20) : 0;
  const distFromEma60 = isValid(de60) ? pctDistance(currentPrice, de60) : 0;
  const atr = valueAt(dailyATR, latestD);
  const atrPct = isValid(atr) && currentPrice ? (atr / currentPrice) * 100 : 0;
  const maxHealthyStopPct = Math.max(6, atrPct > 0 ? atrPct * 2.5 : 6);

  const vpvr = dailySupportResistance.volumeProfile;
  const fibLevels = dailyPatternResult.fibonacciLevels.map((level) => level.price);
  const structuralLevels = [vpvr.poc, vpvr.valueAreaHigh, vpvr.valueAreaLow, dailySupportResistance.volumePOC];
  const supportPool = [
    ...dailySupportResistance.horizontalSupports,
    ...dailySupportResistance.volumeSupportNodes,
    dailySupportResistance.dynamicSupportEMA20,
    dailySupportResistance.dynamicSupportEMA60,
    dailySupportResistance.dynamicBOLLLower,
    ...structuralLevels,
    ...fibLevels,
  ];
  const resistancePool = [
    ...dailySupportResistance.horizontalResistances,
    ...dailySupportResistance.volumeResistanceNodes,
    dailySupportResistance.dynamicBOLLUpper,
    ...structuralLevels,
    ...fibLevels,
  ];

  const supportLevels = levelsBelow(supportPool, currentPrice);
  const resistanceLevels = levelsAbove(resistancePool, currentPrice);
  const fallbackRiskUnit = Math.max(isValid(atr) ? atr * 2 : 0, currentPrice * 0.05);
  const fallbackRewardUnit = Math.max(isValid(atr) ? atr * 3 : 0, currentPrice * 0.08);
  const minMeaningfulTargetPct = Math.max(4, atrPct > 0 ? atrPct * 1.5 : 4);
  const nearestSupport = supportLevels[0] ?? Math.max(0.01, currentPrice - fallbackRiskUnit);
  const nearestResistance = resistanceLevels.find((level) => pctFromCurrent(currentPrice, level) >= minMeaningfulTargetPct)
    ?? resistanceLevels[0]
    ?? currentPrice + fallbackRewardUnit;
  const downsidePct = Math.max(0.1, ((currentPrice - nearestSupport) / currentPrice) * 100);
  const upsidePct = Math.max(0, ((nearestResistance - currentPrice) / currentPrice) * 100);
  const rewardRisk = upsidePct / downsidePct;
  const supportWindowPct = Math.max(2.5, Math.min(6, atrPct > 0 ? atrPct * 1.2 : 2.5));
  const supportConfluence = supportLevels.filter((level) => pctFromCurrent(currentPrice, level) <= supportWindowPct).length;
  const nearestFibSupport = levelsBelow(fibLevels, currentPrice)[0];
  const nearestFibResistance = levelsAbove(fibLevels, currentPrice)[0];
  const nearFibSupport = isValid(nearestFibSupport) && pctFromCurrent(currentPrice, nearestFibSupport) <= supportWindowPct;
  const nearFibResistance = isValid(nearestFibResistance) && pctFromCurrent(currentPrice, nearestFibResistance) <= supportWindowPct;
  const inValueArea = isValid(vpvr.valueAreaLow) && isValid(vpvr.valueAreaHigh) && currentPrice >= vpvr.valueAreaLow && currentPrice <= vpvr.valueAreaHigh;
  const belowValueArea = isValid(vpvr.valueAreaLow) && currentPrice < vpvr.valueAreaLow;
  const aboveValueArea = isValid(vpvr.valueAreaHigh) && currentPrice > vpvr.valueAreaHigh;

  let baseTrendScore = 0;
  if (rewardRisk >= 3 && downsidePct <= maxHealthyStopPct) {
    baseTrendScore = 1.35;
  } else if (rewardRisk >= 2.2 && downsidePct <= maxHealthyStopPct * 1.2) {
    baseTrendScore = 1.15;
  } else if (rewardRisk >= 1.6) {
    baseTrendScore = 0.9;
  } else if (rewardRisk >= 1.1) {
    baseTrendScore = 0.6;
  } else if (rewardRisk >= 0.8) {
    baseTrendScore = 0.35;
  } else {
    baseTrendScore = 0.15;
  }

  scoreReasons.push(`买入赔率约 ${rewardRisk.toFixed(1)}:1，上行空间 ${upsidePct.toFixed(1)}%，下行风险 ${downsidePct.toFixed(1)}%`);

  if (supportConfluence >= 3) {
    baseTrendScore += 0.2;
    scoreReasons.push("支撑、均线、筹码或斐波纳契形成多重共振，止损依据更清晰 (+0.2)");
  } else if (supportConfluence >= 2) {
    baseTrendScore += 0.1;
    scoreReasons.push("附近存在两类支撑依据，买入位置具备一定防守性 (+0.1)");
  }

  if (nearFibSupport) {
    baseTrendScore += 0.1;
    scoreReasons.push(`价格靠近斐波纳契支撑 ${nearestFibSupport.toFixed(2)}，赔率可信度提升 (+0.1)`);
  }
  if (inValueArea) {
    baseTrendScore += 0.1;
    scoreReasons.push("价格位于 VPVR 价值区内，筹码承接相对充分 (+0.1)");
  } else if (belowValueArea) {
    baseTrendScore -= 0.1;
    scoreReasons.push("价格低于 VPVR 价值区，筹码结构仍需修复 (-0.1)");
  }
  if (downsidePct > maxHealthyStopPct * 1.5) {
    baseTrendScore -= 0.25;
    scoreReasons.push("止损距离偏大，买入赔率需要打折 (-0.25)");
  } else if (downsidePct > maxHealthyStopPct) {
    baseTrendScore -= 0.15;
    scoreReasons.push("下方风险略大于健康止损范围，仓位吸引力下降 (-0.15)");
  }
  baseTrendScore = clamp(baseTrendScore, 0, 1.6);

  const dif = valueAt(dailyMACD.dif, latestD);
  const dea = valueAt(dailyMACD.dea, latestD);
  const hist = valueAt(dailyMACD.hist, latestD);
  const prevDif = strictValueAt(dailyMACD.dif, latestD - 1);
  const prevDea = strictValueAt(dailyMACD.dea, latestD - 1);
  const prevHist = strictValueAt(dailyMACD.hist, latestD - 1);
  const isGoldCross = isValid(dif) && isValid(dea) && isValid(prevDif) && isValid(prevDea) && dif > dea && prevDif <= prevDea;
  const macdBullish = isValid(dif) && isValid(dea) && dif > dea;
  const macdAboveZero = isValid(dif) && isValid(dea) && isValid(hist) && dif > 0 && dif > dea && hist > 0;
  const macdRepair = isValid(dif) && isValid(dea) && dif < 0 && dif > dea;
  const macdAccelerating = macdAboveZero && (!isValid(prevHist) || (isValid(hist) && hist >= prevHist));

  const k = valueAt(dailyKDJ.k, latestD);
  const d = valueAt(dailyKDJ.d, latestD);
  const kdjLowGold = isValid(k) && isValid(d) && k > d && d < 30;
  const kdjMidGold = isValid(k) && isValid(d) && k > d && d >= 30 && d <= 70;
  const kdjHighDead = isValid(k) && isValid(d) && k < d && d > 80;
  const rsi = valueAt(dailyRSI, latestD);
  const rsiOversold = isValid(rsi) && rsi < 35;
  const rsiNeutral = isValid(rsi) && rsi >= 40 && rsi <= 60;
  const rsiStrongButNotHot = isValid(rsi) && rsi > 60 && rsi < 72;
  const rsiOverheated = isValid(rsi) && rsi >= 72;
  const bottomDivergence = dailyPatternResult.macdDivergence === "bottom" || dailyPatternResult.rsiDivergence === "bottom" || dailyPatternResult.kdjDivergence === "bottom";
  const topDivergence = dailyPatternResult.macdDivergence === "top" || dailyPatternResult.rsiDivergence === "top" || dailyPatternResult.kdjDivergence === "top";

  const bullishPatterns = dailyPatternResult.activePatterns.filter((pattern) => pattern.bias === "bullish");
  const bearishPatterns = dailyPatternResult.activePatterns.filter((pattern) => pattern.bias === "bearish");
  const neutralPatterns = dailyPatternResult.activePatterns.filter((pattern) => pattern.bias === "neutral");
  const hasBullishReversalPattern = hasPattern(bullishPatterns, BULLISH_REVERSAL_PATTERNS);
  const hasBullishBreakoutPattern = hasPattern(bullishPatterns, BULLISH_BREAKOUT_PATTERNS);
  const hasBearishTopPattern = hasPattern(bearishPatterns, BEARISH_TOP_PATTERNS);
  const dailyUptrend = isValid(de20) && isValid(de60) && de20 > de60 && currentPrice >= de60;
  const dailyStrongTrend = isValid(de5) && isValid(de10) && isValid(de20) && isValid(de60) && de5 > de10 && de10 > de20 && de20 > de60;
  const nearEma20 = isValid(de20) && Math.abs(distFromEma20) <= 4;
  const nearEma60 = isValid(de60) && Math.abs(distFromEma60) <= 5;
  const cmfVal = valueAt(dailyVolumeAnalysis.cmf, latestD);

  const weeklyClose = weeklyCandles[latestW]?.close;
  const we5 = valueAt(weeklyEMAs.ema5, latestW);
  const we10 = valueAt(weeklyEMAs.ema10, latestW);
  const we20 = valueAt(weeklyEMAs.ema20, latestW);
  const we60 = valueAt(weeklyEMAs.ema60, latestW);
  const weeklyTrendUp = isValid(weeklyClose) && isValid(we20) && isValid(we60) && we20 > we60 && weeklyClose >= we20;
  const weeklyStrongTrend = isValid(we5) && isValid(we10) && isValid(we20) && isValid(we60) && we5 > we10 && we10 > we20 && we20 > we60;
  const weeklyTrendDown = isValid(we5) && isValid(we10) && isValid(we20) && isValid(we60) && we5 < we10 && we10 < we20 && we20 < we60;
  const chanlunBottomHint = dailyChanLunResult.chanlunDescription.includes("底分型");
  const chanlunTopHint = dailyChanLunResult.chanlunDescription.includes("顶分型");

  let leftSetupScore = 0;
  if (dailyPatternResult.tdSignal === "Buy Setup 9") leftSetupScore += 0.22;
  if (bottomDivergence) leftSetupScore += 0.25;
  if (rsiOversold) leftSetupScore += 0.2;
  if (kdjLowGold) leftSetupScore += 0.2;
  if (macdRepair || isGoldCross) leftSetupScore += 0.18;
  if (hasBullishReversalPattern) leftSetupScore += 0.18;
  if (nearFibSupport || supportConfluence >= 2 || inValueArea) leftSetupScore += 0.12;
  if (chanlunBottomHint) leftSetupScore += 0.1;
  leftSetupScore = clamp(leftSetupScore, 0, 1.2);

  let pullbackSetupScore = 0;
  if (dailyUptrend) pullbackSetupScore += 0.25;
  if (weeklyTrendUp || weeklyStrongTrend) pullbackSetupScore += 0.2;
  if (nearEma20 || nearEma60) pullbackSetupScore += 0.25;
  if (rsiNeutral || rsiStrongButNotHot) pullbackSetupScore += 0.15;
  if (macdBullish || macdAccelerating) pullbackSetupScore += 0.15;
  if (kdjMidGold) pullbackSetupScore += 0.08;
  if (isValid(cmfVal) && cmfVal > 0.05) pullbackSetupScore += 0.1;
  if (inValueArea || supportConfluence >= 2) pullbackSetupScore += 0.1;
  if (dailyIchimoku.cloudSignal === "bullish") pullbackSetupScore += 0.1;
  if (dailyChanLunResult.currentStrokeDirection === "up" && !chanlunTopHint) pullbackSetupScore += 0.1;
  pullbackSetupScore = clamp(pullbackSetupScore, 0, 1.2);

  let breakoutSetupScore = 0;
  if (hasBullishBreakoutPattern) breakoutSetupScore += 0.25;
  if (dailyVolumeAnalysis.hasVolumeBreakout && dayChangePct > 0) breakoutSetupScore += 0.2;
  if (macdAboveZero) breakoutSetupScore += 0.2;
  if (dailyStrongTrend) breakoutSetupScore += 0.15;
  if (aboveValueArea && rewardRisk >= 1.2) breakoutSetupScore += 0.1;
  if (rsiStrongButNotHot) breakoutSetupScore += 0.1;
  if (dayChangePct > 4 || distFromEma20 > 12 || rsiOverheated) breakoutSetupScore -= 0.3;
  if (nearFibResistance && rewardRisk < 1.4) breakoutSetupScore -= 0.1;
  breakoutSetupScore = clamp(breakoutSetupScore, 0, 1.2);

  const setupScores = [
    { name: "左侧反转", score: leftSetupScore },
    { name: "趋势回踩", score: pullbackSetupScore },
    { name: "右侧突破", score: breakoutSetupScore },
  ].sort((a, b) => b.score - a.score);
  const bestSetup = setupScores[0];
  const momentumScore = bestSetup.score;
  if (momentumScore > 0) {
    scoreReasons.push(`${bestSetup.name}路径当前确认度最高 (+${momentumScore.toFixed(2)})`);
  }

  let volumePoints = 0;
  if (isValid(cmfVal)) {
    if (cmfVal > 0.15) {
      volumePoints += 0.3;
      scoreReasons.push(`CMF 显示资金净流入 (CMF: ${cmfVal.toFixed(2)}) (+0.3)`);
    } else if (cmfVal > 0.05) {
      volumePoints += 0.18;
      scoreReasons.push(`CMF 温和净流入 (CMF: ${cmfVal.toFixed(2)}) (+0.18)`);
    } else if (cmfVal < -0.15) {
      volumePoints -= 0.3;
      scoreReasons.push(`CMF 显示资金流出，承接不足 (CMF: ${cmfVal.toFixed(2)}) (-0.3)`);
    } else if (cmfVal < -0.05) {
      volumePoints -= 0.15;
      scoreReasons.push(`CMF 偏流出，资金确认度不足 (CMF: ${cmfVal.toFixed(2)}) (-0.15)`);
    }
  }

  const obv = dailyVolumeAnalysis.obv;
  const latestObv = valueAt(obv, latestD);
  const obvWindow = obv.slice(Math.max(0, latestD - 10), latestD).filter(isValid);
  if (isValid(latestObv) && obvWindow.length > 0) {
    const obvAverage = obvWindow.reduce((sum, value) => sum + value, 0) / obvWindow.length;
    if (latestObv > obvAverage) {
      volumePoints += 0.15;
      scoreReasons.push("OBV 高于近端均值，资金承接较健康 (+0.15)");
    }
  }

  if (dailyVolumeAnalysis.isVolumeExpanding) {
    volumePoints += 0.1;
    scoreReasons.push("近期成交量扩张，确认度改善 (+0.1)");
  }

  if (dailyVolumeAnalysis.hasVolumeBreakout) {
    if (dayChangePct > 4 || distFromEma20 > 12) {
      volumePoints -= 0.2;
      scoreReasons.push("放量急涨且价格偏离均线，热度高于买入赔率 (-0.2)");
    } else if (dayChangePct > 0) {
      volumePoints += 0.18;
      scoreReasons.push("温和放量上行，突破质量尚可 (+0.18)");
    } else {
      volumePoints -= 0.2;
      scoreReasons.push("放量下跌，卖压放大 (-0.2)");
    }
  }

  if (dailyVolumeAnalysis.hasPriceVolumeDivergence) {
    volumePoints -= 0.25;
    scoreReasons.push("量价背离，买入确认度下降 (-0.25)");
  }
  const volumeScore = clamp(volumePoints, 0, 0.9);

  let patternPoints = 0;
  if (dailyPatternResult.tdSignal === "Buy Setup 9") {
    patternPoints += 0.15;
    scoreReasons.push("TD Buy Setup 9 提供左侧反转依据 (+0.15)");
  } else if (dailyPatternResult.tdSignal === "Sell Setup 9") {
    patternPoints -= 0.2;
    scoreReasons.push("TD Sell Setup 9 提示趋势衰竭风险 (-0.2)");
  }

  if (bottomDivergence) {
    patternPoints += 0.22;
    scoreReasons.push("出现底背离，左侧性价比改善 (+0.22)");
  }
  if (topDivergence) {
    patternPoints -= 0.25;
    scoreReasons.push("出现顶背离，追高风险上升 (-0.25)");
  }

  if (bullishPatterns.length > 0) {
    const add = Math.min(0.35, bullishPatterns.reduce((sum, pattern) => sum + pattern.confidence, 0) * 0.18);
    patternPoints += add;
    scoreReasons.push(`看多形态参与评分：${patternNames(bullishPatterns)} (+${add.toFixed(2)})`);
  }
  if (bearishPatterns.length > 0) {
    const deduct = Math.min(0.45, bearishPatterns.reduce((sum, pattern) => sum + pattern.confidence, 0) * 0.2);
    patternPoints -= deduct;
    scoreReasons.push(`看空形态压制买点：${patternNames(bearishPatterns)} (-${deduct.toFixed(2)})`);
  }
  if (neutralPatterns.length > 0) {
    scoreReasons.push(`中性整理形态：${patternNames(neutralPatterns)}，等待突破确认 (0)`);
  }

  if (nearFibSupport) {
    patternPoints += 0.15;
    scoreReasons.push("斐波纳契支撑与当前价格接近，结构防守位更明确 (+0.15)");
  } else if (nearFibResistance && rewardRisk < 1.4) {
    patternPoints -= 0.1;
    scoreReasons.push("价格靠近斐波纳契压力，向上赔率受限 (-0.1)");
  }

  if (chanlunBottomHint) {
    patternPoints += 0.15;
    scoreReasons.push("缠论提示潜在底分型，左侧修复概率提高 (+0.15)");
  } else if (chanlunTopHint) {
    patternPoints -= 0.15;
    scoreReasons.push("缠论提示潜在顶分型，追买风险上升 (-0.15)");
  } else if (dailyChanLunResult.currentStrokeDirection === "up") {
    patternPoints += 0.08;
    scoreReasons.push("缠论当前向上笔延续，结构方向偏多 (+0.08)");
  } else if (dailyChanLunResult.currentStrokeDirection === "down") {
    patternPoints -= 0.05;
    scoreReasons.push("缠论当前仍处向下笔，买点需等待确认 (-0.05)");
  }

  const waveContribution = clamp(dailyWaveResult.waveScoreContribution, -0.2, 0.25);
  patternPoints += waveContribution;
  if (waveContribution > 0) {
    scoreReasons.push(`波浪结构指向 ${dailyWaveResult.currentWave}，结构贡献 (+${waveContribution})`);
  } else if (waveContribution < 0) {
    scoreReasons.push(`波浪结构指向 ${dailyWaveResult.currentWave}，结构风险 (${waveContribution})`);
  }
  const patternsScore = clamp(patternPoints, 0, 0.9);

  let weeklyResonanceScore = latestW >= 0 ? 0.2 : 0.5;
  if (latestW >= 0) {
    if (weeklyTrendUp) {
      weeklyResonanceScore += 0.3;
      scoreReasons.push("周线中期趋势向上，日线买点有大周期支撑 (+0.3)");
    } else if (weeklyStrongTrend) {
      weeklyResonanceScore += 0.25;
      scoreReasons.push("周线 EMA 多头排列，大级别趋势配合 (+0.25)");
    } else if (weeklyTrendDown) {
      weeklyResonanceScore -= dailyUptrend ? 0.25 : 0.1;
      scoreReasons.push(dailyUptrend
        ? "日线反弹与周线空头冲突，需防反弹结束 (-0.25)"
        : "周线空头排列，大趋势仍弱 (-0.1)");
    }

    const wdif = valueAt(weeklyMACD.dif, latestW);
    const wdea = valueAt(weeklyMACD.dea, latestW);
    if (isValid(wdif) && isValid(wdea) && wdif > wdea) {
      weeklyResonanceScore += 0.15;
      scoreReasons.push("周线 MACD 动能配合，买点胜率改善 (+0.15)");
    }
  } else {
    scoreReasons.push("周线数据不足，买点背景保持中性 (+0.5)");
  }

  if (dailyIchimoku.cloudSignal === "bullish") {
    weeklyResonanceScore += 0.15;
    scoreReasons.push("Ichimoku 云图呈多头支撑，趋势胜率改善 (+0.15)");
  } else if (dailyIchimoku.cloudSignal === "bearish") {
    weeklyResonanceScore -= 0.2;
    scoreReasons.push("Ichimoku 云图呈空头压制，当前买入胜率下降 (-0.2)");
  }

  if (atrPct > 8) {
    weeklyResonanceScore -= 0.2;
    scoreReasons.push(`ATR 波动率约 ${atrPct.toFixed(1)}%，仓位胜率/赔率不稳定 (-0.2)`);
  }
  if (distFromEma20 > 15) {
    weeklyResonanceScore -= 0.2;
    scoreReasons.push(`价格较 EMA20 偏离 ${distFromEma20.toFixed(1)}%，追高风险上升 (-0.2)`);
  }
  if (rsiOverheated) {
    weeklyResonanceScore -= 0.15;
    scoreReasons.push("RSI 已进入过热区，买入安全边际下降 (-0.15)");
  }
  if (kdjHighDead) {
    weeklyResonanceScore -= 0.15;
    scoreReasons.push("KDJ 高位死叉，短线回落风险加剧 (-0.15)");
  }
  weeklyResonanceScore = clamp(weeklyResonanceScore, -0.5, 0.8);

  let totalScore = baseTrendScore + momentumScore + volumeScore + patternsScore + weeklyResonanceScore;

  if (rewardRisk < 0.9) {
    totalScore = Math.min(totalScore, 2.8);
    scoreReasons.push("买入赔率低于 0.9:1，即便指标活跃也限制总分上限");
  } else if (rewardRisk < 1.1) {
    totalScore = Math.min(totalScore, 3.1);
    scoreReasons.push("买入赔率未达到 1.1:1，暂不支持高分买点");
  }
  if (downsidePct > Math.max(10, atrPct * 3)) {
    totalScore = Math.min(totalScore, 3.4);
    scoreReasons.push("止损空间过宽，限制买点魅力分上限");
  }
  if (dailyVolumeAnalysis.hasVolumeBreakout && dayChangePct > 4 && rewardRisk < 1.2) {
    totalScore = Math.min(totalScore, 3.2);
    scoreReasons.push("放量急涨但赔率不足，按追热度而非优质买点处理");
  }
  if ((distFromEma20 > 12 && rsiOverheated) || (distFromEma20 > 18)) {
    totalScore = Math.min(totalScore, 3.4);
    scoreReasons.push("价格远离 EMA20 且动能过热，限制追买评分上限");
  }
  if (hasBearishTopPattern && rewardRisk < 1.6) {
    totalScore = Math.min(totalScore, 3.0);
    scoreReasons.push("顶部类经典形态压制，除非赔率显著改善否则不应高分");
  }
  if (belowValueArea && !bottomDivergence && dailyPatternResult.tdSignal !== "Buy Setup 9") {
    totalScore = Math.min(totalScore, 3.3);
    scoreReasons.push("价格低于 VPVR 价值区且缺少反转确认，限制评分上限");
  }

  totalScore = Number(clamp(totalScore, 0, 5).toFixed(1));

  return {
    baseTrendScore,
    momentumScore,
    volumeScore,
    patternsScore,
    weeklyResonanceScore,
    totalScore,
    scoreReasons,
  };
}

function roundScore(value: number): number {
  return Number(clamp(value, 0, 5).toFixed(1));
}

function dailyItems(snapshot: EvidenceSnapshot) {
  return snapshot.items.filter((item) => item.timeframe === "daily" && item.state !== "insufficient");
}

function atrValue(snapshot: EvidenceSnapshot): number | undefined {
  const value = dailyItems(snapshot)
    .find((item) => item.family === "atr" && typeof item.values?.value === "number")
    ?.values?.value;
  return typeof value === "number" && value > 0 ? value : undefined;
}

function buildRiskPlan(snapshot: EvidenceSnapshot): EntryAssessment["riskPlan"] {
  const price = snapshot.price;
  const atr = atrValue(snapshot) ?? price * 0.02;
  const explicitStop = snapshot.levels
    .filter((level) => level.kind === "stop" && level.price < price)
    .sort((left, right) => right.price - left.price)[0];
  const support = snapshot.levels
    .filter((level) => level.kind === "support" && level.price < price && level.strength >= 0.45)
    .sort((left, right) => right.price - left.price)[0];
  const stop = explicitStop?.price ?? (support ? support.price - atr * 0.5 : undefined);

  const targets = snapshot.levels
    .filter((level) => (level.kind === "target" || level.kind === "resistance") && level.price > price)
    .sort((left, right) => left.price - right.price);
  const meaningfulTarget = targets.find((level) => level.price - price >= atr * 0.5);
  const target = meaningfulTarget?.price;
  const risk = stop !== undefined ? price - stop : undefined;
  const rewardRisk = risk && risk > 0 && target !== undefined ? (target - price) / risk : undefined;
  return {
    stop: stop !== undefined ? Number(stop.toFixed(2)) : undefined,
    target: target !== undefined ? Number(target.toFixed(2)) : undefined,
    rewardRisk: rewardRisk !== undefined ? Number(rewardRisk.toFixed(2)) : undefined,
    stopDistancePct: risk !== undefined ? Number(((risk / price) * 100).toFixed(2)) : undefined,
  };
}

function priceLocationScore(snapshot: EvidenceSnapshot, atr: number, reasons: string[]): number {
  const support = snapshot.levels
    .filter((level) => level.kind === "support" && level.price < snapshot.price && level.strength >= 0.45)
    .sort((left, right) => right.price - left.price)[0];
  if (!support) {
    reasons.push("No reliable support is close enough to define entry location.");
    return 0.1;
  }
  const distanceInAtr = (snapshot.price - support.price) / Math.max(atr, Number.EPSILON);
  if (distanceInAtr <= 1.25) {
    reasons.push(`Price is ${distanceInAtr.toFixed(1)} ATR above typed ${support.source} support.`);
    return 1;
  }
  if (distanceInAtr <= 2.5) return 0.65;
  if (distanceInAtr <= 4) return 0.35;
  reasons.push("Price is far from the nearest reliable support.");
  return 0.1;
}

function payoffScore(riskPlan: EntryAssessment["riskPlan"], reasons: string[]): number {
  const ratio = riskPlan.rewardRisk;
  if (ratio === undefined) {
    reasons.push("A complete stop/target payoff plan is unavailable.");
    return 0;
  }
  reasons.push(`Planned reward/risk is ${ratio.toFixed(2)}:1.`);
  return ratio >= 3 ? 1.25 : ratio >= 2 ? 1.05 : ratio >= 1.5 ? 0.8 : ratio >= 1 ? 0.4 : 0.1;
}

function setupScore(snapshot: EvidenceSnapshot, items: ReturnType<typeof dailyItems>, reasons: string[]): number {
  const phaseBase: Record<EvidenceSnapshot["dailyPhase"], number> = {
    base: 0.7,
    pullback: 0.75,
    breakout: 0.65,
    range: 0.25,
    extended: 0,
    breakdown: 0,
  };
  let score = phaseBase[snapshot.dailyPhase];
  const hasFreshCross = items.some((item) =>
    ["macd", "kdj", "rsi", "ichimoku"].includes(item.family) &&
    (item.state.includes("cross") || item.state.startsWith("up_")) &&
    (item.barsSince ?? 0) <= 2 && item.direction === "bullish"
  );
  const hasBullishStructure = items.some((item) =>
    (item.family === "classicalPattern" && ["confirmed", "near_trigger"].includes(item.state) && item.direction === "bullish") ||
    (item.family === "candlestick" && item.direction === "bullish" && item.state !== "extended") ||
    item.id === "daily.momentum.bottom_divergence"
  );
  if (hasFreshCross) score += 0.25;
  if (hasBullishStructure) score += 0.25;
  const bearishStructure = items.some((item) => item.family === "classicalPattern" && item.direction === "bearish" && item.state === "confirmed");
  if (bearishStructure) {
    score -= 0.4;
    reasons.push("A confirmed bearish structure reduces setup maturity.");
  }
  if (snapshot.dailyPhase === "extended") reasons.push("The move is extended; strength is not treated as entry quality.");
  if (snapshot.dailyPhase === "breakdown") reasons.push("The daily structure is still breaking down.");
  return clamp(score, 0, 1.25);
}

function timeframeScore(snapshot: EvidenceSnapshot, reasons: string[]): number {
  if (!snapshot.dataQuality.weeklySamples || snapshot.dataQuality.missingFamilies.includes("ema")) {
    reasons.push("Weekly context is unavailable and receives no bonus.");
    return 0;
  }
  if (snapshot.weeklyRegime === "bullish") return 0.75;
  if (snapshot.weeklyRegime === "neutral") return 0.35;
  reasons.push("Weekly regime is bearish and suppresses new-entry confidence.");
  return 0;
}

function confirmationScore(items: ReturnType<typeof dailyItems>, reasons: string[]): number {
  let score = 0.1;
  const volumeBullish = items.some((item) => item.family === "volume" && item.direction === "bullish");
  const lowVolumePullback = items.some((item) => item.family === "volume" && item.values?.isLowVolumePullback === true);
  const volumeBearish = items.some((item) => item.family === "volume" && item.direction === "bearish");
  if (volumeBullish) score += 0.25;
  if (lowVolumePullback) score += 0.2;

  const freshMomentumFamilies = new Set(
    items
      .filter((item) => ["macd", "kdj", "rsi", "ichimoku"].includes(item.family) && item.direction === "bullish" && (item.state.includes("cross") || item.state.startsWith("up_")))
      .map((item) => item.family)
  );
  score += Math.min(0.3, freshMomentumFamilies.size * 0.15);
  if (items.some((item) => item.id === "daily.momentum.bottom_divergence")) score += 0.05;
  if (items.some((item) => item.family === "classicalPattern" && item.direction === "bullish" && item.state === "confirmed")) score += 0.25;
  if (items.some((item) => item.family === "candlestick" && item.direction === "bullish" && item.state === "triggered")) score += 0.15;
  if (volumeBearish) {
    score -= 0.35;
    reasons.push("Bearish volume expansion directly weakens confirmation quality.");
  }
  if (items.some((item) => item.family === "classicalPattern" && item.direction === "bearish" && item.state === "confirmed")) score -= 0.35;
  return clamp(score, 0, 0.75);
}

function scenarioStatuses(
  snapshot: EvidenceSnapshot,
  items: ReturnType<typeof dailyItems>,
  locationScore: number
): Pick<EntryAssessment, "leftStatus" | "rightStatus" | "activeSetup"> {
  if (snapshot.dailyPhase === "extended") {
    return { leftStatus: "too_late", rightStatus: "too_late", activeSetup: "none" };
  }
  const shortConfirmation = items.some((item) =>
    item.direction === "bullish" && (
      item.state.includes("cross") || item.state.startsWith("up_") ||
      item.family === "candlestick" || item.id === "daily.momentum.bottom_divergence"
    )
  ) || items.some((item) => item.family === "volume" && item.values?.isLowVolumePullback === true);
  const reversalWatch = items.some((item) =>
    (item.family === "rsi" && item.state === "oversold") ||
    (item.family === "kdj" && item.state === "low") ||
    item.id === "daily.momentum.bottom_divergence"
  );
  const leftTriggered = ["base", "pullback"].includes(snapshot.dailyPhase) && locationScore >= 0.6 && shortConfirmation && snapshot.weeklyRegime !== "bearish";
  const leftStatus: ScenarioStatus = leftTriggered ? "triggered" : reversalWatch || ["base", "pullback", "breakdown"].includes(snapshot.dailyPhase) ? "watch" : "not_formed";

  const bullishVolume = items.some((item) => item.family === "volume" && item.direction === "bullish");
  const heldRetest = items.some((item) => item.family === "volume" && item.values?.isLowVolumePullback === true);
  const rightTriggered = snapshot.dailyPhase === "breakout" && (bullishVolume || heldRetest);
  const nearBreakout = items.some((item) => item.family === "classicalPattern" && item.direction === "bullish" && item.state === "near_trigger");
  const rightStatus: ScenarioStatus = rightTriggered ? "triggered" : nearBreakout || snapshot.dailyPhase === "breakout" ? "watch" : "not_formed";
  return { leftStatus, rightStatus, activeSetup: leftTriggered ? "left" : rightTriggered ? "right" : "none" };
}

export function calculateEntryAssessment(snapshot: EvidenceSnapshot): EntryAssessment {
  const reasons: string[] = [];
  const items = dailyItems(snapshot).filter((item) => item.state !== "holder_only");
  const atr = atrValue(snapshot) ?? snapshot.price * 0.02;
  const riskPlan = buildRiskPlan(snapshot);
  const dimensions: EntryAssessment["dimensions"] = {
    priceLocation: priceLocationScore(snapshot, atr, reasons),
    payoffQuality: payoffScore(riskPlan, reasons),
    setupMaturity: setupScore(snapshot, items, reasons),
    timeframeContext: timeframeScore(snapshot, reasons),
    confirmationQuality: confirmationScore(items, reasons),
  };

  let hardCap = Math.min(5, snapshot.dataQuality.scoreCap);
  if (riskPlan.stop === undefined) {
    hardCap = Math.min(hardCap, 2.5);
    reasons.push("No executable stop: score capped at 2.5.");
  }
  if (riskPlan.rewardRisk !== undefined && riskPlan.rewardRisk < 1) {
    hardCap = Math.min(hardCap, 2.4);
    reasons.push("Reward/risk below 1.0: score capped at 2.4.");
  } else if (riskPlan.rewardRisk !== undefined && riskPlan.rewardRisk < 1.5) {
    hardCap = Math.min(hardCap, 3.2);
    reasons.push("Reward/risk below 1.5: score capped at 3.2.");
  }
  if (snapshot.dailyPhase === "extended") {
    hardCap = Math.min(hardCap, 2.8);
    reasons.push("Extended or climax phase: score capped at 2.8.");
  }
  if (snapshot.dailyPhase === "breakdown") hardCap = Math.min(hardCap, 2.9);

  const rawScore = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
  const ruleScore = roundScore(Math.min(rawScore, hardCap));
  const statuses = scenarioStatuses(snapshot, items, dimensions.priceLocation);
  return {
    ruleScore,
    aiAdjustment: 0,
    finalScore: ruleScore,
    hardCap: Number(hardCap.toFixed(1)),
    dimensions,
    ...statuses,
    riskPlan,
    reasons,
  };
}

export function toLegacyScoreDetail(assessment: EntryAssessment): ScoreDetail {
  return {
    baseTrendScore: assessment.dimensions.priceLocation + assessment.dimensions.payoffQuality,
    momentumScore: assessment.dimensions.setupMaturity,
    volumeScore: assessment.dimensions.confirmationQuality,
    patternsScore: 0,
    weeklyResonanceScore: assessment.dimensions.timeframeContext,
    totalScore: assessment.finalScore,
    scoreReasons: assessment.reasons,
  };
}
