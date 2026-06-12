import { Candle } from "./indicators";

/**
 * Calculates On-Balance Volume (OBV).
 */
export function calculateOBV(candles: Candle[]): number[] {
  const obv: number[] = [];
  if (candles.length === 0) return obv;

  let currentObv = 0;
  obv.push(currentObv);

  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      currentObv += candles[i].volume;
    } else if (candles[i].close < candles[i - 1].close) {
      currentObv -= candles[i].volume;
    }
    // If close is equal, OBV remains unchanged
    obv.push(currentObv);
  }

  return obv;
}

/**
 * Calculates Chaikin Money Flow (CMF).
 */
export function calculateCMF(candles: Candle[], period: number = 21): number[] {
  const cmf: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      cmf.push(NaN);
      continue;
    }

    let moneyFlowVolumeSum = 0;
    let volumeSum = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const high = candles[j].high;
      const low = candles[j].low;
      const close = candles[j].close;
      const volume = candles[j].volume;

      // Money Flow Multiplier
      let multiplier = 0;
      if (high !== low) {
        multiplier = ((close - low) - (high - close)) / (high - low);
      }
      
      moneyFlowVolumeSum += multiplier * volume;
      volumeSum += volume;
    }

    if (volumeSum === 0) {
      cmf.push(0);
    } else {
      cmf.push(Number((moneyFlowVolumeSum / volumeSum).toFixed(4)));
    }
  }

  return cmf;
}

export interface VolumeAnalysisResult {
  obv: number[];
  cmf: number[];
  volume20SMA: number[];
  isVolumeExpanding: boolean; // Is volume increasing over recent 5 days compared to before
  hasVolumeBreakout: boolean;  // Did today/recent close experience high-volume breakout?
  hasPriceVolumeDivergence: boolean; // Is price going up but volume/OBV declining?
  volumeDescription: string;
}

/**
 * Analyzes the volume-price dynamics and buy/sell force.
 */
export function analyzePriceVolume(candles: Candle[]): VolumeAnalysisResult {
  const obv = calculateOBV(candles);
  const cmf = calculateCMF(candles, 21);

  const length = candles.length;
  const volume20SMA: number[] = [];

  // Calculate 20-day Volume SMA
  for (let i = 0; i < length; i++) {
    if (i < 19) {
      volume20SMA.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - 19; j <= i; j++) {
        sum += candles[j].volume;
      }
      volume20SMA.push(Number((sum / 20).toFixed(0)));
    }
  }

  if (length < 20) {
    return {
      obv,
      cmf,
      volume20SMA,
      isVolumeExpanding: false,
      hasVolumeBreakout: false,
      hasPriceVolumeDivergence: false,
      volumeDescription: "数据样本不足，无法评估量价分析。",
    };
  }

  const latestIndex = length - 1;
  const todayVol = candles[latestIndex].volume;
  const volSMA = volume20SMA[latestIndex];

  // 1. Has volume breakout today?
  // Volume is 1.5x of SMA AND price changed significantly (e.g. >1.5%)
  const priceChangePercent = ((candles[latestIndex].close - candles[latestIndex - 1].close) / candles[latestIndex - 1].close) * 100;
  const hasVolumeBreakout = todayVol > volSMA * 1.5 && Math.abs(priceChangePercent) > 1.5;

  // 2. Is volume expanding over recent 5 days?
  let recentVolSum = 0;
  let prevVolSum = 0;
  for (let i = latestIndex; i > latestIndex - 5; i--) {
    recentVolSum += candles[i].volume;
  }
  for (let i = latestIndex - 5; i > latestIndex - 10; i--) {
    prevVolSum += candles[i].volume;
  }
  const isVolumeExpanding = recentVolSum > prevVolSum * 1.1;

  // 3. Price-Volume Divergence check over last 15 days
  // Let's check if close price trended up, but OBV trended down (or vice versa)
  let priceTrendUp = candles[latestIndex].close > candles[latestIndex - 10].close;
  let obvTrendDown = obv[latestIndex] < obv[latestIndex - 10];
  const hasPriceVolumeDivergence = priceTrendUp && obvTrendDown;

  // 4. Formulate volume description
  let desc = "";
  const latestCmf = cmf[latestIndex];
  
  if (hasVolumeBreakout) {
    if (priceChangePercent > 0) {
      desc += "今日呈现强劲的「放量突破」态势，买盘力道极强。";
    } else {
      desc += "今日呈现放量下跌/恐慌抛售，卖压沉重。";
    }
  } else if (isVolumeExpanding) {
    desc += "近期成交量温和放大，市场关注度回升。";
  } else {
    desc += "当前量能相对平稳或处于缩量整理阶段。";
  }

  if (hasPriceVolumeDivergence) {
    desc += " 警惕出现「量价背离」现象（价格上升但资金OBV动能衰竭），警惕多头陷阱。";
  }

  if (latestCmf > 0.1) {
    desc += ` CMF指标为 ${latestCmf.toFixed(2)}，资金呈主力净流入状态（强买力）。`;
  } else if (latestCmf < -0.1) {
    desc += ` CMF指标为 ${latestCmf.toFixed(2)}，资金呈主力净流出状态（强卖力）。`;
  } else {
    desc += " 资金流入流出相对均衡。";
  }

  return {
    obv,
    cmf,
    volume20SMA,
    isVolumeExpanding,
    hasVolumeBreakout,
    hasPriceVolumeDivergence,
    volumeDescription: desc,
  };
}
