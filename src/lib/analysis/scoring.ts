import { Candle, IchimokuResult } from "./indicators";
import { VolumeAnalysisResult } from "./volumeForce";
import { PatternResult } from "./patterns";
import { WaveAnalysisResult } from "./waveTheory";
import { SupportResistanceResult } from "./supportResistance";

export interface ScoreDetail {
  baseTrendScore: number;
  momentumScore: number;
  volumeScore: number;
  patternsScore: number;
  weeklyResonanceScore: number;
  totalScore: number;
  scoreReasons: string[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const isValid = (value: number | undefined) => typeof value === "number" && Number.isFinite(value);

function pctDistance(price: number, base: number): number {
  if (!base) return 0;
  return ((price - base) / base) * 100;
}

function latestValid(values: number[]): number | undefined {
  for (let i = values.length - 1; i >= 0; i--) {
    if (isValid(values[i])) return values[i];
  }
  return undefined;
}

/**
 * Computes a 0-5 buy-attractiveness score.
 *
 * A high score means the current setup has better buy/accumulate expectancy
 * based on trend quality, entry location, confirmation, and reward/risk.
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

  const de5 = dailyEMAs.ema5[latestD];
  const de10 = dailyEMAs.ema10[latestD];
  const de20 = dailyEMAs.ema20[latestD];
  const de60 = dailyEMAs.ema60[latestD];
  const distFromEma20 = isValid(de20) ? pctDistance(currentPrice, de20) : 0;
  const distFromEma60 = isValid(de60) ? pctDistance(currentPrice, de60) : 0;
  const atr = dailyATR[latestD] ?? latestValid(dailyATR);
  const atrPct = isValid(atr) && currentPrice ? (atr / currentPrice) * 100 : 0;

  let baseTrendScore = 0;
  if ([de5, de10, de20, de60].every(isValid)) {
    if (de20 > de60 && currentPrice >= de60 && currentPrice <= de20 * 1.08) {
      baseTrendScore = 1.25;
      scoreReasons.push("日线中期趋势偏多，且价格没有明显远离 EMA20，建仓位置较健康 (+1.25)");
    } else if (de5 > de10 && de10 > de20 && de20 > de60 && currentPrice <= de20 * 1.15) {
      baseTrendScore = 1.05;
      scoreReasons.push("日线 EMA 多头排列，但仍控制追高溢价，趋势质量良好 (+1.05)");
    } else if (de20 > de60) {
      baseTrendScore = 0.8;
      scoreReasons.push("日线 20EMA 位于 60EMA 上方，中线趋势改善 (+0.8)");
    } else if (currentPrice > de20 && currentPrice > de60) {
      baseTrendScore = 0.45;
      scoreReasons.push("价格重新站上 EMA20/EMA60，但趋势排列仍需确认 (+0.45)");
    } else if (de5 < de10 && de10 < de20 && de20 < de60) {
      baseTrendScore = 0;
      scoreReasons.push("日线 EMA 空头排列，当前不适合主动买入 (0)");
    } else {
      baseTrendScore = 0.25;
      scoreReasons.push("日线均线纠缠，仍处于观察区 (+0.25)");
    }

    if (distFromEma20 > 15) {
      baseTrendScore = Math.max(0, baseTrendScore - 0.45);
      scoreReasons.push(`价格较 EMA20 偏离 ${distFromEma20.toFixed(1)}%，追高风险上升 (-0.45)`);
    }
    if (atrPct > 0 && distFromEma20 > atrPct * 2.2) {
      baseTrendScore = Math.max(0, baseTrendScore - 0.25);
      scoreReasons.push("价格偏离 EMA20 超过约 2.2 倍 ATR，当前赔率不佳 (-0.25)");
    }
  } else {
    baseTrendScore = 0.45;
  }

  let momentumPoints = 0;
  const dif = dailyMACD.dif[latestD];
  const dea = dailyMACD.dea[latestD];
  const hist = dailyMACD.hist[latestD];
  const prevDif = dailyMACD.dif[latestD - 1];
  const prevDea = dailyMACD.dea[latestD - 1];
  const prevHist = dailyMACD.hist[latestD - 1];

  if (isValid(dif) && isValid(dea)) {
    const isGoldCross = dif > dea && isValid(prevDif) && isValid(prevDea) && prevDif <= prevDea;
    const isDeadCross = dif < dea && isValid(prevDif) && isValid(prevDea) && prevDif >= prevDea;

    if (dif > 0 && dif > dea && hist > 0) {
      const stillAccelerating = isValid(prevHist) ? hist >= prevHist : true;
      momentumPoints += stillAccelerating ? 0.22 : 0.08;
      scoreReasons.push(stillAccelerating
        ? "MACD 位于零轴上方且红柱扩张，趋势动能配合买点 (+0.22)"
        : "MACD 位于零轴上方但红柱收缩，趋势仍在但买点不占优 (+0.08)");
    } else if (dif < 0 && isGoldCross) {
      momentumPoints += 0.35;
      scoreReasons.push("MACD 零轴下方金叉，具备左侧修复信号 (+0.35)");
    } else if (isDeadCross) {
      momentumPoints -= 0.3;
      scoreReasons.push("MACD 死叉，短线胜率下降 (-0.3)");
    } else if (dif < 0 && dif > dea) {
      momentumPoints += 0.18;
      scoreReasons.push("MACD 零轴下方弱势反弹，空头动能收敛 (+0.18)");
    }
  }

  const k = dailyKDJ.k[latestD];
  const d = dailyKDJ.d[latestD];
  if (isValid(k) && isValid(d)) {
    if (k > d && d < 30) {
      momentumPoints += 0.3;
      scoreReasons.push("KDJ 低位金叉，左侧买点质量较好 (+0.3)");
    } else if (k < d && d > 80) {
      momentumPoints -= 0.3;
      scoreReasons.push("KDJ 高位死叉，超买回落风险加剧 (-0.3)");
    } else if (k > d && d >= 30 && d <= 70) {
      momentumPoints += 0.15;
      scoreReasons.push("KDJ 中位金叉，动能温和改善 (+0.15)");
    }
  }

  const rsi = dailyRSI[latestD];
  if (isValid(rsi)) {
    if (rsi >= 40 && rsi <= 60) {
      momentumPoints += 0.2;
      scoreReasons.push("RSI 处于 40-60 中性修复区，买点不拥挤 (+0.2)");
    } else if (rsi > 60 && rsi < 70) {
      momentumPoints += 0.12;
      scoreReasons.push("RSI 处于 60-70 强势区，但需控制追高 (+0.12)");
    } else if (rsi >= 70) {
      momentumPoints -= 0.28;
      scoreReasons.push("RSI 已进入超买区，买入安全边际下降 (-0.28)");
    } else if (rsi < 30) {
      momentumPoints += 0.15;
      scoreReasons.push("RSI 严重超卖，具备反弹观察价值 (+0.15)");
    }
  }
  const momentumScore = clamp(momentumPoints, 0, 1);

  let volumePoints = 0;
  const cmfVal = dailyVolumeAnalysis.cmf[latestD];
  if (isValid(cmfVal)) {
    if (cmfVal > 0.15) {
      volumePoints += 0.2;
      scoreReasons.push(`CMF 显示资金净流入 (CMF: ${cmfVal.toFixed(2)}) (+0.2)`);
    } else if (cmfVal > 0.05) {
      volumePoints += 0.1;
      scoreReasons.push(`CMF 温和净流入 (CMF: ${cmfVal.toFixed(2)}) (+0.1)`);
    } else if (cmfVal < -0.15) {
      volumePoints -= 0.25;
      scoreReasons.push(`CMF 显示资金流出，筹码承接不足 (CMF: ${cmfVal.toFixed(2)}) (-0.25)`);
    }
  }

  const obv = dailyVolumeAnalysis.obv;
  if (obv.length >= 10) {
    let obvSum = 0;
    for (let i = latestD - 1; i > Math.max(-1, latestD - 10); i--) {
      obvSum += obv[i] ?? 0;
    }
    const obv10SMA = obvSum / Math.min(9, obv.length - 1);
    if (obv[latestD] > obv10SMA) {
      volumePoints += 0.12;
      scoreReasons.push("OBV 位于短期均线上方，承接量能较健康 (+0.12)");
    }
  }

  if (dailyVolumeAnalysis.hasVolumeBreakout) {
    if (dayChangePct > 3 || distFromEma20 > 12) {
      volumePoints -= 0.25;
      scoreReasons.push("放量急涨且价格偏离均线，短线更偏交易热度而非低风险买点 (-0.25)");
    } else if (dayChangePct > 0) {
      volumePoints += 0.12;
      scoreReasons.push("温和放量上行，突破质量尚可 (+0.12)");
    } else {
      volumePoints -= 0.15;
      scoreReasons.push("放量下跌，卖压放大 (-0.15)");
    }
  }

  if ([de20, de60].every(isValid)) {
    if (Math.abs(distFromEma20) <= 4 && de20 >= de60) {
      volumePoints += 0.25;
      scoreReasons.push("价格靠近 EMA20 且中期趋势未坏，具备较好的回踩买入位置 (+0.25)");
    } else if (Math.abs(distFromEma60) <= 5 && de20 >= de60) {
      volumePoints += 0.2;
      scoreReasons.push("价格靠近 EMA60 支撑，风险收益比改善 (+0.2)");
    }
  }

  const nearestSupport = dailySupportResistance.horizontalSupports[0]
    ?? dailySupportResistance.volumeSupportNodes[0]
    ?? dailySupportResistance.dynamicBOLLLower
    ?? dailySupportResistance.dynamicSupportEMA60;
  const nearestResistance = dailySupportResistance.horizontalResistances[0]
    ?? dailySupportResistance.volumeResistanceNodes[0]
    ?? dailySupportResistance.dynamicBOLLUpper;

  if (isValid(nearestSupport) && isValid(nearestResistance) && nearestSupport < currentPrice && nearestResistance > currentPrice) {
    const downsidePct = Math.max(0.1, ((currentPrice - nearestSupport) / currentPrice) * 100);
    const upsidePct = ((nearestResistance - currentPrice) / currentPrice) * 100;
    const rewardRisk = upsidePct / downsidePct;

    if (rewardRisk >= 1.8 && downsidePct <= Math.max(6, atrPct * 2.5)) {
      volumePoints += 0.25;
      scoreReasons.push(`上方空间/下方风险约 ${rewardRisk.toFixed(1)}:1，当前建仓赔率较好 (+0.25)`);
    } else if (rewardRisk < 0.9) {
      volumePoints -= 0.25;
      scoreReasons.push(`距离压力位过近，空间/风险约 ${rewardRisk.toFixed(1)}:1，当前不适合追买 (-0.25)`);
    }
  }

  const vah = dailySupportResistance.volumeProfile.valueAreaHigh;
  const val = dailySupportResistance.volumeProfile.valueAreaLow;
  if (isValid(vah) && isValid(val) && val < vah) {
    if (currentPrice >= val && currentPrice <= vah) {
      volumePoints += 0.1;
      scoreReasons.push("价格位于 VPVR 价值区内，筹码承接相对充分 (+0.1)");
    } else if (currentPrice > vah && dayChangePct > 3) {
      volumePoints -= 0.15;
      scoreReasons.push("价格快速脱离 VPVR 价值区上沿，短线追买赔率下降 (-0.15)");
    } else if (currentPrice < val) {
      volumePoints -= 0.1;
      scoreReasons.push("价格低于 VPVR 价值区，筹码压力仍需修复 (-0.1)");
    }
  }

  if (dailyVolumeAnalysis.hasPriceVolumeDivergence) {
    volumePoints -= 0.2;
    scoreReasons.push("量价背离，买入确认度下降 (-0.2)");
  }
  const volumeScore = clamp(volumePoints, 0, 0.8);

  let patternPoints = 0;
  if (dailyPatternResult.tdSignal === "Buy Setup 9") {
    patternPoints += 0.35;
    scoreReasons.push("TD Buy Setup 9，左侧反转信号加分 (+0.35)");
  } else if (dailyPatternResult.tdSignal === "Sell Setup 9") {
    patternPoints -= 0.35;
    scoreReasons.push("TD Sell Setup 9，趋势衰竭风险扣分 (-0.35)");
  }

  if (
    dailyPatternResult.macdDivergence === "bottom" ||
    dailyPatternResult.rsiDivergence === "bottom" ||
    dailyPatternResult.kdjDivergence === "bottom"
  ) {
    patternPoints += 0.35;
    scoreReasons.push("出现底背离，左侧性价比改善 (+0.35)");
  }

  if (
    dailyPatternResult.macdDivergence === "top" ||
    dailyPatternResult.rsiDivergence === "top" ||
    dailyPatternResult.kdjDivergence === "top"
  ) {
    patternPoints -= 0.35;
    scoreReasons.push("出现顶背离，追高风险上升 (-0.35)");
  }

  const bullishPatterns = dailyPatternResult.activePatterns.filter((p) => p.bias === "bullish");
  const bearishPatterns = dailyPatternResult.activePatterns.filter((p) => p.bias === "bearish");
  const neutralPatterns = dailyPatternResult.activePatterns.filter((p) => p.bias === "neutral");

  if (bullishPatterns.length > 0) {
    const add = Math.min(0.35, bullishPatterns.reduce((sum, p) => sum + p.confidence, 0) * 0.12);
    patternPoints += add;
    scoreReasons.push(`看多形态确认：${bullishPatterns.map((p) => p.name).join("、")} (+${add.toFixed(2)})`);
  }
  if (bearishPatterns.length > 0) {
    const deduct = Math.min(0.4, bearishPatterns.reduce((sum, p) => sum + p.confidence, 0) * 0.14);
    patternPoints -= deduct;
    scoreReasons.push(`看空形态风险：${bearishPatterns.map((p) => p.name).join("、")} (-${deduct.toFixed(2)})`);
  }
  if (neutralPatterns.length > 0) {
    scoreReasons.push(`中性整理形态：${neutralPatterns.map((p) => p.name).join("、")}，等待突破确认 (0)`);
  }

  patternPoints += dailyWaveResult.waveScoreContribution;
  if (dailyWaveResult.waveScoreContribution > 0) {
    scoreReasons.push(`波浪结构指向 ${dailyWaveResult.currentWave}，结构贡献 (+${dailyWaveResult.waveScoreContribution})`);
  } else if (dailyWaveResult.waveScoreContribution < 0) {
    scoreReasons.push(`波浪结构指向 ${dailyWaveResult.currentWave}，结构风险 (${dailyWaveResult.waveScoreContribution})`);
  }
  const patternsScore = clamp(patternPoints, 0, 0.7);

  let weeklyResonanceScore = 0.5;
  if (latestW >= 0) {
    weeklyResonanceScore = 0;
    const we5 = weeklyEMAs.ema5[latestW];
    const we10 = weeklyEMAs.ema10[latestW];
    const we20 = weeklyEMAs.ema20[latestW];
    const we60 = weeklyEMAs.ema60[latestW];
    const weeklyClose = weeklyCandles[latestW].close;

    if ([we5, we10, we20, we60].every(isValid)) {
      if (we20 > we60 && weeklyClose >= we20) {
        weeklyResonanceScore += 0.55;
        scoreReasons.push("周线中期趋势向上，日线买点有大周期支撑 (+0.55)");
      } else if (we5 > we10 && we10 > we20 && we20 > we60) {
        weeklyResonanceScore += 0.45;
        scoreReasons.push("周线 EMA 多头排列，但需避免日线追高 (+0.45)");
      } else if (we5 < we10 && we10 < we20 && we20 < we60) {
        weeklyResonanceScore -= baseTrendScore >= 0.8 ? 0.5 : 0;
        scoreReasons.push(baseTrendScore >= 0.8
          ? "日线反弹与周线空头冲突，需防反弹结束 (-0.5)"
          : "周线空头排列，大趋势仍弱 (0)");
      }
    }

    const wdif = weeklyMACD.dif[latestW];
    const wdea = weeklyMACD.dea[latestW];
    if (isValid(wdif) && isValid(wdea) && wdif > wdea) {
      weeklyResonanceScore += 0.2;
      scoreReasons.push("周线 MACD 金叉或红柱区间，大级别动能配合 (+0.2)");
    }
  }

  if (dailyIchimoku.cloudSignal === "bullish") {
    weeklyResonanceScore += 0.2;
    scoreReasons.push("Ichimoku 云图呈多头支撑，趋势胜率改善 (+0.2)");
  } else if (dailyIchimoku.cloudSignal === "bearish") {
    weeklyResonanceScore -= 0.25;
    scoreReasons.push("Ichimoku 云图呈空头压制，当前买入胜率下降 (-0.25)");
  }

  if (atrPct > 8) {
    weeklyResonanceScore -= 0.2;
    scoreReasons.push(`ATR 波动率约 ${atrPct.toFixed(1)}%，仓位胜率/赔率不稳定 (-0.2)`);
  }
  weeklyResonanceScore = clamp(weeklyResonanceScore, -0.5, 1);

  const totalScore = Number(
    clamp(baseTrendScore + momentumScore + volumeScore + patternsScore + weeklyResonanceScore, 0, 5).toFixed(1)
  );

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
