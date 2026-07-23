import { describe, expect, it } from "vitest";
import { SIGNAL_CATALOG, SIGNAL_FAMILIES } from "../evidence";

describe("signal catalog", () => {
  it("covers every approved indicator family exactly once", () => {
    expect(SIGNAL_CATALOG.map((item) => item.family).sort()).toEqual(
      [...SIGNAL_FAMILIES].sort()
    );
  });

  it("declares consumers, report section, scoring role, and minimum samples", () => {
    for (const item of SIGNAL_CATALOG) {
      expect(item.consumers.length).toBeGreaterThan(0);
      expect(item.reportSection.length).toBeGreaterThan(0);
      expect(["score", "explainOnly"]).toContain(item.role);
      expect(item.minimumSamples.daily + item.minimumSamples.weekly).toBeGreaterThan(0);
    }
  });
});
