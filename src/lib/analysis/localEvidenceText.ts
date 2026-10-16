import type { EvidenceItem } from "./evidence";
import { reportFamily, reportLanguageIndex } from "./localReportLabels";
import { localizedPatternName } from "../i18n/chartLabels";

const terms: Record<string, readonly [string, string, string]> = {
  normal: ["正常区间", "normal range", "通常範囲"],
  hammer: ["锤子线", "Hammer", "ハンマー"], invertedHammer: ["倒锤子线", "Inverted hammer", "逆ハンマー"],
  bullishEngulfing: ["看涨吞没", "Bullish engulfing", "強気包み足"], bearishEngulfing: ["看跌吞没", "Bearish engulfing", "弱気包み足"],
  piercingLine: ["刺透形态", "Piercing line", "切り込み線"], darkCloudCover: ["乌云盖顶", "Dark cloud cover", "かぶせ線"],
  morningStar: ["启明星", "Morning star", "明けの明星"], eveningStar: ["黄昏星", "Evening star", "宵の明星"],
  bullishHarami: ["看涨孕线", "Bullish harami", "強気はらみ足"], bearishHarami: ["看跌孕线", "Bearish harami", "弱気はらみ足"],
  hangingMan: ["上吊线", "Hanging man", "首吊り線"], shootingStar: ["流星线", "Shooting star", "流れ星"],
  threeWhiteSoldiers: ["红三兵", "Three white soldiers", "赤三兵"], threeBlackCrows: ["三只乌鸦", "Three black crows", "三羽烏"],
  bullishMarubozu: ["光头光脚阳线", "Bullish marubozu", "陽の丸坊主"], bearishMarubozu: ["光头光脚阴线", "Bearish marubozu", "陰の丸坊主"],
  gapUp: ["向上跳空", "Gap up", "上放れ"], gapDown: ["向下跳空", "Gap down", "下放れ"],
  insideBar: ["内包线", "Inside bar", "はらみ足"], outsideBar: ["外包线", "Outside bar", "包み足"],
  doji: ["十字星", "Doji", "十字線"], spinningTop: ["纺锤线", "Spinning top", "コマ"],
  longUpperShadow: ["长上影线", "Long upper shadow", "長い上ヒゲ"], longLowerShadow: ["长下影线", "Long lower shadow", "長い下ヒゲ"],
  extended: ["已延伸", "extended", "伸び切り"],
  "Consolidation": ["盘整/无明显波浪结构", "Consolidation", "もみ合い・明確な波動なし"],
  "Alternate Wave": ["上升浪/下跌浪交替段", "Alternate wave", "上昇・下降波の交替"],
  "Wave 4 Correction": ["第4浪回调", "Wave 4 correction", "第4波調整"],
  "Wave 5 Final Push": ["第5浪冲顶", "Wave 5 final push", "第5波の上昇"],
  "Post-C Wave Rebound": ["C浪后反弹", "Post-C wave rebound", "C波後の反発"],
  "Wave C Decline": ["C浪下跌", "Wave C decline", "C波下落"],
  "Wave 3 Impulse": ["第3浪上升", "Wave 3 impulse", "第3波上昇"],
  "Wave 2 Bottoming": ["第2浪筑底", "Wave 2 bottoming", "第2波底固め"],
  "Swing Pullback Rebound": ["波段反弹", "Swing rebound", "スイング反発"],
  "Swing Correction Pullback": ["波段回调", "Swing correction", "スイング調整"],
  bullish: ["多头", "bullish", "強気"], bearish: ["空头", "bearish", "弱気"], neutral: ["中性", "neutral", "中立"],
  golden_cross: ["金叉", "golden cross", "ゴールデンクロス"], death_cross: ["死叉", "death cross", "デッドクロス"],
  mixed: ["交错", "mixed", "交錯"], unknown: ["未确定", "unknown", "不明"], none: ["无", "none", "なし"],
  above_all: ["全部均线上方", "above all averages", "全移動平均線の上"], below_all: ["全部均线下方", "below all averages", "全移動平均線の下"],
  above: ["上方", "above", "上方"], below: ["下方", "below", "下方"], inside: ["内部", "inside", "内部"],
  above_upper: ["上轨上方", "above upper band", "上限バンドの上"], below_lower: ["下轨下方", "below lower band", "下限バンドの下"],
  upper_half: ["上半轨", "upper half", "上半分"], lower_half: ["下半轨", "lower half", "下半分"],
  above_zero: ["零轴上方", "above zero", "ゼロライン上"], below_zero: ["零轴下方", "below zero", "ゼロライン下"],
  expanding: ["扩张", "expanding", "拡大"], contracting: ["收缩", "contracting", "縮小"], flat: ["平稳", "flat", "横ばい"],
  rising: ["上升", "rising", "上昇"], falling: ["下降", "falling", "低下"], high: ["高位", "high", "高水準"], low: ["低位", "low", "低水準"],
  middle: ["中位", "middle", "中間"], oversold: ["超卖", "oversold", "売られ過ぎ"], overbought: ["超买", "overbought", "買われ過ぎ"],
  neutral_weak: ["中性偏弱", "neutral weak", "中立・弱含み"], neutral_strong: ["中性偏强", "neutral strong", "中立・強含み"],
  bottom_divergence: ["底背离", "bullish divergence", "強気ダイバージェンス"], top_divergence: ["顶背离", "bearish divergence", "弱気ダイバージェンス"],
  insufficient: ["样本不足", "insufficient samples", "サンプル不足"], near_trigger: ["接近触发", "near trigger", "発動間近"],
  confirmed: ["已确认", "confirmed", "確認済み"], unconfirmed: ["未确认", "unconfirmed", "未確認"], triggered: ["已触发", "triggered", "発動済み"],
  failed: ["已失效", "failed", "無効"], forming: ["形成中", "forming", "形成中"], building: ["进行中", "building", "進行中"], completed: ["完成9", "completed 9", "9完了"],
  support: ["支撑位", "support", "支持線"], resistance: ["阻力位", "resistance", "抵抗線"],
  support_broken: ["支撑跌破", "support broken", "支持線割れ"], support_reclaimed: ["支撑收回", "support reclaimed", "支持線回復"],
  support_held: ["支撑守住", "support held", "支持線維持"], resistance_broken: ["阻力突破", "resistance broken", "抵抗線突破"],
  local_high_break: ["局部高点突破", "local high broken", "直近高値突破"],
  above_value_area: ["价值区上方", "above value area", "バリューエリア上方"], below_value_area: ["价值区下方", "below value area", "バリューエリア下方"],
  inside_value_area: ["价值区内", "inside value area", "バリューエリア内"],
  value_area_breakout_confirmed: ["价值区放量突破确认", "value-area breakout confirmed by volume", "出来高を伴う上抜け確認"],
  value_area_breakdown_confirmed: ["价值区放量跌破确认", "value-area breakdown confirmed by volume", "出来高を伴う下抜け確認"],
  above_value_area_light_overhead: ["价值区上方、上方历史成交较少", "above value area with light overhead volume", "エリア上方・上値の過去出来高は少ない"],
  below_value_area_heavy_overhead: ["价值区下方、上方历史成交密集", "below value area with heavy overhead volume", "エリア下方・上値の過去出来高は多い"],
  light: ["较少", "light", "少ない"], moderate: ["适中", "moderate", "中程度"], heavy: ["较多", "heavy", "多い"],
  buy: ["买入序列", "buy setup", "買いセットアップ"], sell: ["卖出序列", "sell setup", "売りセットアップ"],
  forming_bottom: ["底分型形成中", "bottom fractal forming", "底フラクタル形成中"], forming_top: ["顶分型形成中", "top fractal forming", "天井フラクタル形成中"],
  up_stroke: ["向上笔", "up stroke", "上昇ストローク"], down_stroke: ["向下笔", "down stroke", "下降ストローク"],
};

export function evidenceTerm(value: unknown, language: string): string {
  const i = reportLanguageIndex(language);
  if (value === undefined || value === null) return ["未知", "unknown", "不明"][i];
  if (typeof value === "number") return Number.isFinite(value) ? String(Number(value.toFixed(4))) : ["未知", "unknown", "不明"][i];
  if (typeof value === "boolean") return (value ? ["是", "yes", "はい"] : ["否", "no", "いいえ"])[i];
  const text = String(value);
  const waveName = text.match(/\(([^)]+)\)$/)?.[1];
  if (waveName && terms[waveName]) return terms[waveName][i];
  if (terms[text]) return terms[text][i];
  if (/^(up|down)_\d+$/.test(text)) {
    const [direction, level] = text.split("_");
    return `${(direction === "up" ? ["上穿", "crossed above ", "上抜け "] : ["下穿", "crossed below ", "下抜け "])[i]}${level}`;
  }
  return text.replace(/_/g, " ");
}

export function evidenceState(item: EvidenceItem, language: string): string {
  return `${reportFamily(item.family, language)}${language.startsWith("zh") ? "" : " "}${evidenceTerm(item.state, language)}`;
}

/** Generate display prose from facts, without changing their scoring interpretation. */
export function localEvidenceText(item: EvidenceItem, language: string): string {
  const i = reportLanguageIndex(language);
  const v = item.values ?? {};
  const text = (zh: string, en: string, ja: string) => [zh, en, ja][i];
  const val = (key: string) => evidenceTerm(v[key], language);
  const field = (key: string, zh: string, en: string, ja: string) => {
    if (v[key] === undefined) return undefined;
    // Pattern extraction uses zero for unavailable levels; it is not a real target.
    if (["triggerPrice", "targetPrice", "invalidationPrice"].includes(key) && !(Number(v[key]) > 0)) return undefined;
    return `${text(zh, en, ja)} ${val(key)}`;
  };
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join("；");
  if (item.state === "insufficient") return text("样本不足，未生成有效指标。", "Insufficient samples to calculate a valid indicator.", "サンプル不足のため有効な指標を算出できません。");
  if (!item.values && item.state === "neutral") return text("暂无有效触发信号。", "No active trigger signal.", "有効な発動シグナルはありません。");
  let body: string;
  switch (item.family) {
    case "ema": body = join(field("order", "均线排列", "Average order", "移動平均線の並び"), field("pricePosition", "价格位置", "Price position", "価格位置"), ...[5, 10, 20, 60].map(n => field(`ema${n}`, `EMA${n}`, `EMA${n}`, `EMA${n}`))); break;
    case "boll": body = join(evidenceTerm(item.state, language), field("percentB", "%B", "%B", "%B"), field("bandwidthTrend", "带宽", "Bandwidth", "バンド幅"), field("lower", "下轨", "Lower band", "下限"), field("upper", "上轨", "Upper band", "上限")); break;
    case "ichimoku": body = join(evidenceTerm(item.state, language), field("lineRelation", "线序", "Line relation", "線の関係"), field("cloudTop", "云顶", "Cloud top", "雲上限"), field("cloudBottom", "云底", "Cloud bottom", "雲下限")); break;
    case "macd": body = join(evidenceTerm(item.state, language), field("zone", "位置", "Zone", "位置"), field("histogramTrend", "柱体变化", "Histogram", "ヒストグラム変化"), field("dif", "DIF", "DIF", "DIF"), field("dea", "DEA", "DEA", "DEA"), field("histogram", "柱体", "Histogram value", "ヒストグラム値"), field("sources", "背离指标", "Divergence indicators", "乖離指標")); break;
    case "kdj": body = join(field("zone", "区域", "Zone", "領域"), field("jState", "J状态", "J state", "J状態"), ...["k", "d", "j"].map(k => field(k, k.toUpperCase(), k.toUpperCase(), k.toUpperCase()))); break;
    case "rsi": body = join(field("value", "RSI14", "RSI14", "RSI14"), evidenceTerm(item.state, language), field("slope", "斜率", "Slope", "傾き")); break;
    case "atr": body = join(field("value", "ATR", "ATR", "ATR"), field("percentOfPrice", "占价格百分比", "Percent of price", "価格に対する割合（%）"), evidenceTerm(item.state, language)); break;
    case "volume": body = join(field("relativeVolume", "相对成交量", "Relative volume", "相対出来高"), field("isLowVolumePullback", "缩量回调", "Low-volume pullback", "出来高減少の押し目"), field("hasVolumeBreakout", "放量突破", "Volume breakout", "出来高を伴う突破"), field("hasPriceVolumeDivergence", "量价背离", "Price-volume divergence", "価格と出来高の乖離")); break;
    case "cmf": case "obv": body = join(field("value", "数值", "Value", "値"), field("trend", "变化", "Trend", "変化")); break;
    case "tdSequential": body = join(field("setup", "序列", "Setup", "セットアップ"), field("stage", "当前计数（共9）", "Count (out of 9)", "現在のカウント（全9）"), text("不单独构成入场确认。", "This alone does not confirm an entry.", "単独ではエントリー確認になりません。")); break;
    case "vpvr": body = join(field("poc", "成交密集峰", "POC", "最大出来高価格"), field("valueAreaLow", "价值区下沿", "Value-area low", "バリューエリア下限"), field("valueAreaHigh", "价值区上沿", "Value-area high", "バリューエリア上限"), field("pricePosition", "价格位置", "Price position", "価格位置"), typeof v.volumeAbovePriceShare === "number" ? text(`上方历史成交占比 ${(v.volumeAbovePriceShare * 100).toFixed(1)}%`, `Historical volume above price ${(v.volumeAbovePriceShare * 100).toFixed(1)}%`, `現値より上の過去出来高 ${(v.volumeAbovePriceShare * 100).toFixed(1)}%`) : undefined, text("历史成交分布不等于当前真实持仓或卖单。", "Historical volume is not current holdings or sell orders.", "過去の出来高分布は現在の保有残高や売り注文ではありません。")); break;
    case "horizontal": body = join(evidenceTerm(item.state, language), field("level", "点位", "Level", "水準"), field("knownAt", "锚点已知日期", "Anchor known at", "基準確定日"), field("observedAt", "观察日期", "Observed at", "観測日")); break;
    case "classicalPattern": {
      const key = item.id.split(".")[2];
      const lang = language === "en" || language === "ja" || language === "zh-TW" ? language : "zh-CN";
      body = join(localizedPatternName(key, key.replace(/([a-z])([A-Z])/g, "$1 $2"), lang), evidenceTerm(item.state, language), field("triggerPrice", "触发位", "Trigger", "発動水準"), field("targetPrice", "目标位", "Target", "目標"), field("invalidationPrice", "失效位", "Invalidation", "無効化水準"), field("volumeConfirmation", "成交量确认", "Volume confirmation", "出来高確認")); break;
    }
    case "candlestick": body = join(evidenceTerm(item.id.split(".")[2], language), evidenceTerm(item.state, language), field("location", "所处位置", "Location", "位置")); break;
    case "chanlun": body = join(evidenceTerm(item.state, language), field("strokeStart", "最近一笔起点", "Latest stroke start", "直近ストローク始点"), field("strokeStartDate", "起始日期", "Start date", "開始日"), field("strokeEnd", "终点", "End", "終点"), field("strokeEndDate", "结束日期", "End date", "終了日"), field("zoneLow", "中枢下沿", "Central zone low", "中枢下限"), field("zoneHigh", "中枢上沿", "Central zone high", "中枢上限"), field("pricePosition", "相对中枢位置", "Position versus central zone", "中枢に対する位置")); break;
    case "elliottWave": body = join(evidenceTerm(item.state, language), ...Object.keys(v).filter(k => /^point\d+$/.test(k)).map(k => `${text("结构点", "Structural point", "構造点")} ${k.slice(5)}: ${val(k)} (${val(`date${k.slice(5)}`)})`), text("波浪划分是结构解释，不单独作为入场触发。", "Wave labels describe structure, not a standalone entry trigger.", "波動区分は構造の解釈であり、単独のエントリー条件ではありません。")); break;
    case "fibonacci": body = evidenceTerm(item.state, language); break;
  }
  if (item.barsSince !== undefined) body += text(`；距事件 ${item.barsSince} 根K线`, `; ${item.barsSince} bars since the event`, `；発生から ${item.barsSince} 本`);
  return body;
}
