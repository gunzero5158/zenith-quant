import { describe, expect, it } from "vitest";
import { buildEastMoneyKlineUrl } from "../eastmoneyHttp";

describe("EastMoney HTTP helpers", () => {
  it("builds bounded K-line URLs with explicit date range", () => {
    const url = buildEastMoneyKlineUrl({
      host: "push2his.eastmoney.com",
      secid: "1.600519",
      klt: "101",
      limit: 320,
    });

    expect(url).toContain("https://push2his.eastmoney.com/api/qt/stock/kline/get?");
    expect(url).toContain("secid=1.600519");
    expect(url).toContain("klt=101");
    expect(url).toContain("beg=19900101");
    expect(url).toContain("end=20991231");
    expect(url).toContain("lmt=320");
  });
});
