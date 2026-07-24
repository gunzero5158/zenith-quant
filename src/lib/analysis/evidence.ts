export const SIGNAL_FAMILIES = [
  "ema",
  "boll",
  "ichimoku",
  "macd",
  "kdj",
  "rsi",
  "atr",
  "volume",
  "cmf",
  "obv",
  "vpvr",
  "horizontal",
  "fibonacci",
  "classicalPattern",
  "candlestick",
  "tdSequential",
  "elliottWave",
  "chanlun",
] as const;

export type SignalFamily = (typeof SIGNAL_FAMILIES)[number];
export type Timeframe = "daily" | "weekly";
export type EvidenceDirection = "bullish" | "bearish" | "neutral";
export type EvidenceRole = "score" | "explainOnly";
export type EvidenceConsumer = "left" | "right" | "holder" | "exit" | "report";
export type ScenarioStatus = "not_formed" | "watch" | "triggered" | "too_late";

export interface SignalDefinition {
  family: SignalFamily;
  consumers: EvidenceConsumer[];
  reportSection: string;
  role: EvidenceRole;
  minimumSamples: Record<Timeframe, number>;
}

export interface EvidenceItem {
  id: string;
  family: SignalFamily;
  timeframe: Timeframe;
  direction: EvidenceDirection;
  state: string;
  label: string;
  description: string;
  barsSince?: number;
  provisional: boolean;
  reliability: number;
  invalidation?: string;
  values?: Record<string, number | string | boolean>;
}

export interface DataQuality {
  asOf: string;
  latestDailyDate?: string;
  latestWeeklyDate?: string;
  dailyBarComplete: boolean;
  weeklyBarComplete: boolean;
  dailySamples: number;
  weeklySamples: number;
  missingFamilies: SignalFamily[];
  scoreCap: number;
  warnings: string[];
}

export type TradeLevelKind = "support" | "resistance" | "stop" | "target";
export type TradeLevelSource =
  | "horizontal"
  | "ema"
  | "boll"
  | "vpvr"
  | "fibonacci"
  | "pattern"
  | "atr";

export interface TradeLevel {
  price: number;
  kind: TradeLevelKind;
  source: TradeLevelSource;
  strength: number;
  hits?: number;
  lastSeenIndex?: number;
}

export interface EvidenceSnapshot {
  version: "2.0";
  symbol: string;
  price: number;
  dataQuality: DataQuality;
  items: EvidenceItem[];
  levels: TradeLevel[];
  weeklyRegime: "bullish" | "neutral" | "bearish";
  dailyPhase: "base" | "pullback" | "breakout" | "extended" | "breakdown" | "range";
}

const score = (
  family: SignalFamily,
  reportSection: string,
  consumers: EvidenceConsumer[],
  daily: number,
  weekly: number
): SignalDefinition => ({
  family,
  reportSection,
  consumers,
  role: "score",
  minimumSamples: { daily, weekly },
});

export const SIGNAL_CATALOG: SignalDefinition[] = [
  score("ema", "趋势与均线", ["left", "right", "holder", "exit", "report"], 60, 60),
  score("boll", "趋势与波动", ["left", "right", "holder", "report"], 20, 20),
  score("ichimoku", "一目均衡表", ["left", "right", "holder", "exit", "report"], 52, 52),
  score("macd", "动量指标", ["left", "right", "holder", "exit", "report"], 35, 35),
  score("kdj", "动量指标", ["left", "right", "exit", "report"], 9, 9),
  score("rsi", "动量指标", ["left", "right", "holder", "exit", "report"], 15, 15),
  score("atr", "波动与风险", ["left", "right", "holder", "exit", "report"], 15, 15),
  score("volume", "量价关系", ["left", "right", "holder", "exit", "report"], 20, 10),
  score("cmf", "资金流向", ["left", "right", "holder", "exit", "report"], 21, 21),
  score("obv", "资金流向", ["left", "right", "holder", "exit", "report"], 2, 2),
  score("vpvr", "筹码与位置", ["left", "right", "holder", "exit", "report"], 20, 0),
  score("horizontal", "支撑与压力", ["left", "right", "holder", "exit", "report"], 12, 0),
  score("fibonacci", "斐波那契", ["left", "right", "holder", "exit", "report"], 20, 0),
  score("classicalPattern", "经典形态", ["left", "right", "holder", "exit", "report"], 12, 0),
  score("candlestick", "K线组合", ["left", "right", "holder", "exit", "report"], 3, 0),
  score("tdSequential", "神奇九转", ["left", "holder", "exit", "report"], 13, 0),
  {
    family: "elliottWave",
    reportSection: "艾略特波浪",
    consumers: ["report"],
    role: "explainOnly",
    minimumSamples: { daily: 20, weekly: 0 },
  },
  score("chanlun", "缠论结构", ["left", "right", "holder", "exit", "report"], 12, 0),
];
