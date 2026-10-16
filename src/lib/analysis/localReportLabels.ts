import type { SignalFamily } from "./evidence";

type Names = readonly [string, string, string];
export function reportLanguageIndex(language: string): number {
  return language === "en" ? 1 : language === "ja" ? 2 : 0;
}
const families: Record<SignalFamily, Names> = {
  ema: ["EMA", "EMA", "EMA"], boll: ["BOLL", "BOLL", "BOLL"],
  ichimoku: ["一目均衡表", "Ichimoku", "一目均衡表"], macd: ["MACD", "MACD", "MACD"],
  kdj: ["KDJ", "KDJ", "KDJ"], rsi: ["RSI14", "RSI14", "RSI14"], atr: ["ATR", "ATR", "ATR"],
  volume: ["量价", "Price and volume", "価格と出来高"], cmf: ["CMF", "CMF", "CMF"], obv: ["OBV", "OBV", "OBV"],
  vpvr: ["VPVR", "VPVR", "VPVR"], horizontal: ["水平支撑阻力", "Horizontal levels", "水平支持・抵抗"],
  fibonacci: ["斐波那契", "Fibonacci", "フィボナッチ"], classicalPattern: ["经典形态", "Chart patterns", "チャートパターン"],
  candlestick: ["K线组合", "Candlesticks", "ローソク足"], tdSequential: ["神奇九转", "TD Sequential", "TDシーケンシャル"],
  elliottWave: ["艾略特波浪", "Elliott waves", "エリオット波動"], chanlun: ["缠论", "Chan structure", "纏論構造"],
};
const sections: Record<string, Names> = {
  "趋势与均线": ["趋势与均线", "Trend and averages", "トレンドと移動平均"],
  "趋势与波动": ["趋势与波动", "Trend and volatility", "トレンドと変動幅"],
  "一目均衡表": families.ichimoku,
  "动量指标": ["动量指标", "Momentum", "モメンタム"],
  "波动与风险": ["波动与风险", "Volatility and risk", "変動幅とリスク"],
  "量价关系": ["量价关系", "Price and volume", "価格と出来高"],
  "资金流向": ["资金流向", "Money flow", "資金フロー"],
  "筹码与位置": ["筹码与位置", "Volume profile and location", "価格帯別出来高と位置"],
  "支撑与压力": ["支撑与压力", "Support and resistance", "支持線と抵抗線"],
  "斐波那契": families.fibonacci, "经典形态": families.classicalPattern,
  "K线组合": families.candlestick, "神奇九转": families.tdSequential,
  "艾略特波浪": families.elliottWave,
  "缠论结构": ["缠论结构", "Chan structure", "纏論構造"],
};
export function reportFamily(family: SignalFamily, language: string): string {
  return families[family][reportLanguageIndex(language)];
}
export function reportSection(section: string, language: string): string {
  return sections[section]?.[reportLanguageIndex(language)] ?? section;
}
export function reportCommon(language: string) {
  const i = reportLanguageIndex(language);
  return {
    missing: ["暂无有效证据。", "No valid evidence available.", "有効な根拠はありません。"][i],
    provisional: ["（未完成K线，暂定）", " (incomplete bar, provisional)", "（未確定足・暫定）"][i],
    daily: ["日线", "Daily", "日足"][i], weekly: ["周线", "Weekly", "週足"][i],
    quality: ["数据状态", "Data quality", "データ品質"][i],
    dailyPending: ["当前日K未完成，日线触发为暂定信号", "The daily bar is incomplete; daily triggers are provisional.", "日足は未確定のため、日足シグナルは暫定です。"][i],
    weeklyPending: ["当前周K未完成，周线信号为暂定信号", "The weekly bar is incomplete; weekly signals are provisional.", "週足は未確定のため、週足シグナルは暫定です。"][i],
    invalidTime: ["行情快照时间无效", "The market snapshot timestamp is invalid.", "行情スナップショットの時刻が無効です。"][i],
  };
}
