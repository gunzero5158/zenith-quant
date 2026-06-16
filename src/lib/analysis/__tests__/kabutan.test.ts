import { describe, expect, it } from "vitest";
import { getKabutanCode, parseKabutanDailyPage } from "../kabutan";

describe("kabutan helpers", () => {
  it("recognizes Japanese tickers without hijacking HK numeric codes", () => {
    expect(getKabutanCode("9984.T")).toBe("9984");
    expect(getKabutanCode("285A")).toBe("285A");
    expect(getKabutanCode("285A.T")).toBe("285A");
    expect(getKabutanCode("0700")).toBeNull();
    expect(getKabutanCode("0700.HK")).toBeNull();
    expect(getKabutanCode("AAPL")).toBeNull();
  });

  it("parses current and historical Kabutan daily rows", () => {
    const html = `
      <title>ソフトバンクグループ（ＳＢＧ）【9984】の日々株価</title>
      <table class="stock_kabuka0">
        <tbody>
          <tr>
            <th scope="row"><time datetime="2026-06-15">26/06/15</time></th>
            <td>7,108</td><td>7,327</td><td>7,010</td><td>7,139</td>
            <td><span class="up">+667</span></td><td><span class="up">+10.31</span></td><td>71,003,100</td>
          </tr>
        </tbody>
      </table>
      <table class="stock_kabuka_dwm">
        <tbody>
          <tr>
            <th scope="row"><time datetime="2026-06-12">26/06/12</time></th>
            <td>6,650</td><td>6,797</td><td>6,373</td><td>6,472</td>
            <td><span class="up">+98</span></td><td><span class="up">+1.54</span></td><td>75,320,600</td>
          </tr>
        </tbody>
      </table>
    `;

    const result = parseKabutanDailyPage(html);

    expect(result.companyName).toBe("ソフトバンクグループ（ＳＢＧ）");
    expect(result.candles).toHaveLength(2);
    expect(result.candles[0]).toMatchObject({
      date: "2026-06-15",
      open: 7108,
      high: 7327,
      low: 7010,
      close: 7139,
      volume: 71003100,
      changePercent: 10.31,
    });
  });
});
