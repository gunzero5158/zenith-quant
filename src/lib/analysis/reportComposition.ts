import type { AiAnalysisResult } from "./aiAnalysisResult";
import type { StructuredReport } from "./fallbackReport";

interface StrategyHeadings {
  holder: string;
  leftEntry: string;
  rightAdd: string;
  exitStop: string;
  context: string;
}

const HEADINGS: Record<string, StrategyHeadings> = {
  "zh-CN": {
    holder: "持仓策略",
    leftEntry: "左侧入场",
    rightAdd: "右侧加仓",
    exitStop: "退出与止损",
    context: "变化条件",
  },
  "zh-TW": {
    holder: "持倉策略",
    leftEntry: "左側入場",
    rightAdd: "右側加倉",
    exitStop: "退出與止損",
    context: "變化條件",
  },
  en: {
    holder: "Holder strategy",
    leftEntry: "Left-side entry",
    rightAdd: "Right-side add",
    exitStop: "Exit and stop",
    context: "Change conditions",
  },
  ja: {
    holder: "保有戦略",
    leftEntry: "左側エントリー",
    rightAdd: "右側追加",
    exitStop: "手仕舞いと損切り",
    context: "変化条件",
  },
};

export function composeAiReport(ai: AiAnalysisResult, language: string): StructuredReport {
  const headings = HEADINGS[language] ?? HEADINGS["zh-CN"];
  const recommendation = [
    `### ${headings.holder}\n${ai.strategyAdvice.holder.text}`,
    `### ${headings.leftEntry}\n${ai.strategyAdvice.leftEntry.text}`,
    `### ${headings.rightAdd}\n${ai.strategyAdvice.rightAdd.text}`,
    `### ${headings.exitStop}\n${ai.strategyAdvice.exitStop.text}`,
    `### ${headings.context}\n${ai.strategyCommentary}`,
  ].join("\n\n");

  return {
    overview: ai.overview,
    recommendation,
    technicalAnalysis: ai.technicalAnalysis,
  };
}
