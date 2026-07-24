import { describe, expect, it } from "vitest";
import { composeAiReport } from "../reportComposition";

const localReport = {
  overview: "### 入场评估\n本地综述",
  recommendation: "### 交易策略\n- 持仓：执行本地策略",
  technicalAnalysis: "### 技术证据\n- EMA：本地原始证据",
};

describe("AI report composition", () => {
  it("shows synthesized AI prose without raw local evidence or duplicate score blocks", () => {
    const report = composeAiReport({
      overview: "短期趋势偏弱，反弹仍需确认。",
      technicalAnalysis: "### 趋势与动量\nMACD仍在零轴下方，但绿柱收敛，说明下跌动能有所缓和。",
      strategyCommentary: "若放量站回关键压力位，右侧条件才会改善。",
    }, localReport, "zh-CN");

    expect(report.overview).toBe("短期趋势偏弱，反弹仍需确认。");
    expect(report.technicalAnalysis).toContain("下跌动能有所缓和");
    expect(report.technicalAnalysis).not.toContain("技术证据");
    expect(report.technicalAnalysis).not.toContain("本地原始证据");
    expect(report.overview).not.toContain("经验证的入场评分");
    expect(report.recommendation).toContain("执行本地策略");
    expect(report.recommendation).toContain("### AI补充判断");
    expect(report.recommendation).toContain("右侧条件才会改善");
  });

  it("uses localized local fields only when the matching AI field is absent", () => {
    const report = composeAiReport({
      overview: "   ",
      technicalAnalysis: undefined,
      strategyCommentary: "",
    }, localReport, "zh-CN");

    expect(report.overview).toBe(localReport.overview);
    expect(report.technicalAnalysis).toBe(localReport.technicalAnalysis);
    expect(report.recommendation).toBe(localReport.recommendation);
  });

  it("localizes the optional AI strategy heading", () => {
    const report = composeAiReport({ strategyCommentary: "Wait for confirmation." }, localReport, "en");
    expect(report.recommendation).toContain("### AI follow-up");
  });
});
