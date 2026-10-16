import { EntryAssessment } from "./scoring";
import { EvidenceItem, EvidenceSnapshot, SIGNAL_CATALOG } from "./evidence";
import { StrategyAdvice } from "./strategyAdvice";
import { opportunityPresentation } from "./opportunityPresentation";
import { planIsExecutable } from "./opportunities";
import { reportFamily, reportSection, reportCommon } from "./localReportLabels";
import { evidenceState, localEvidenceText } from "./localEvidenceText";

export interface StructuredReport {
  overview: string;
  recommendation: string;
  technicalAnalysis: string;
}

export interface LocalReportInput {
  snapshot: EvidenceSnapshot;
  entryAssessment: Pick<EntryAssessment, "opportunity" | "currentTrend">;
  strategyAdvice: StrategyAdvice;
}

export function localizedState(item: EvidenceItem, lang: string): string {
  return evidenceState(item, lang);
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
  const { snapshot, strategyAdvice, entryAssessment } = input;
  const labels = reportLabels(lang);
  const opportunity = opportunityPresentation(entryAssessment, lang);
  const plan = entryAssessment.opportunity?.plan;
  const status = entryAssessment.opportunity?.status;
  const messages = lang === "en" ? {
    price: "Price confirmation is missing; oversold readings alone do not confirm an entry.",
    risk: "The stop and first target do not yet define an executable risk-reward plan.",
    close: "Wait for the daily close; the current signal is provisional.",
    watch: "Keep this on watch until independent improvement and entry conditions agree.",
    invalid: "This opportunity is invalidated; a new setup requires fresh confirmation.",
    late: "The entry window has passed; do not chase using the old plan.",
    ready: "Conditions are confirmed for this horizon. Respect the stop and expiry; confirmation does not guarantee a profit.",
  } : lang === "ja" ? {
    price: "価格の確認が不足しています。売られ過ぎだけではエントリー確認になりません。",
    risk: "損切りと第一目標の組み合わせは、まだ実行可能な損益条件を満たしていません。",
    close: "日足終値の確認を待ちます。現在のシグナルは暫定です。",
    watch: "独立した改善根拠とエントリー条件がそろうまで監視を続けます。",
    invalid: "この機会は無効です。新たな機会には新しい確認が必要です。",
    late: "エントリー機会は経過しています。以前の計画で追いかけません。",
    ready: "この期間の条件は確認済みです。損切りと期限を守ります。確認は利益を保証しません。",
  } : lang === "zh-TW" || lang === "zh-HK" ? {
    price: "尚缺價格確認，超賣本身不構成入場確認。",
    risk: "止損與首個目標尚未構成可執行的風險收益方案。",
    close: "等待日線收盤確認，當前訊號仍屬暫定。",
    watch: "繼續觀察，等待獨立改善證據與入場條件同時成立。",
    invalid: "本次機會已失效，新機會需要新的確認，不能沿用舊結論。",
    late: "已錯過本次低風險入場區間，不沿用舊方案追價。",
    ready: "本期限內的條件已確認，仍須遵守止損與有效期；確認不代表收益保證。",
  } : {
    price: "尚缺价格确认，超卖本身不构成入场确认。",
    risk: "止损与首个目标尚未构成可执行的风险收益方案。",
    close: "等待日线收盘确认，当前信号仍属暂定。",
    watch: "继续观察，等待独立改善证据与入场条件同时成立。",
    invalid: "本次机会已失效，新机会需要新的确认，不能沿用旧结论。",
    late: "已错过本次低风险入场区间，不沿用旧方案追价。",
    ready: "本期限内的条件已确认，仍须遵守止损与有效期；确认不代表收益保证。",
  };
  const conditions = status === "invalidated" ? [messages.invalid]
    : status === "too_late" ? [messages.late]
      : status === "triggered" ? [messages.ready]
        : [!plan?.priceConfirmed ? messages.price : undefined,
          !planIsExecutable(plan) ? messages.risk : undefined,
          !snapshot.dataQuality.dailyBarComplete ? messages.close : undefined,
          messages.watch].filter(Boolean);
  const overview = [`### ${labels.overview}`,
    `${localizedPriceText(snapshot, lang)}${localizedMarketContext(snapshot, lang)}`,
    opportunity.trend, opportunity.opportunity, ...conditions,
  ].filter(Boolean).join("\n\n");
  const recommendation = [
    `### ${labels.recommendation}`,
    `- ${labels.holder}: ${strategyAdvice.holder.text}`,
    `- ${labels.left}: ${strategyAdvice.leftEntry.text}`,
    `- ${labels.right}: ${strategyAdvice.rightAdd.text}`,
    `- ${labels.exit}: ${strategyAdvice.exitStop.text}`,
    opportunity.plan,
  ].filter(Boolean).join("\n");

  const sections: string[] = [`### ${labels.technical}`];
  const common = reportCommon(lang);
  const orderedSections = [...new Set(SIGNAL_CATALOG.map((definition) => definition.reportSection))];
  for (const section of orderedSections) {
    sections.push(`\n#### ${reportSection(section, lang)}`);
    const families = SIGNAL_CATALOG
      .filter((definition) => definition.reportSection === section)
      .map((definition) => definition.family);
    for (const family of families) {
      const familyItems = snapshot.items.filter((candidate) => candidate.family === family);
      if (familyItems.length === 0) {
        sections.push(`- ${reportFamily(family, lang)}：${common.missing}`);
        continue;
      }
      for (const evidence of familyItems) {
        const provisional = evidence.provisional ? common.provisional : "";
        const timeframe = evidence.timeframe === "weekly" ? common.weekly : common.daily;
        sections.push(`- ${timeframe} ${localizedState(evidence, lang)}${provisional}：${localEvidenceText(evidence, lang)}`);
      }
    }
  }
  if (snapshot.dataQuality.warnings.length > 0) {
    const warningTranslations: Record<string, string> = {
      "行情快照时间无效": common.invalidTime,
      "当前日K未完成，日线触发为暂定信号": common.dailyPending,
      "当前周K未完成，周线信号为暂定信号": common.weeklyPending,
    };
    sections.push(`\n#### ${common.quality}\n${snapshot.dataQuality.warnings.map((warning) => `- ${warningTranslations[warning] ?? warning}`).join("\n")}`);
  }
  return { overview, recommendation, technicalAnalysis: sections.join("\n") };
}
