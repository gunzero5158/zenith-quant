import { describe, expect, it } from "vitest";
import { validateAiScoreReview } from "../aiScoreReview";

const evidenceIds = ["weekly.macd.death_cross", "daily.ema.bullish"];

function review(adjustment: number, ids = ["weekly.macd.death_cross"]) {
  return {
    adjustment,
    confidence: 0.8,
    alignment: adjustment < 0 ? "more_cautious" : adjustment > 0 ? "more_constructive" : "agree",
    reasons: adjustment === 0 ? [] : [{ evidenceIds: ids, text: "周线动能与日线修复存在冲突" }],
    conflicts: [],
    changeConditions: [],
  };
}

describe("bounded AI score review", () => {
  it("accepts a reasoned adjustment that references existing evidence", () => {
    const result = validateAiScoreReview(review(-0.3), evidenceIds, 4.1, 5);
    expect(result.appliedAdjustment).toBe(-0.3);
    expect(result.finalScore).toBe(3.8);
  });

  it.each([
    ["clips positive adjustment", 0.9, 0.5],
    ["clips negative adjustment", -0.8, -0.5],
  ])("%s", (_name, adjustment, expected) => {
    expect(validateAiScoreReview(review(adjustment), evidenceIds, 3.5, 5).appliedAdjustment).toBe(expected);
  });

  it("rejects nonzero adjustment without valid evidence reasons", () => {
    const result = validateAiScoreReview(review(0.4, ["invented.signal"]), evidenceIds, 3.5, 5);
    expect(result.appliedAdjustment).toBe(0);
    expect(result.validationWarnings.length).toBeGreaterThan(0);
  });

  it("cannot lift the final score above the rule hard cap", () => {
    const result = validateAiScoreReview(review(0.5, ["daily.ema.bullish"]), evidenceIds, 3.1, 3.2);
    expect(result.finalScore).toBe(3.2);
  });

  it("rejects malformed confidence and alignment", () => {
    const result = validateAiScoreReview({ ...review(0.3), confidence: 2, alignment: "optimistic" }, evidenceIds, 3.2, 5);
    expect(result.appliedAdjustment).toBe(0);
  });
});
