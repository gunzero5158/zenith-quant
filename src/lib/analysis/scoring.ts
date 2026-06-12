import { Candle } from "./indicators";
import { VolumeAnalysisResult } from "./volumeForce";
import { PatternResult } from "./patterns";
import { WaveAnalysisResult } from "./waveTheory";

export interface ScoreDetail {
  baseTrendScore: number;
  momentumScore: number;
  volumeScore: number;
  patternsScore: number;
  weeklyResonanceScore: number;
  totalScore: number;
  scoreReasons: string[];
}

/**
 * Computes the 0-5 stock score based on Daily indicators and Weekly resonance.
 */
export function calculateStockScore(
  dailyCandles: Candle[],
  dailyEMAs: { ema5: number[]; ema10: number[]; ema20: number[]; ema60: number[] },
  dailyMACD: { dif: number[]; dea: number[]; hist: number[] },
  dailyKDJ: { k: number[]; d: number[]; j: number[] },
  dailyRSI: number[],
  dailyVolumeAnalysis: VolumeAnalysisResult,
  dailyPatternResult: PatternResult,
  dailyWaveResult: WaveAnalysisResult,
  weeklyCandles: Candle[],
  weeklyEMAs: { ema5: number[]; ema10: number[]; ema20: number[]; ema60: number[] },
  weeklyMACD: { dif: number[]; dea: number[]; hist: number[] }
): ScoreDetail {
  const scoreReasons: string[] = [];
  const latestD = dailyCandles.length - 1;
  const latestW = weeklyCandles.length - 1;

  let baseTrendScore = 0;
  let momentumScore = 0;
  let volumeScore = 0;
  let patternsScore = 0;
  let weeklyResonanceScore = 0;

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

  // --- 1. Daily Trend Score (Max 1.5) ---
  const de5 = dailyEMAs.ema5[latestD];
  const de10 = dailyEMAs.ema10[latestD];
  const de20 = dailyEMAs.ema20[latestD];
  const de60 = dailyEMAs.ema60[latestD];
  const currentPrice = dailyCandles[latestD].close;

  if (!isNaN(de5) && !isNaN(de10) && !isNaN(de20) && !isNaN(de60)) {
    if (de5 > de10 && de10 > de20 && de20 > de60) {
      baseTrendScore = 1.5;
      scoreReasons.push("日K EMA 均线多头排列，处于极强上升通道中 (+1.5分)");
    } else if (de5 > de10 && de10 > de20 && currentPrice > de20) {
      baseTrendScore = 1.0;
      scoreReasons.push("日K 均线温和上行，短期多头格局确立 (+1.0分)");
    } else if (de20 > de60) {
      baseTrendScore = 0.8;
      scoreReasons.push("日K 20日均线上穿60日均线，中线趋势走好 (+0.8分)");
    } else if (currentPrice > de20 && currentPrice > de60) {
      baseTrendScore = 0.6;
      scoreReasons.push("日K 价格突破生命线 20/60 EMA (+0.6分)");
    } else if (de5 < de10 && de10 < de20 && de20 < de60) {
      baseTrendScore = 0;
      scoreReasons.push("日K EMA 均线空头排列，处于下跌通道中 (0分)");
    } else {
      baseTrendScore = 0.3;
      scoreReasons.push("日K 均线缠绕，价格震荡筑底中 (+0.3分)");
    }
  } else {
    baseTrendScore = 0.5;
  }

  // --- 2. Daily Momentum Score (Max 1.0) ---
  const dif = dailyMACD.dif[latestD];
  const dea = dailyMACD.dea[latestD];
  const hist = dailyMACD.hist[latestD];
  const k = dailyKDJ.k[latestD];
  const d = dailyKDJ.d[latestD];
  const j = dailyKDJ.j[latestD];
  const rsi = dailyRSI[latestD];

  let momPoints = 0;
  if (!isNaN(dif) && !isNaN(dea)) {
    const isGoldCross = dif > dea && dailyMACD.dif[latestD - 1] <= dailyMACD.dea[latestD - 1];
    const isDeadCross = dif < dea && dailyMACD.dif[latestD - 1] >= dailyMACD.dea[latestD - 1];

    if (dif > 0) {
      if (dif > dea) {
        momPoints += 0.5;
        scoreReasons.push("日K MACD 处于零轴上方多头市场，运行于红柱增能区 (+0.5分)");
      } else {
        momPoints += 0.2;
        scoreReasons.push("日K MACD 处于零轴上方，但快慢线发生死叉或红柱收缩 (+0.2分)");
      }
    } else {
      if (isGoldCross) {
        momPoints += 0.4;
        scoreReasons.push("日K MACD 零轴下方发生「金叉」反弹信号 (+0.4分)");
      } else if (isDeadCross) {
        momPoints -= 0.3;
        scoreReasons.push("日K MACD 零轴下方发生「死叉」，探底行情继续 (-0.3分)");
      } else if (dif > dea) {
        momPoints += 0.2;
        scoreReasons.push("日K MACD 零轴下方弱势反弹，绿柱缩短中 (+0.2分)");
      }
    }
  }

  if (!isNaN(k) && !isNaN(d)) {
    if (k > d && d < 30) {
      momPoints += 0.3;
      scoreReasons.push("日K KDJ 处于低位超卖区，形成金叉向上共振 (+0.3分)");
    } else if (k < d && d > 80) {
      momPoints -= 0.3;
      scoreReasons.push("日K KDJ 处于高位超买区死叉，超买风险加剧 (-0.3分)");
    }
  }

  if (!isNaN(rsi)) {
    if (rsi > 50 && rsi < 70) {
      momPoints += 0.2;
      scoreReasons.push("日K RSI 处于 50-70 强势买力区间 (+0.2分)");
    } else if (rsi >= 70) {
      momPoints += 0.1;
      scoreReasons.push("日K RSI 指标已超买，需警惕短期抛压 (+0.1分)");
    } else if (rsi < 30) {
      momPoints += 0.1; // Rebound buy potential
      scoreReasons.push("日K RSI 指标严重超卖，蕴含技术面反弹契机 (+0.1分)");
    }
  }
  momentumScore = Math.max(0, Math.min(1.0, momPoints));

  // --- 3. Daily Volume & Force Score (Max 0.8) ---
  let volPoints = 0;
  const cmfVal = dailyVolumeAnalysis.cmf[latestD];

  if (!isNaN(cmfVal)) {
    if (cmfVal > 0.15) {
      volPoints += 0.3;
      scoreReasons.push(`CMF 主力资金呈强劲净流入状态 (CMF: ${cmfVal.toFixed(2)}) (+0.3分)`);
    } else if (cmfVal > 0.05) {
      volPoints += 0.15;
      scoreReasons.push(`CMF 资金面呈温和净流入 (CMF: ${cmfVal.toFixed(2)}) (+0.15分)`);
    } else if (cmfVal < -0.15) {
      volPoints -= 0.2;
      scoreReasons.push(`CMF 主力资金呈流出状态，筹码分散 (CMF: ${cmfVal.toFixed(2)}) (-0.2分)`);
    }
  }

  const obv = dailyVolumeAnalysis.obv;
  if (obv.length >= 10) {
    let obvSum = 0;
    for (let i = latestD - 1; i > latestD - 10; i--) obvSum += obv[i];
    const obv10SMA = obvSum / 9;

    if (obv[latestD] > obv10SMA) {
      volPoints += 0.2;
      scoreReasons.push("OBV 能量潮处于均线上方，量能蓄势健康 (+0.2分)");
    }
  }

  if (dailyVolumeAnalysis.hasVolumeBreakout) {
    volPoints += 0.3;
    scoreReasons.push("伴随主力资金异动，价格触发「放量突破」成交量放大确认 (+0.3分)");
  }
  volumeScore = Math.max(0, Math.min(0.8, volPoints));

  // --- 4. Special Patterns & Reversals (Max 0.7) ---
  let patPoints = 0;

  if (dailyPatternResult.tdSignal === "Buy Setup 9") {
    patPoints += 0.4;
    scoreReasons.push("日K 触发神奇九转「买入九转（TD 9）」底部反转买点 (+0.4分)");
  } else if (dailyPatternResult.tdSignal === "Sell Setup 9") {
    patPoints -= 0.3;
    scoreReasons.push("日K 触发神奇九转「卖出九转（TD 9）」趋势衰竭风险 (-0.3分)");
  }

  // Divergences
  if (dailyPatternResult.macdDivergence === "bottom" || dailyPatternResult.rsiDivergence === "bottom" || dailyPatternResult.kdjDivergence === "bottom") {
    patPoints += 0.3;
    scoreReasons.push("日K 发生底背离（价格创新低而动能指标不创新低），探底成功概率大 (+0.3分)");
  }
  if (dailyPatternResult.macdDivergence === "top" || dailyPatternResult.rsiDivergence === "top" || dailyPatternResult.kdjDivergence === "top") {
    patPoints -= 0.3;
    scoreReasons.push("日K 发生顶背离（价格创新高而动能指标衰退），谨防多头陷阱 (-0.3分)");
  }

  // Geometric breakout
  if (dailyPatternResult.isDoubleBottom || dailyPatternResult.isCupAndHandle) {
    patPoints += 0.3;
    scoreReasons.push("经典几何形态确立「W底突破 / 杯柄向上突破」 (+0.3分)");
  }
  if (dailyPatternResult.isHeadAndShoulders || dailyPatternResult.isRoundingTop) {
    patPoints -= 0.3;
    scoreReasons.push("几何形态呈现「头肩顶 / 圆弧顶」压制，中线趋势承压 (-0.3分)");
  }

  // Wave Theory resonance
  if (dailyWaveResult.waveScoreContribution > 0) {
    patPoints += dailyWaveResult.waveScoreContribution;
    scoreReasons.push(`艾略特波浪理论指向：「${dailyWaveResult.currentWave}」阶段 (+${dailyWaveResult.waveScoreContribution}分)`);
  } else if (dailyWaveResult.waveScoreContribution < 0) {
    patPoints += dailyWaveResult.waveScoreContribution; // negative
    scoreReasons.push(`艾略特波浪理论指向：「${dailyWaveResult.currentWave}」阶段 (${dailyWaveResult.waveScoreContribution}分)`);
  }

  patternsScore = Math.max(0, Math.min(0.7, patPoints));

  // --- 5. Weekly Resonance Score (Max 1.0) ---
  if (latestW >= 0) {
    const we5 = weeklyEMAs.ema5[latestW];
    const we10 = weeklyEMAs.ema10[latestW];
    const we20 = weeklyEMAs.ema20[latestW];
    const we60 = weeklyEMAs.ema60[latestW];

    let weeklyPoints = 0;
    
    if (!isNaN(we5) && !isNaN(we10) && !isNaN(we20) && !isNaN(we60)) {
      if (we5 > we10 && we10 > we20 && we20 > we60) {
        weeklyPoints += 0.8;
        scoreReasons.push("周K 长周期均线呈现多头排列，主趋势大牛格局 (+0.8分)");
      } else if (we20 > we60) {
        weeklyPoints += 0.5;
        scoreReasons.push("周K 中线维持上升通道，大方向偏多 (+0.5分)");
      } else if (we5 < we10 && we10 < we20 && we20 < we60) {
        // Weekly is strongly bearish, but Daily is bullish (pullback / bounce)
        if (baseTrendScore >= 0.8) {
          weeklyPoints -= 0.5;
          scoreReasons.push("周期矛盾：日K反弹但周线大级别呈现绝对空头压制，谨防反弹结束 (-0.5分)");
        } else {
          weeklyPoints = 0;
          scoreReasons.push("周K 长周期呈空头排列，大趋势处于熊市通道 (0分)");
        }
      }
    }

    const wdif = weeklyMACD.dif[latestW];
    const wdea = weeklyMACD.dea[latestW];
    if (!isNaN(wdif) && !isNaN(wdea)) {
      if (wdif > wdea) {
        weeklyPoints += 0.2;
        scoreReasons.push("周K MACD 维持金叉或红柱区间，大级别动能健康 (+0.2分)");
      }
    }

    weeklyResonanceScore = Math.max(-0.5, Math.min(1.0, weeklyPoints));
  } else {
    weeklyResonanceScore = 0.5; // Neutral default if weekly is empty
  }

  // Calculate final score
  const totalScore = Number(
    Math.max(0, Math.min(5.0, baseTrendScore + momentumScore + volumeScore + patternsScore + weeklyResonanceScore)).toFixed(1)
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
