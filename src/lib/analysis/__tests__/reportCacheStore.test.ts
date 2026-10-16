import { describe, expect, it } from "vitest";
import { createReportCacheStore } from "../reportCacheStore";
import { ANALYSIS_MODES } from "../analysisMode";
import { isAnalysisCacheReusableByTime } from "../analysisCache";

function storage(limit = Infinity) {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem(key: string, value: string) {
      const total = [...values].reduce((sum, [k, v]) => sum + (k === key ? 0 : v.length), 0) + value.length;
      if (total > limit) { const error = new Error("full"); error.name = "QuotaExceededError"; throw error; }
      values.set(key, value);
    },
  };
}

describe("analysis cache across modes", () => {
  it("retains all fifteen history symbols in each mode across a reload", () => {
    const disk = storage();
    const cache = createReportCacheStore<{ mode: string }>(() => disk);
    for (const mode of ANALYSIS_MODES) for (let i = 0; i < 15; i++) cache.write(`S${i}`, mode, { mode });
    const reloaded = createReportCacheStore<{ mode: string }>(() => disk);
    for (const mode of ANALYSIS_MODES) expect(reloaded.read("s0", mode)).toEqual({ mode });
    cache.write("EXTRA", "rule-ai", { mode: "rule-ai" });
    expect(cache.read("S0", "ai-native")).toEqual({ mode: "ai-native" });
  });
  it("recovers a large pure LLM write by evicting older reports, preserving unrelated data", () => {
    const disk = storage(1800);
    disk.setItem("llmConfig", "settings-to-preserve");
    disk.setItem("validation-records", "history-to-preserve");
    const cache = createReportCacheStore<string>(() => disk);
    expect(cache.write("OLD", "rule-ai", "a".repeat(900))).toBe(true);
    expect(cache.write("MSFT", "ai-native", "b".repeat(1100))).toBe(true);
    const reloaded = createReportCacheStore<string>(() => disk);
    expect(reloaded.read("MSFT", "ai-native")).toBe("b".repeat(1100));
    expect(disk.getItem("llmConfig")).toBe("settings-to-preserve");
    expect(disk.getItem("validation-records")).toBe("history-to-preserve");
  });
  it("keeps the newest report in memory when browser storage is blocked", () => {
    const cache = createReportCacheStore<number>(() => { throw new Error("blocked"); });
    for (let i = 0; i < 20; i++) expect(cache.write(`S${i}`, "ai-native", i)).toBe(false);
    expect(cache.read("S19", "ai-native")).toBe(19);
    expect(cache.read("S0", "ai-native")).toBeNull();
    cache.remove("S19", "ai-native");
    expect(cache.read("S19", "ai-native")).toBeNull();
  });
  it.each(ANALYSIS_MODES)("reuses %s within ten minutes without extending its original timestamp", mode => {
    const disk = storage();
    const cache = createReportCacheStore<{ timestamp: number }>(() => disk);
    const timestamp = Date.parse("2026-10-16T14:00:00Z");
    cache.write("MSFT", mode, { timestamp });
    cache.touch("MSFT", mode);
    const stored = cache.read("MSFT", mode)!;
    expect(stored.timestamp).toBe(timestamp);
    expect(isAnalysisCacheReusableByTime("MSFT", stored.timestamp, timestamp + 600000)).toBe(true);
    expect(isAnalysisCacheReusableByTime("MSFT", stored.timestamp, timestamp + 600001)).toBe(false);
  });
  it("keeps a Friday close through the weekend but refreshes at the next open", () => {
    const closed = Date.parse("2026-10-16T20:01:00Z");
    expect(isAnalysisCacheReusableByTime("MSFT", closed, Date.parse("2026-10-18T12:00:00Z"))).toBe(true);
    expect(isAnalysisCacheReusableByTime("MSFT", closed, Date.parse("2026-10-19T13:30:00Z"))).toBe(false);
  });
  it("refreshes once across the A-share lunch boundary, then reuses until afternoon open", () => {
    const lunch = Date.parse("2026-10-16T04:00:00Z");
    expect(isAnalysisCacheReusableByTime("688048.SS", Date.parse("2026-10-16T03:29:00Z"), lunch)).toBe(false);
    expect(isAnalysisCacheReusableByTime("688048.SS", Date.parse("2026-10-16T03:31:00Z"), lunch)).toBe(true);
    expect(isAnalysisCacheReusableByTime("688048.SS", lunch, Date.parse("2026-10-16T05:00:00Z"))).toBe(false);
  });
});
