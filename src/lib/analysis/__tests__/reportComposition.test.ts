import { describe, expect, it } from "vitest";
import { composeAiReport } from "../reportComposition";

const localReport = {
  overview: "### 入场评估\n本地综述",
  recommendation: "### 交易策略\n- 持仓：执行本地策略",
  technicalAnalysis: "### 技术证据\n- EMA：本地原始证据",
};

describe("AI report composition", () => {
  it("removes machine evidence IDs from every user-visible AI field", () => {
    const report = composeAiReport({
      overview: "日线仍偏弱（`daily.ema.bearish`），反弹需要确认。",
      technicalAnalysis: [
        "### 趋势与多周期结构",
        "- **日线趋势：** EMA 呈空头排列（`daily.ema.bearish`），价格低于所有均线。",
        "- **周线结构：** 周线 BOLL 位于下半轨（`weekly.boll.lower_half`，%B 28.09%）。",
        "- **MACD：** 0 日前触发死叉 `daily.macd.death_cross`。",
      ].join("\n"),
      strategyCommentary: "只有 daily.rsi.up_50 成立后才考虑右侧确认。",
    }, localReport, "zh-CN");

    expect(report.overview).toBe("日线仍偏弱，反弹需要确认。");
    expect(report.technicalAnalysis).toContain("EMA 呈空头排列，价格低于所有均线");
    expect(report.technicalAnalysis).toContain("周线 BOLL 位于下半轨（%B 28.09%）");
    expect(report.recommendation).toContain("只有 成立后才考虑右侧确认");
    expect(`${report.overview}\n${report.technicalAnalysis}\n${report.recommendation}`).not.toMatch(
      /(?:daily|weekly)\.[a-z0-9_.-]+/i
    );
  });

  it("removes an invented evidence ID even when a known ID is its prefix", () => {
    const report = composeAiReport({
      overview: "风险仍在（`daily.ema.bearish.copy`）。",
    }, localReport, "zh-CN", ["daily.ema.bearish"]);

    expect(report.overview).toBe("风险仍在。");
  });

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
