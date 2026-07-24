import { describe, expect, it } from "vitest";
import { reduceAnalysisDisplay } from "../analysisDisplayState";

interface TestData {
  symbol: string;
}

describe("analysis display state", () => {
  it("clears a previous result when a fresh remote analysis starts", () => {
    const previous = { data: { symbol: "AAPL" }, error: null };

    expect(reduceAnalysisDisplay<TestData>(previous, { type: "request_started" })).toEqual({
      data: null,
      error: null,
    });
  });

  it("keeps only the failure instead of showing stale analysis data", () => {
    const previous = { data: { symbol: "AAPL" }, error: null };

    expect(reduceAnalysisDisplay<TestData>(previous, {
      type: "request_failed",
      error: "AI analysis timed out",
    })).toEqual({
      data: null,
      error: "AI analysis timed out",
    });
  });

  it("replaces an error with a successful result", () => {
    const result = { symbol: "MSFT" };

    expect(reduceAnalysisDisplay<TestData>({ data: null, error: "timeout" }, {
      type: "request_succeeded",
      data: result,
    })).toEqual({ data: result, error: null });
  });
});
