import { ScoreDetail } from "./scoring";
import { VolumeAnalysisResult } from "./volumeForce";
import { PatternResult } from "./patterns";
import { WaveAnalysisResult } from "./waveTheory";
import { ChanLunResult } from "./chanlun";
import { SupportResistanceResult } from "./supportResistance";

export interface StructuredReport {
  overview: string;
  recommendation: string;
  technicalAnalysis: string;
}

/**
 * Generates a detailed TradingView-style structured report based on indicators, patterns, and scoring details.
 * Supports English, Japanese, Simplified Chinese, and Traditional Chinese.
 */
export function generateFallbackReport(
  symbol: string,
  price: number,
  changePercent: number,
  score: ScoreDetail,
  volume: VolumeAnalysisResult,
  patterns: PatternResult,
  wave: WaveAnalysisResult,
  chanlun: ChanLunResult,
  sr: SupportResistanceResult,
  lang: string = "zh-CN"
): StructuredReport {
  const effectiveLang = (lang === "zh-HK" || lang === "zh-TW") ? "zh-TW" : lang;

  if (effectiveLang === "en") {
    return generateEnglishReport(symbol, price, changePercent, score, volume, patterns, wave, chanlun, sr);
  } else if (effectiveLang === "ja") {
    return generateJapaneseReport(symbol, price, changePercent, score, volume, patterns, wave, chanlun, sr);
  } else if (effectiveLang === "zh-TW") {
    return generateTraditionalChineseReport(symbol, price, changePercent, score, volume, patterns, wave, chanlun, sr);
  } else {
    return generateSimplifiedChineseReport(symbol, price, changePercent, score, volume, patterns, wave, chanlun, sr);
  }
}

function generateSimplifiedChineseReport(
  symbol: string,
  price: number,
  changePercent: number,
  score: ScoreDetail,
  volume: VolumeAnalysisResult,
  patterns: PatternResult,
  wave: WaveAnalysisResult,
  chanlun: ChanLunResult,
  sr: SupportResistanceResult
): StructuredReport {
  let recommendation = "观望 (Neutral)";
  if (score.totalScore >= 4.0) {
    recommendation = "强烈买入/持有 (Strong Buy / Hold)";
  } else if (score.totalScore >= 3.0) {
    recommendation = "建议买入/关注 (Buy / Accumulate)";
  } else if (score.totalScore <= 1.5) {
    recommendation = "建议卖出/避险 (Sell / Avoid)";
  }

  let trendDesc = "";
  if (score.totalScore >= 4.0) {
    trendDesc = `当前 ${symbol} 展现出强劲的主升浪特征。日K线与周K线均线系统呈现完美的多头排列，价格稳立于 EMA20（$${sr.dynamicSupportEMA20}）及中期均线 EMA60（$${sr.dynamicSupportEMA60}）关键防守线之上。`;
  } else if (score.totalScore >= 3.0) {
    trendDesc = `当前 ${symbol} 整体处于震荡上行的多头通道中。均线系统维持偏多排列，虽然短期内面临布林上轨的压制，但中期趋势依然健康稳定。`;
  } else if (score.totalScore >= 2.0) {
    trendDesc = `当前 ${symbol} 步入多空相持的宽幅震荡整理阶段。价格在 EMA20（$${sr.dynamicSupportEMA20}）与 EMA60（$${sr.dynamicSupportEMA60}）之间反复争夺，短期均线多有纠缠，缺乏明显的单边突破动力。`;
  } else {
    trendDesc = `当前 ${symbol} 技术形态严重破位，处于显著的空头下行通道中。价格受到各短期均线系统的沉重压制，跌破了 EMA60（$${sr.dynamicSupportEMA60}）中期生死线，反弹力度十分疲软。`;
  }

  const nearestSupport = sr.horizontalSupports.length > 0 ? sr.horizontalSupports[0] : sr.dynamicBOLLLower;
  const nearestResistance = sr.horizontalResistances.length > 0 ? sr.horizontalResistances[0] : sr.dynamicBOLLUpper;
  const priceVsPoc = price >= sr.volumePOC 
    ? "当前价格在其上方运行，筹码结构对价格具有一定的安全托底作用" 
    : "当前价格在其下方运行，上方堆积的重仓套牢盘构成了反弹的持续抛压";

  let srDesc = ` 价格在关键筹码位上，临近的横向核心支撑位见 $${nearestSupport}，横向主要阻力位见 $${nearestResistance}。筹码密集分布峰值区（POC）位于 $${sr.volumePOC}，这构成了目前最核心的多空强弱分水岭，${priceVsPoc}。`;
  let flowDesc = ` 资金与动能层面，${volume.volumeDescription} 目前 MACD 能量柱呈现${volume.hasVolumeBreakout ? "放量" : "平缓"}。KDJ 指标在当前区间内${score.momentumScore >= 0.7 ? "表现出多头主导的动能释放" : "处于多空拉锯状态"}，主力资金流向（CMF）显示资金正处于${score.totalScore >= 3.0 ? "温和吸筹与净流入" : "流出与偏弱整理"}之中。`;
  let waveChanDesc = ` 结合高级理论分析，目前日线波浪指向 **${wave.currentWave}**，形态特征为“${wave.waveDescription}”。缠论画笔当前正在形成 **${chanlun.currentStrokeDirection === "up" ? "向上笔" : "向下笔"}**，并在局部显现出“${chanlun.chanlunDescription}”的精细演变。`;

  const overview = `${trendDesc}\n\n${srDesc}\n\n${flowDesc}\n\n${waveChanDesc}\n\n综合研判，该股当前综合技术评级为 **${recommendation}**。`;

  const technicalAnalysis = `### 1. 📈 均线趋势与关键形态
- **趋势概况**: ${sr.srDescription}
- **支撑压力线** (基于极值点与筹码分布计算)：
  - **压力位**: ${sr.horizontalResistances.length > 0 ? sr.horizontalResistances.map(p => `$${p}`).join(", ") : "无临近水平压力"}
  - **支撑位**: ${sr.horizontalSupports.length > 0 ? sr.horizontalSupports.map(p => `$${p}`).join(", ") : "无临近水平支撑"}
  - **筹码堆积区 (POC)**: $${sr.volumePOC}

---

### 2. ⚡ 动能指标与量价力道
- **量价表现**: ${volume.volumeDescription}
- **指标多空状态**:
  - **MACD**: ${patterns.macdDivergence !== "none" ? `触发 **MACD ${patterns.macdDivergence === "top" ? "顶背离" : "底背离"}** 信号。` : ""} 能量柱呈${volume.hasVolumeBreakout ? "放量" : "平缓"}态势。
  - **KDJ**: KDJ${patterns.kdjDivergence !== "none" ? `触发 **KDJ ${patterns.kdjDivergence === "top" ? "顶背离" : "底背离"}**；` : ""} 目前处于${score.momentumScore >= 0.7 ? "多头强劲" : "多空博弈"}区间。
  - **RSI**: 当前值表现合理${patterns.rsiDivergence !== "none" ? ` (RSI 触发 ${patterns.rsiDivergence === "top" ? "顶背离" : "底背离"})` : ""}，买卖力道适中。

---

### 3. 🎯 高级指标与经典理论
- **神奇九转 (TD Sequential)**: ${patterns.patternDescription}
- **艾略特波浪理论**: 当前分析指向 **${wave.currentWave}**。${wave.waveDescription}
- **简版缠论分析**: ${chanlun.chanlunDescription}`;

  const recommendationStr = `- **多头持仓**: ${score.totalScore >= 3.0 ? `日K处于偏多区域，可沿 EMA20 ($${sr.dynamicSupportEMA20}) 动态持股。若收盘跌破 EMA60 ($${sr.dynamicSupportEMA60})，则需减仓避险。` : "当前趋势走弱，多头持仓应适当逢高减仓，控制整体仓位比例。"}
- **左侧建仓**: ${score.totalScore >= 4.0 ? "目前量价配合良好，可于支撑位附近逐步逢低买入。" : "暂无强烈左侧底部共振信号，不建议盲目摸底。"}
- **右侧突破**: ${volume.hasVolumeBreakout && changePercent > 0 ? "放量突破已确立，短线可顺势追高，止损防守设在突破颈线位置。" : "等待价格明确放量突破上方水平阻力位后，再行进场。"}`;

  return { overview, recommendation: recommendationStr, technicalAnalysis };
}

function generateTraditionalChineseReport(
  symbol: string,
  price: number,
  changePercent: number,
  score: ScoreDetail,
  volume: VolumeAnalysisResult,
  patterns: PatternResult,
  wave: WaveAnalysisResult,
  chanlun: ChanLunResult,
  sr: SupportResistanceResult
): StructuredReport {
  let recommendation = "觀望 (Neutral)";
  if (score.totalScore >= 4.0) {
    recommendation = "強烈買入/持有 (Strong Buy / Hold)";
  } else if (score.totalScore >= 3.0) {
    recommendation = "建議買入/關注 (Buy / Accumulate)";
  } else if (score.totalScore <= 1.5) {
    recommendation = "建議賣出/避險 (Sell / Avoid)";
  }

  let trendDesc = "";
  if (score.totalScore >= 4.0) {
    trendDesc = `當前 ${symbol} 展現出強勁的主升浪特徵。日K線與周K線均線系統呈現完美的多頭排列，價格穩立於 EMA20（$${sr.dynamicSupportEMA20}）及中期均線 EMA60（$${sr.dynamicSupportEMA60}）關鍵防守線之上。`;
  } else if (score.totalScore >= 3.0) {
    trendDesc = `當前 ${symbol} 整體處於震盪上行的多頭通道中。均線系統維持偏多排列，雖然短期內面臨布林上軌的壓制，但中期趨勢依然健康穩定。`;
  } else if (score.totalScore >= 2.0) {
    trendDesc = `當前 ${symbol} 步入多空相持的寬幅震盪整理階段。價格在 EMA20（$${sr.dynamicSupportEMA20}）與 EMA60（$${sr.dynamicSupportEMA60}）之間反覆爭奪，短期均線多有糾纏，缺乏明顯的單邊突破動力。`;
  } else {
    trendDesc = `當前 ${symbol} 技術形態嚴重破位，處於顯著的空頭下行通道中。價格受到各短期均線系統的沉重壓制，跌破了 EMA60（$${sr.dynamicSupportEMA60}）中期生死線，反彈力度十分疲軟。`;
  }

  const nearestSupport = sr.horizontalSupports.length > 0 ? sr.horizontalSupports[0] : sr.dynamicBOLLLower;
  const nearestResistance = sr.horizontalResistances.length > 0 ? sr.horizontalResistances[0] : sr.dynamicBOLLUpper;
  const priceVsPoc = price >= sr.volumePOC 
    ? "當前價格在其上方運行，籌碼結構對價格具有一定的安全托底作用" 
    : "當前價格在其下方運行，上方堆積的重倉套牢盤構成了反彈的持續拋壓";

  let srDesc = ` 價格在關鍵籌碼位上，臨近的橫向核心支撐位見 $${nearestSupport}，橫向主要阻力位見 $${nearestResistance}。籌碼密集分布峰值區（POC）位於 $${sr.volumePOC}，這構成了目前最核心的多空強弱分水嶺，${priceVsPoc}。`;
  
  // Convert basic volume description markers to Traditional Chinese
  let volDescZhTW = volume.volumeDescription
    .replace(/放量突破/g, "放量突破")
    .replace(/买盘/g, "買盤")
    .replace(/卖压/g, "賣壓")
    .replace(/成交量/g, "成交量")
    .replace(/量价背离/g, "量價背離")
    .replace(/资金/g, "資金")
    .replace(/主力/g, "主力");

  let flowDesc = ` 資金與動能層面，${volDescZhTW} 目前 MACD 能量柱呈現${volume.hasVolumeBreakout ? "放量" : "平緩"}。KDJ 指標在當前區間內${score.momentumScore >= 0.7 ? "表現出多頭主導的動能釋放" : "處於多空拉鋸狀態"}，主力資金流向（CMF）顯示資金正處於${score.totalScore >= 3.0 ? "溫和吸籌與淨流入" : "流出與偏弱整理"}之中。`;
  let waveChanDesc = ` 結合高級理論分析，目前日線波浪指向 **${wave.currentWave}**，形態特徵為“${wave.waveDescription}”。纏論畫筆當前正在形成 **${chanlun.currentStrokeDirection === "up" ? "向上筆" : "向下筆"}**，並在局部顯現出“${chanlun.chanlunDescription}”的精細演變。`;

  const overview = `${trendDesc}\n\n${srDesc}\n\n${flowDesc}\n\n${waveChanDesc}\n\n綜合研判，該股當前綜合技術評級為 **${recommendation}**。`;

  const technicalAnalysis = `### 1. 📈 均線趨勢與關鍵形態
- **趨勢概況**: ${sr.srDescription}
- **支撐壓力線** (基於極值點與籌碼分布計算)：
  - **壓力位**: ${sr.horizontalResistances.length > 0 ? sr.horizontalResistances.map(p => `$${p}`).join(", ") : "無臨近水平壓力"}
  - **支撐位**: ${sr.horizontalSupports.length > 0 ? sr.horizontalSupports.map(p => `$${p}`).join(", ") : "無臨近水平支撐"}
  - **籌碼堆積區 (POC)**: $${sr.volumePOC}

---

### 2. ⚡ 動能指標與量價力道
- **量價表現**: ${volDescZhTW}
- **指標多空狀態**:
  - **MACD**: ${patterns.macdDivergence !== "none" ? `觸發 **MACD ${patterns.macdDivergence === "top" ? "頂背離" : "底背離"}** 信號。` : ""} 能量柱呈${volume.hasVolumeBreakout ? "放量" : "平緩"}態勢。
  - **KDJ**: KDJ${patterns.kdjDivergence !== "none" ? `觸發 **KDJ ${patterns.kdjDivergence === "top" ? "頂背離" : "底背離"}**；` : ""} 目前處於${score.momentumScore >= 0.7 ? "多頭強勁" : "多空博弈"}區間。
  - **RSI**: 當前值表現合理${patterns.rsiDivergence !== "none" ? ` (RSI 觸發 ${patterns.rsiDivergence === "top" ? "頂背離" : "底背離"})` : ""}，買賣力道適中。

---

### 3. 🎯 高級指標與經典理論
- **神奇九轉 (TD Sequential)**: ${patterns.patternDescription}
- **艾略特波浪理論**: 當前分析指向 **${wave.currentWave}**。${wave.waveDescription}
- **簡版纏論分析**: ${chanlun.chanlunDescription}`;

  const recommendationStr = `- **多頭持倉**: ${score.totalScore >= 3.0 ? `日K處於偏多區域，可沿 EMA20 ($${sr.dynamicSupportEMA20}) 動態持股。若收盤跌破 EMA60 ($${sr.dynamicSupportEMA60})，則需減倉避險。` : "當前趨勢走弱，多頭持倉應適當逢高減倉，控制整體倉位比例。"}
- **左側建倉**: ${score.totalScore >= 4.0 ? "目前量價配合良好，可於支撐位附近逐步逢低買入。" : "暫無強烈左側底部共振信號，不建議盲目摸底。"}
- **右側突破**: ${volume.hasVolumeBreakout && changePercent > 0 ? "放量突破已確立，短線可順勢追高，止損防守設在突破頸線位置。" : "等待價格明確放量突破上方水平阻力位後，再行進場。"}`;

  return { overview, recommendation: recommendationStr, technicalAnalysis };
}

function generateEnglishReport(
  symbol: string,
  price: number,
  changePercent: number,
  score: ScoreDetail,
  volume: VolumeAnalysisResult,
  patterns: PatternResult,
  wave: WaveAnalysisResult,
  chanlun: ChanLunResult,
  sr: SupportResistanceResult
): StructuredReport {
  let recommendation = "Neutral";
  if (score.totalScore >= 4.0) {
    recommendation = "Strong Buy / Hold";
  } else if (score.totalScore >= 3.0) {
    recommendation = "Buy / Accumulate";
  } else if (score.totalScore <= 1.5) {
    recommendation = "Sell / Avoid";
  }

  let trendDesc = "";
  if (score.totalScore >= 4.0) {
    trendDesc = `Currently, ${symbol} exhibits strong bullish features. Daily & Weekly EMAs are in a perfect bullish alignment. The price stands firmly above EMA20 ($${sr.dynamicSupportEMA20}) and EMA60 ($${sr.dynamicSupportEMA60}) key defensive lines.`;
  } else if (score.totalScore >= 3.0) {
    trendDesc = `Currently, ${symbol} is in a steady upward channel. EMA alignment remains bullish, and although facing near-term resistance at the Upper Bollinger Band, the medium-term trend remains healthy.`;
  } else if (score.totalScore >= 2.0) {
    trendDesc = `Currently, ${symbol} is consolidating in a wide range. Price is fluctuating between EMA20 ($${sr.dynamicSupportEMA20}) and EMA60 ($${sr.dynamicSupportEMA60}) with short-term averages tangled, lacking clear breakout momentum.`;
  } else {
    trendDesc = `Currently, ${symbol} has broken down technically, sliding in a bearish channel. Price is heavily suppressed by short-term EMAs and has fallen below the critical EMA60 ($${sr.dynamicSupportEMA60}) line, with very weak rebounds.`;
  }

  const nearestSupport = sr.horizontalSupports.length > 0 ? sr.horizontalSupports[0] : sr.dynamicBOLLLower;
  const nearestResistance = sr.horizontalResistances.length > 0 ? sr.horizontalResistances[0] : sr.dynamicBOLLUpper;
  const priceVsPoc = price >= sr.volumePOC 
    ? "Price is running above the POC level, meaning the major volume profile acts as a solid cushion." 
    : "Price is running below the POC level, meaning heavy overhead supply poses persistent selling pressure on rebounds.";

  let srDesc = ` Price is hovering around critical volume structures, with near-term support at $${nearestSupport} and resistance at $${nearestResistance}. The Volume Profile Point of Control (POC) is at $${sr.volumePOC}, representing the key threshold. ${priceVsPoc}`;

  // Local English volume description translator
  let volDescEn = "Volume action remains relatively flat.";
  const latestCmf = volume.cmf[volume.cmf.length - 1];
  if (volume.hasVolumeBreakout) {
    volDescEn = changePercent > 0 
      ? "Today shows a strong high-volume breakout, indicating powerful buying force." 
      : "Today shows high-volume panic selling, indicating heavy downward pressure.";
  } else if (volume.isVolumeExpanding) {
    volDescEn = "Recent volume is expanding moderately, indicating rising market attention.";
  }
  if (latestCmf > 0.05) {
    volDescEn += ` Chaikin Money Flow (CMF: ${latestCmf.toFixed(2)}) indicates institutional accumulation.`;
  } else if (latestCmf < -0.05) {
    volDescEn += ` Chaikin Money Flow (CMF: ${latestCmf.toFixed(2)}) indicates institutional distribution.`;
  }

  let flowDesc = ` In terms of volume and momentum, ${volDescEn} MACD histogram is ${volume.hasVolumeBreakout ? "expanding" : "flat"}. KDJ is currently ${score.momentumScore >= 0.7 ? "exhibiting bullish dominance" : "in a range-bound battle"}.`;
  let waveChanDesc = ` Advanced theory analysis shows Elliot Wave currently points to **${wave.currentWave}** (${wave.waveDescription}). Chanlun Stroke is currently **${chanlun.currentStrokeDirection === "up" ? "Upward" : "Downward"}**, showing '${chanlun.chanlunDescription}' in local structures.`;

  const overview = `${trendDesc}\n\n${srDesc}\n\n${flowDesc}\n\n${waveChanDesc}\n\nIn conclusion, the current technical rating for this stock is **${recommendation}**.`;

  const technicalAnalysis = `### 1. 📈 EMAs & Key Structures
- **Trend Overview**: ${sr.srDescription || "Consolidating near support/resistance."}
- **Support & Resistance Levels** (Calculated from Pivots & Volume Profile):
  - **Resistance**: ${sr.horizontalResistances.length > 0 ? sr.horizontalResistances.map(p => `$${p}`).join(", ") : "No near horizontal resistance"}
  - **Support**: ${sr.horizontalSupports.length > 0 ? sr.horizontalSupports.map(p => `$${p}`).join(", ") : "No near horizontal support"}
  - **Volume POC**: $${sr.volumePOC}

---

### 2. ⚡ Momentum & Volume Force
- **Volume Performance**: ${volDescEn}
- **Indicator Multi-Timeframe Status**:
  - **MACD**: ${patterns.macdDivergence !== "none" ? `Triggered **MACD ${patterns.macdDivergence === "top" ? "Bearish Divergence" : "Bullish Divergence"}**. ` : ""}Histogram is ${volume.hasVolumeBreakout ? "expanding" : "flat"}.
  - **KDJ**: ${patterns.kdjDivergence !== "none" ? `Triggered **KDJ ${patterns.kdjDivergence === "top" ? "Bearish" : "Bullish"} Divergence**; ` : ""}Currently in a ${score.momentumScore >= 0.7 ? "bullish-dominated" : "tug-of-war"} range.
  - **RSI**: Current value is reasonable${patterns.rsiDivergence !== "none" ? ` (RSI triggered ${patterns.rsiDivergence === "top" ? "Bearish Divergence" : "Bullish Divergence"})` : ""}.

---

### 3. 🎯 Advanced Theories
- **TD Sequential**: ${patterns.patternDescription}
- **Elliot Wave Theory**: Points to **${wave.currentWave}**. ${wave.waveDescription}
- **Chanlun Analysis**: ${chanlun.chanlunDescription}`;

  const recommendationStr = `- **Bullish Positions**: ${score.totalScore >= 3.0 ? `Daily chart is positive; hold shares using EMA20 ($${sr.dynamicSupportEMA20}) dynamically. If close falls below EMA60 ($${sr.dynamicSupportEMA60}), trim positions to manage risk.` : "Trend is weak; reduce long holdings on strength and control portfolio risk."}
- **Left-side Entry**: ${score.totalScore >= 4.0 ? "Volume-price setup is sound; consider accumulating slowly near key support levels." : "No clear left-side reversal signals yet. Bottom fishing is not recommended."}
- **Right-side Breakout**: ${volume.hasVolumeBreakout && changePercent > 0 ? "High-volume breakout confirmed; short-term traders can follow the momentum, with a stop loss set at the neckline support." : "Wait for a clean high-volume breakout above horizontal resistance before entry."}`;

  return { overview, recommendation: recommendationStr, technicalAnalysis };
}

function generateJapaneseReport(
  symbol: string,
  price: number,
  changePercent: number,
  score: ScoreDetail,
  volume: VolumeAnalysisResult,
  patterns: PatternResult,
  wave: WaveAnalysisResult,
  chanlun: ChanLunResult,
  sr: SupportResistanceResult
): StructuredReport {
  let recommendation = "中立 (Neutral)";
  if (score.totalScore >= 4.0) {
    recommendation = "買い推奨 (Strong Buy / Hold)";
  } else if (score.totalScore >= 3.0) {
    recommendation = "買い/注目 (Buy / Accumulate)";
  } else if (score.totalScore <= 1.5) {
    recommendation = "売り推奨 (Sell / Avoid)";
  }

  let trendDesc = "";
  if (score.totalScore >= 4.0) {
    trendDesc = `現在、${symbol} は強力な上昇波の特徴を示しています。日足・週足ともに移動平均線（EMA）はパーフェクトオーダー（多頭排列）を形成し、価格は EMA20（$${sr.dynamicSupportEMA20}）および中期防衛線 EMA60（$${sr.dynamicSupportEMA60}）の上を維持しています。`;
  } else if (score.totalScore >= 3.0) {
    trendDesc = `現在、${symbol} は安定した上昇チャネルを維持しています。EMAの配列は依然として買い優勢であり、短期的にはボリンジャーバンドの上限抵抗に直面していますが、中期的なトレンドは健全です。`;
  } else if (score.totalScore >= 2.0) {
    trendDesc = `現在、${symbol} は売り買い交錯のレンジ相場にあります。価格は EMA20（$${sr.dynamicSupportEMA20}）と EMA60（$${sr.dynamicSupportEMA60}）の間で推移し、短期線が絡み合っており、明確な方向感を欠いています。`;
  } else {
    trendDesc = `現在、${symbol} はテクニカル的に崩れ、下落トレンドにあります。短期EMA群による強い売り圧力に晒されており、中期生死線である EMA60（$${sr.dynamicSupportEMA60}）を下回っており、戻り歩調は非常に脆弱です。`;
  }

  const nearestSupport = sr.horizontalSupports.length > 0 ? sr.horizontalSupports[0] : sr.dynamicBOLLLower;
  const nearestResistance = sr.horizontalResistances.length > 0 ? sr.horizontalResistances[0] : sr.dynamicBOLLUpper;
  const priceVsPoc = price >= sr.volumePOC 
    ? "現在の株価は出来高POCより上方にあり、下値でのクッションとして機能します。" 
    : "現在の株価は出来高POCより下方にあり、戻り待ちの売り圧力が強まりやすい状況です。";

  let srDesc = ` 価格は出来高の節目付近を推移しており、近くの水平支持線は $${nearestSupport}、主要抵抗線は $${nearestResistance} です。出来高集中帯のピーク（POC）は $${sr.volumePOC} で、多空の攻防境界線として機能しています。${priceVsPoc}`;

  let volDescJa = "出来高は比較的横ばいで推移しています。";
  const latestCmf = volume.cmf[volume.cmf.length - 1];
  if (volume.hasVolumeBreakout) {
    volDescJa = changePercent > 0 
      ? "本日は出来高を伴う強い上昇を見せ、買いエネルギーが極めて旺盛です。" 
      : "本日は出来高を伴う投げ売り（パニック売り）が発生し、売り圧力が強い状態です。";
  } else if (volume.isVolumeExpanding) {
    volDescJa = "直近の出来高は緩やかに拡大しており、市場の注目度が高まっています。";
  }
  if (latestCmf > 0.05) {
    volDescJa += ` チャイキン・マネー・フロー (CMF: ${latestCmf.toFixed(2)}) は大口資金の買い越しを示唆。`;
  } else if (latestCmf < -0.05) {
    volDescJa += ` チャイキン・マネー・フロー (CMF: ${latestCmf.toFixed(2)}) は大口資金の売り越しを示唆。`;
  }

  let flowDesc = ` 資金とモメンタム面では、${volDescJa} MACDヒストグラムは${volume.hasVolumeBreakout ? "拡大" : "安定"}しています。KDJ指標は現在、${score.momentumScore >= 0.7 ? "買い手優位の勢い" : "売り買い拮抗"}のレンジです。`;
  let waveChanDesc = ` 高度な波形理論によると、エリオット波動は現在 **${wave.currentWave}** (${wave.waveDescription}) を示しています。纏論（チャンルン）のストロークは現在 **${chanlun.currentStrokeDirection === "up" ? "上向き" : "下向き"}** で、部分的に「${chanlun.chanlunDescription}」の局面に入っています。`;

  const overview = `${trendDesc}\n\n${srDesc}\n\n${flowDesc}\n\n${waveChanDesc}\n\n総合判定として、本銘柄の現在の評価は **${recommendation}** です。`;

  const technicalAnalysis = `### 1. 📈 移動平均線と構造
- **トレンド概況**: ${sr.srDescription || "レジスタンス・サポートライン近辺での調整中。"}
- **支持線・抵抗線** (ピボット値・出来高プロファイルから計算)：
  - **抵抗線**: ${sr.horizontalResistances.length > 0 ? sr.horizontalResistances.map(p => `$${p}`).join(", ") : "近くに水平抵抗線なし"}
  - **支持線**: ${sr.horizontalSupports.length > 0 ? sr.horizontalSupports.map(p => `$${p}`).join(", ") : "近くに水平支持線なし"}
  - **価格帯別出来高 POC**: $${sr.volumePOC}

---

### 2. ⚡ モメンタムと出来高の力
- **出来高パフォーマンス**: ${volDescJa}
- **インジケーターマルチ時間軸状態**:
  - **MACD**: ${patterns.macdDivergence !== "none" ? `**MACD ${patterns.macdDivergence === "top" ? "天井ダイバージェンス" : "底ダイバージェンス"}** が発生。` : ""}ヒストグラムは${volume.hasVolumeBreakout ? "拡大" : "横ばい"}傾向。
  - **KDJ**: ${patterns.kdjDivergence !== "none" ? `**KDJ ${patterns.kdjDivergence === "top" ? "弱気" : "強気"}ダイバージェンス** が発生; ` : ""}現在、${score.momentumScore >= 0.7 ? "買い優勢" : "拮抗"}レンジ。
  - **RSI**: 現在のRSIは適正水準です${patterns.rsiDivergence !== "none" ? ` (RSIダイバージェンス ${patterns.rsiDivergence === "top" ? "天井" : "底"})` : ""}。

---

### 3. 🎯 先進分析モデル
- **TD シーケンシャル**: ${patterns.patternDescription}
- **エリオット波動**: 現在の分析は **${wave.currentWave}** 指向。 ${wave.waveDescription}
- **纏論 (チャンルン) 分析**: ${chanlun.chanlunDescription}`;

  const recommendationStr = `- **買い建玉保有者**: ${score.totalScore >= 3.0 ? `日足は買い優勢です。EMA20 ($${sr.dynamicSupportEMA20}) を支持線として買い玉を維持できます。終値で EMA60 ($${sr.dynamicSupportEMA60}) を下回る場合は、一部利益確定・リスクヘッジを推奨します。` : "下落傾向です。反発局面での一部手仕舞いを検討し、資金保全に努めるべきです。"}
- **押し目買い (左側エントリー)**: ${score.totalScore >= 4.0 ? "出来高と株価の相関は良好。支持線付近での段階的な押し目買いが可能です。" : "反転のシグナルは未だ不十分です。安易なナンピン買いは避けるべきです。"}
- **順張り突破 (右側エントリー)**: ${volume.hasVolumeBreakout && changePercent > 0 ? "出来高を伴う上放れ（ブレイクアウト）を確認。短期順張り追随が可能、損切りラインはブレイクした抵抗線の少し下に設定。" : "上の水平抵抗線を明確に上抜けるのを確認してからエントリーしてください。"}`;

  return { overview, recommendation: recommendationStr, technicalAnalysis };
}
