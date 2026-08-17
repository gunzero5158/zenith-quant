import { describe, expect, it } from "vitest";
import {
  isSupportedEastMoneySuggestion,
  isTickerLike,
  normalizeEastMoneySymbol,
  resolveInputSymbol,
} from "../symbolResolver";

describe("symbolResolver", () => {
  it("normalizes A-share suggestions with the canonical exchange rules", () => {
    expect(normalizeEastMoneySymbol({ Code: "900901", Classify: "AStock", QuoteID: "1.900901" }))
      .toBe("900901.SS");
    expect(normalizeEastMoneySymbol({ Code: "000001", Classify: "AStock", QuoteID: "0.000001" }))
      .toBe("000001.SZ");
  });

  it("removes EastMoney's five-character padding from legacy Hong Kong symbols", () => {
    expect(normalizeEastMoneySymbol({ Code: "00700", Classify: "HKStock" })).toBe("0700.HK");
    expect(normalizeEastMoneySymbol({ Code: "09988", Classify: "HKStock" })).toBe("9988.HK");
  });

  it("preserves explicitly entered five-digit Hong Kong symbols", async () => {
    expect(await resolveInputSymbol("02476")).toBe("02476.HK");
  });

  it("supports and normalizes Japanese suggestions", () => {
    const suggestion = { Code: "285a", Classify: "JPX", QuoteID: "176.285A" };
    expect(isSupportedEastMoneySuggestion(suggestion)).toBe(true);
    expect(normalizeEastMoneySymbol(suggestion)).toBe("285A.T");
  });

  it("recognizes supported ticker formats without a remote lookup", () => {
    expect(isTickerLike("MSFT")).toBe(true);
    expect(isTickerLike("0700.HK")).toBe(true);
    expect(isTickerLike("600519.SS")).toBe(true);
    expect(isTickerLike("MICROSOFT")).toBe(false);
  });
});
