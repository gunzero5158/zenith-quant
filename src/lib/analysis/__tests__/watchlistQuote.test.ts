import { describe, expect, it } from "vitest";

import { mergeAnalysisQuoteIntoWatchlist } from "../watchlistQuote";

describe("mergeAnalysisQuoteIntoWatchlist", () => {
  it("replaces the active symbol quote with the completed analysis snapshot", () => {
    const previous = {
      "688048.SS": { price: 297.49, change: 1.52 },
      AAPL: { price: 213.4, change: -0.2 },
    };

    const updated = mergeAnalysisQuoteIntoWatchlist(previous, {
      symbol: "688048.SS",
      price: 295.37,
      changePercent: 0.8,
    });

    expect(updated).toEqual({
      "688048.SS": { price: 295.37, change: 0.8 },
      AAPL: { price: 213.4, change: -0.2 },
    });
    expect(previous["688048.SS"]).toEqual({ price: 297.49, change: 1.52 });
  });

  it("marks simulated analysis quotes so the sidebar keeps its placeholder behavior", () => {
    expect(mergeAnalysisQuoteIntoWatchlist({}, {
      symbol: "688048.SS",
      price: 295.37,
      changePercent: 0.8,
      isMock: true,
    })).toEqual({
      "688048.SS": { price: 295.37, change: 0.8, isMock: true },
    });
  });
});
