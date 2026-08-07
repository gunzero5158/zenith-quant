import { describe, expect, it } from "vitest";
import { buildDataQuality } from "../dataQuality";

describe("analysis data quality", () => {
  it("marks an A-share daily and weekly bar provisional during trading", () => {
    const quality = buildDataQuality({
      symbol: "300757.SZ",
      asOf: "2026-07-23T06:00:00.000Z",
      dailySamples: 250,
      weeklySamples: 150,
      latestDailyDate: "2026-07-23",
      latestWeeklyDate: "2026-07-20",
    });

    expect(quality.dailyBarComplete).toBe(false);
    expect(quality.weeklyBarComplete).toBe(false);
    expect(quality.warnings).toContain("当前日K未完成，日线触发为暂定信号");
    expect(quality.warnings).toContain("当前周K未完成，周线信号为暂定信号");
  });

  it("marks the Friday daily and weekly bars complete after the A-share close", () => {
    const quality = buildDataQuality({
      symbol: "300757.SZ",
      asOf: "2026-07-24T08:00:00.000Z",
      dailySamples: 250,
      weeklySamples: 150,
      latestDailyDate: "2026-07-24",
      latestWeeklyDate: "2026-07-20",
    });

    expect(quality.dailyBarComplete).toBe(true);
    expect(quality.weeklyBarComplete).toBe(true);
    expect(quality.scoreCap).toBe(5);
  });

  it("caps score confidence instead of rewarding missing samples", () => {
    const quality = buildDataQuality({
      symbol: "300757.SZ",
      asOf: "2026-07-24T08:00:00.000Z",
      dailySamples: 45,
      weeklySamples: 20,
      latestDailyDate: "2026-07-24",
      latestWeeklyDate: "2026-07-20",
    });

    expect(quality.scoreCap).toBe(2.5);
    expect(quality.missingFamilies).toContain("ema");
    expect(quality.missingFamilies).toContain("macd");
  });

  it("uses the Hong Kong close rather than UTC to finalize the daily bar", () => {
    const quality = buildDataQuality({
      symbol: "0700.HK",
      asOf: "2026-07-23T08:20:00.000Z",
      dailySamples: 250,
      weeklySamples: 150,
      latestDailyDate: "2026-07-23",
      latestWeeklyDate: "2026-07-20",
    });
    expect(quality.dailyBarComplete).toBe(true);
    expect(quality.weeklyBarComplete).toBe(false);
  });

  it("keeps the US daily bar provisional during New York trading and finalizes it after close", () => {
    const during = buildDataQuality({
      symbol: "MSFT",
      asOf: "2026-07-23T18:00:00.000Z",
      dailySamples: 250,
      weeklySamples: 150,
      latestDailyDate: "2026-07-23",
      latestWeeklyDate: "2026-07-20",
    });
    const after = buildDataQuality({
      symbol: "MSFT",
      asOf: "2026-07-23T20:30:00.000Z",
      dailySamples: 250,
      weeklySamples: 150,
      latestDailyDate: "2026-07-23",
      latestWeeklyDate: "2026-07-20",
    });
    expect(during.dailyBarComplete).toBe(false);
    expect(after.dailyBarComplete).toBe(true);
  });
});
