import { describe, expect, it } from "vitest";
import { mergeCurrentWeekFromDaily } from "../weeklyCandles";
import { buildDataQuality } from "../dataQuality";

const bar = (date: string, close: number, volume = 100) => ({
  date, open: close, high: close + 1, low: close - 1, close, volume,
});

describe("provider weekly date conventions", () => {
  it("replaces the whole current week regardless of the provider label without duplicating volume", () => {
    const result = mergeCurrentWeekFromDaily([
      bar("2026-10-09", 10), bar("2026-10-12", 11), bar("2026-10-15", 12),
    ], [bar("2026-10-12", 13, 200), bar("2026-10-15", 14, 300)]);
    expect(result.map(c => c.date)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(result[1]).toMatchObject({ open: 13, close: 14, volume: 500 });
  });

  it("normalizes and deduplicates provider snapshots even without daily data", () => {
    const result = mergeCurrentWeekFromDaily([bar("2026-10-09", 12), bar("2026-10-05", 10)], []);
    expect(result).toEqual([{ ...bar("2026-10-05", 12) }]);
  });

  it.each(["2026-10-12", "2026-10-15", "2026-10-16"])("does not finalize Thursday's week labeled %s", latestWeeklyDate => {
    const quality = buildDataQuality({ symbol: "560860.SS", asOf: "2026-10-15T13:00:00Z",
      dailySamples: 100, weeklySamples: 50, latestDailyDate: "2026-10-15", latestWeeklyDate });
    expect(quality.dailyBarComplete).toBe(true);
    expect(quality.weeklyBarComplete).toBe(false);
  });

  it("never treats future daily or weekly bars as complete", () => {
    const quality = buildDataQuality({ symbol: "MSFT", asOf: "2026-10-15T13:00:00Z",
      dailySamples: 100, weeklySamples: 50, latestDailyDate: "2026-10-16", latestWeeklyDate: "2026-10-19" });
    expect(quality.dailyBarComplete).toBe(false);
    expect(quality.weeklyBarComplete).toBe(false);
  });
});
