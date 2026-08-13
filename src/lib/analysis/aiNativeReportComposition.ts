import type { AiAnalysisResult } from "./aiAnalysisResult";
import type { StructuredReport } from "./fallbackReport";

const HEADINGS: Record<string, [string, string, string, string, string]> = {
  "zh-CN": ["持仓策略", "左侧入场", "右侧加仓", "退出与止损", "变化条件"],
  "zh-TW": ["持倉策略", "左側入場", "右側加倉", "退出與止損", "變化條件"],
  en: ["Holder strategy", "Left-side entry", "Right-side add", "Exit and stop", "Change conditions"],
  ja: ["保有戦略", "左側エントリー", "右側追加", "手仕舞いと損切り", "変化条件"],
};

export function composeAiNativeReport(ai: AiAnalysisResult, language: string): StructuredReport {
  const headings = HEADINGS[language] ?? HEADINGS["zh-CN"];
  return {
    overview: ai.overview,
    recommendation: [
      `### ${headings[0]}\n${ai.strategyAdvice.holder.text}`,
      `### ${headings[1]}\n${ai.strategyAdvice.leftEntry.text}`,
      `### ${headings[2]}\n${ai.strategyAdvice.rightAdd.text}`,
      `### ${headings[3]}\n${ai.strategyAdvice.exitStop.text}`,
      `### ${headings[4]}\n${ai.strategyCommentary}`,
    ].join("\n\n"),
    technicalAnalysis: ai.technicalAnalysis,
  };
}
