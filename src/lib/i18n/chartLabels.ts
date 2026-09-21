import type { EffectiveLanguage } from "./translations";

interface ChartLabels {
  tdSell: string;
  tdBuy: string;
  doubleBottomBreakout: string;
  cupAndHandleBreakout: string;
  patterns: Record<string, string>;
}

// The pattern engine emits language-neutral English names; chart markers show
// the viewer's language, keyed by the stable pattern key.
const CHART_LABELS: Record<EffectiveLanguage, ChartLabels> = {
  "zh-CN": {
    tdSell: "九转(9) 卖", tdBuy: "九转(9) 买", doubleBottomBreakout: "W底突破", cupAndHandleBreakout: "杯柄突破",
    patterns: {
      doubleBottom: "双底", doubleTop: "双顶", tripleBottom: "三重底", tripleTop: "三重顶",
      inverseHeadAndShoulders: "头肩底", headAndShoulders: "头肩顶", roundingBottom: "圆弧底", roundingTop: "圆弧顶",
      cupAndHandle: "杯柄突破", bullFlag: "牛旗", bearFlag: "熊旗", rectangle: "箱体震荡",
      symmetricTriangle: "对称三角", ascendingTriangle: "上升三角", descendingTriangle: "下降三角",
      pennant: "三角旗", trianglePennant: "收敛三角", risingWedge: "上升楔形", fallingWedge: "下降楔形",
    },
  },
  "zh-TW": {
    tdSell: "九轉(9) 賣", tdBuy: "九轉(9) 買", doubleBottomBreakout: "W底突破", cupAndHandleBreakout: "杯柄突破",
    patterns: {
      doubleBottom: "雙底", doubleTop: "雙頂", tripleBottom: "三重底", tripleTop: "三重頂",
      inverseHeadAndShoulders: "頭肩底", headAndShoulders: "頭肩頂", roundingBottom: "圓弧底", roundingTop: "圓弧頂",
      cupAndHandle: "杯柄突破", bullFlag: "牛旗", bearFlag: "熊旗", rectangle: "箱體震盪",
      symmetricTriangle: "對稱三角", ascendingTriangle: "上升三角", descendingTriangle: "下降三角",
      pennant: "三角旗", trianglePennant: "收斂三角", risingWedge: "上升楔形", fallingWedge: "下降楔形",
    },
  },
  en: {
    tdSell: "TD 9 Sell", tdBuy: "TD 9 Buy", doubleBottomBreakout: "W-bottom breakout", cupAndHandleBreakout: "Cup & handle breakout",
    patterns: {},
  },
  ja: {
    tdSell: "TD9 売り", tdBuy: "TD9 買い", doubleBottomBreakout: "Wボトム突破", cupAndHandleBreakout: "カップウィズハンドル突破",
    patterns: {
      doubleBottom: "ダブルボトム", doubleTop: "ダブルトップ", tripleBottom: "トリプルボトム", tripleTop: "トリプルトップ",
      inverseHeadAndShoulders: "逆三尊", headAndShoulders: "三尊天井", roundingBottom: "ソーサーボトム", roundingTop: "ソーサートップ",
      cupAndHandle: "カップウィズハンドル", bullFlag: "上昇フラッグ", bearFlag: "下降フラッグ", rectangle: "ボックス圏",
      symmetricTriangle: "対称三角形", ascendingTriangle: "上昇三角形", descendingTriangle: "下降三角形",
      pennant: "ペナント", trianglePennant: "収束三角形", risingWedge: "上昇ウェッジ", fallingWedge: "下降ウェッジ",
    },
  },
};

export function chartLabels(language: EffectiveLanguage): ChartLabels {
  return CHART_LABELS[language] ?? CHART_LABELS["zh-CN"];
}

/** Falls back to the engine's English name for keys without a translation. */
export function localizedPatternName(key: string, englishName: string, language: EffectiveLanguage): string {
  return chartLabels(language).patterns[key] ?? englishName;
}
