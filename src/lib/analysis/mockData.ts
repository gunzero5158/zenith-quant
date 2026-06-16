import { Candle } from "./indicators";

/**
 * Generates realistic mock stock data for global markets when network fails.
 */
export function generateMockCandles(symbol: string, days: number = 250, isWeekly: boolean = false): {
  candles: Candle[];
  companyName: string;
  price: number;
  changePercent: number;
} {
  let basePrice = 150;
  let companyName = "模拟股票";
  let drift = 0.05; // annual upward drift

  const cleanSym = symbol.toUpperCase();

  if (cleanSym.includes("AAPL")) {
    basePrice = 178.58;
    companyName = "Apple Inc. (模拟数据)";
    drift = 0.12;
  } else if (cleanSym.includes("0700") || cleanSym.includes("Tencent")) {
    basePrice = 380.20;
    companyName = "腾讯控股 (0700.HK - 模拟数据)";
    drift = 0.08;
  } else if (cleanSym.includes("600519") || cleanSym.includes("MOUTAI")) {
    basePrice = 1650.00;
    companyName = "贵州茅台 (600519.SS - 模拟数据)";
    drift = -0.04; // slight downtrend
  } else if (cleanSym.includes("9984") || cleanSym.includes("SOFTBANK")) {
    basePrice = 7500.00;
    companyName = "软银集团 (9984.T - 模拟数据)";
    drift = 0.18; // high volatility
  } else {
    companyName = `${cleanSym} (模拟股票)`;
    // Generate semi-random base price based on ticker string hash
    let hash = 0;
    for (let i = 0; i < cleanSym.length; i++) {
      hash = cleanSym.charCodeAt(i) + ((hash << 5) - hash);
    }
    basePrice = Math.abs(hash % 300) + 15;
    drift = (hash % 10) / 100;
  }

  const candles: Candle[] = [];
  let currentPrice = basePrice;
  const intervalDays = isWeekly ? 7 : 1;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days * intervalDays);

  // We want to generate a realistic price curve.
  // To simulate W-bottom, cup-and-handle, we can add wave formulas (sine curves) 
  // on top of random walk + drift.
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i * intervalDays);

    // Random walk + annual drift + sine wave to create cycles (pivots, W-bottoms)
    const cycleEffect = Math.sin(i / 15) * 0.015 + Math.sin(i / 45) * 0.03;
    const randomShock = (Math.random() - 0.49) * 0.024; // volatility

    const dailyReturn = randomShock + (drift / 250) + cycleEffect / 20;
    
    const open = currentPrice;
    const close = currentPrice * (1 + dailyReturn);
    const high = Math.max(open, close) * (1 + Math.random() * 0.008);
    const low = Math.min(open, close) * (1 - Math.random() * 0.008);
    
    // Volume: higher volume on breakout days
    let volumeMultiplier = 1;
    if (Math.abs(dailyReturn) > 0.018) {
      volumeMultiplier = 2.2;
    }
    const volume = Math.floor((1500000 + Math.random() * 8500000) * volumeMultiplier);

    candles.push({
      date: date.toISOString().split("T")[0],
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });

    currentPrice = close;
  }

  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2] || lastCandle;
  const changePercent = ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100;

  return {
    candles,
    companyName,
    price: lastCandle.close,
    changePercent,
  };
}
