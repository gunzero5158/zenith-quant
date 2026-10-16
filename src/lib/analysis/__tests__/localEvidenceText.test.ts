import { describe, expect, it } from "vitest";
import type { EvidenceItem } from "../evidence";
import { evidenceState, localEvidenceText } from "../localEvidenceText";

const base: EvidenceItem = { id: "daily.macd.death_cross", family: "macd", timeframe: "daily", direction: "bearish",
  state: "death_cross", label: "MACD", description: "Untranslated text must not be used.", provisional: false, reliability: 1,
  barsSince: 2, values: { zone: "above_zero", histogramTrend: "expanding", dif: 1, dea: 1.2, histogram: -0.4 } };
describe("localized factual evidence", () => {
  it.each(["zh-CN", "en", "ja"])("retains MACD numbers and timing in %s", language => {
    const text = localEvidenceText(base, language);
    expect(text).toContain("DIF 1");
    expect(text).toContain("DEA 1.2");
    expect(text).toContain("-0.4");
    expect(text).not.toContain("Untranslated");
    expect(text).not.toContain("above_zero");
    expect(text).not.toContain("death_cross");
  });
  it("names Japanese candlestick patterns and their location", () => {
    const candle: EvidenceItem = { ...base, family: "candlestick", id: "daily.candlestick.longLowerShadow", state: "triggered", values: { location: "support" } };
    expect(localEvidenceText(candle, "ja")).toContain("長い下ヒゲ");
    expect(localEvidenceText(candle, "ja")).toContain("支持線");
  });
  it("keeps wave price anchors and dates while translating the label", () => {
    const wave: EvidenceItem = { ...base, family: "elliottWave", state: "第 2 浪筑底蓄势 (Wave 2 Bottoming)",
      values: { point1: 95.25, date1: "2026-10-14" } };
    expect(evidenceState(wave, "ja")).toContain("第2波底固め");
    expect(localEvidenceText(wave, "en")).toContain("95.25 (2026-10-14)");
    expect(localEvidenceText(wave, "en")).not.toMatch(/[\u3400-\u9fff]/);
  });
  it("reports historical overhead volume without claiming actual holdings", () => {
    const profile: EvidenceItem = { ...base, family: "vpvr", state: "above_value_area", values: { poc: 98, volumeAbovePriceShare: 0.123 } };
    expect(localEvidenceText(profile, "en")).toContain("12.3%");
    expect(localEvidenceText(profile, "en")).toContain("not current holdings");
  });
  it("never displays unavailable pattern levels as zero-price targets", () => {
    const pattern: EvidenceItem = { ...base, family: "classicalPattern", id: "daily.pattern.doubleBottom.forming", state: "forming",
      values: { triggerPrice: 0, targetPrice: 0, invalidationPrice: 0 } };
    expect(localEvidenceText(pattern, "en")).not.toContain("Target 0");
    expect(localEvidenceText(pattern, "en")).not.toContain("Trigger 0");
  });
});
