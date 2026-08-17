import { EntryAssessment } from "./scoring";
import { EvidenceItem, EvidenceSnapshot, SIGNAL_CATALOG, SignalFamily } from "./evidence";
import { StrategyAdvice } from "./strategyAdvice";

export interface StructuredReport {
  overview: string;
  recommendation: string;
  technicalAnalysis: string;
}

export interface LocalReportInput {
  snapshot: EvidenceSnapshot;
  entryAssessment: EntryAssessment;
  strategyAdvice: StrategyAdvice;
}

const FAMILY_LABELS: Record<SignalFamily, string> = {
  ema: "EMA",
  boll: "BOLL",
  ichimoku: "一目均衡表",
  macd: "MACD",
  kdj: "KDJ",
  rsi: "RSI14",
  atr: "ATR",
  volume: "量价",
  cmf: "CMF",
  obv: "OBV",
  vpvr: "VPVR",
  horizontal: "水平支撑阻力",
  fibonacci: "斐波那契",
  classicalPattern: "经典形态",
  candlestick: "K线组合",
  tdSequential: "神奇九转",
  elliottWave: "艾略特波浪",
  chanlun: "缠论",
};

function localizedState(item: EvidenceItem, lang: string): string {
  if (lang !== "zh-CN" && lang !== "zh-TW" && lang !== "zh-HK") {
    return `${FAMILY_LABELS[item.family]} ${item.state}`;
  }

  const states: Record<string, string> = {
    golden_cross: "金叉",
    death_cross: "死叉",
    bullish: "多头",
    bearish: "空头",
    neutral: "中性/暂无触发",
    insufficient: "样本不足",
    bottom_divergence: "底背离",
    top_divergence: "顶背离",
    near_trigger: "接近触发",
    confirmed: "已确认",
    failed: "已失效",
    forming: "形成中",
    building: "进行中",
    completed: "完成9",
  };
  const state = states[item.state]
    ?? (item.state.startsWith("up_")
      ? `上穿${item.state.slice(3)}`
      : item.state.startsWith("down_")
        ? `下穿${item.state.slice(5)}`
        : item.state);
  return `${FAMILY_LABELS[item.family]}${state}`;
}

function reportLabels(lang: string) {
  if (lang === "en") return { overview: "Market view", recommendation: "Strategy", technical: "Technical evidence", holder: "Existing position", left: "New entry / left side", right: "Add / right side", exit: "Exit / stop" };
  if (lang === "ja") return { overview: "相場判断", recommendation: "戦略", technical: "テクニカル根拠", holder: "保有", left: "新規・左側", right: "追加・右側", exit: "撤退・ストップ" };
  if (lang === "zh-TW" || lang === "zh-HK") return { overview: "行情判斷", recommendation: "交易策略", technical: "技術證據", holder: "持倉", left: "開倉／左側", right: "加倉／右側", exit: "退出／止損" };
  return { overview: "行情判断", recommendation: "交易策略", technical: "技术证据", holder: "持仓", left: "开仓/左侧", right: "加仓/右侧", exit: "退出/止损" };
}

function localizedMarketContext(snapshot: EvidenceSnapshot, lang: string): string {
  const regime = snapshot.weeklyRegime;
  const phase = snapshot.dailyPhase;
  if (lang === "en") return `Weekly regime is ${regime}; daily phase is ${phase}.`;
  if (lang === "ja") {
    const regimes = { bullish: "強気", neutral: "中立", bearish: "弱気" } as const;
    const phases = { base: "底固め", pullback: "押し目", breakout: "上放れ", extended: "上昇過熱", breakdown: "下放れ", range: "もみ合い" } as const;
    return `週足は${regimes[regime]}、日足は${phases[phase]}局面です。`;
  }
  if (lang === "zh-TW" || lang === "zh-HK") {
    const regimes = { bullish: "偏多", neutral: "中性", bearish: "偏空" } as const;
    const phases = { base: "築底", pullback: "回調", breakout: "突破", extended: "漲幅延伸", breakdown: "破位", range: "震盪" } as const;
    return `週線環境${regimes[regime]}，日線處於${phases[phase]}階段。`;
  }
  const regimes = { bullish: "偏多", neutral: "中性", bearish: "偏空" } as const;
  const phases = { base: "筑底", pullback: "回调", breakout: "突破", extended: "涨幅延伸", breakdown: "破位", range: "震荡" } as const;
  return `周线环境${regimes[regime]}，日线处于${phases[phase]}阶段。`;
}

function localizedPriceText(snapshot: EvidenceSnapshot, lang: string): string {
  const price = snapshot.price.toFixed(2);
  if (lang === "en") return `${snapshot.symbol} Current price ${price};`;
  if (lang === "ja") return `${snapshot.symbol} 現在値 ${price}。`;
  if (lang === "zh-TW" || lang === "zh-HK") return `${snapshot.symbol} 目前價格 ${price}；`;
  return `${snapshot.symbol} 当前价格 ${price}；`;
}

export function generateLocalReport(input: LocalReportInput, lang: string = "zh-CN"): StructuredReport {
  const { snapshot, strategyAdvice } = input;
  const labels = reportLabels(lang);
  const overview = `### ${labels.overview}\n${localizedPriceText(snapshot, lang)}${localizedMarketContext(snapshot, lang)}`;
  const recommendation = [
    `### ${labels.recommendation}`,
    `- ${labels.holder}: ${strategyAdvice.holder.text}`,
    `- ${labels.left}: ${strategyAdvice.leftEntry.text}`,
    `- ${labels.right}: ${strategyAdvice.rightAdd.text}`,
    `- ${labels.exit}: ${strategyAdvice.exitStop.text}`,
  ].join("\n");

  const sections: string[] = [`### ${labels.technical}`];
  const orderedSections = [...new Set(SIGNAL_CATALOG.map((definition) => definition.reportSection))];
  for (const section of orderedSections) {
    sections.push(`\n#### ${section}`);
    const families = SIGNAL_CATALOG
      .filter((definition) => definition.reportSection === section)
      .map((definition) => definition.family);
    for (const family of families) {
      const familyItems = snapshot.items.filter((candidate) => candidate.family === family);
      if (familyItems.length === 0) {
        sections.push(`- ${FAMILY_LABELS[family]}：暂无有效证据。`);
        continue;
      }
      for (const evidence of familyItems) {
        const provisional = evidence.provisional ? "（未完成K线，暂定）" : "";
        sections.push(`- ${localizedState(evidence, lang)}${provisional}：${evidence.description}`);
      }
    }
  }
  if (snapshot.dataQuality.warnings.length > 0) {
    sections.push(`\n#### 数据状态\n${snapshot.dataQuality.warnings.map((warning) => `- ${warning}`).join("\n")}`);
  }
  return { overview, recommendation, technicalAnalysis: sections.join("\n") };
}
