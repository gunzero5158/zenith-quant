import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convertSymbolToSina, fetchSinaAShareKlines } from "@/app/api/analyze/sinaUtils";

describe("Sina Finance A-share API Helper", () => {
  const mockedFetch = () => fetch as ReturnType<typeof vi.fn>;

  describe("convertSymbolToSina", () => {
    it("should convert SS and SH suffix tickers correctly", () => {
      expect(convertSymbolToSina("600519.SS")).toBe("sh600519");
      expect(convertSymbolToSina("600519.SH")).toBe("sh600519");
      expect(convertSymbolToSina(" 600519.ss ")).toBe("sh600519");
    });

    it("should convert SZ suffix tickers correctly", () => {
      expect(convertSymbolToSina("000001.SZ")).toBe("sz000001");
      expect(convertSymbolToSina("000001.sz")).toBe("sz000001");
    });

    it("should infer prefix for raw 6-digit A-share tickers", () => {
      expect(convertSymbolToSina("600519")).toBe("sh600519");
      expect(convertSymbolToSina("688001")).toBe("sh688001");
      expect(convertSymbolToSina("000001")).toBe("sz000001");
      expect(convertSymbolToSina("300059")).toBe("sz300059");
    });

    it("should return null for non-A-share tickers", () => {
      expect(convertSymbolToSina("AAPL")).toBeNull();
      expect(convertSymbolToSina("0700.HK")).toBeNull();
      expect(convertSymbolToSina("9984.T")).toBeNull();
    });
  });

  describe("fetchSinaAShareKlines with Mock Fetch", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("should fetch and parse Sina daily K-line JSON correctly", async () => {
      const mockSinaResponse = [
        { day: "2026-06-01", open: "1300.00", high: "1310.00", low: "1290.00", close: "1305.00", volume: "4500000" },
        { day: "2026-06-02", open: "1305.00", high: "1320.00", low: "1300.00", close: "1315.00", volume: "5000000" }
      ];

      mockedFetch().mockResolvedValue({
        ok: true,
        json: async () => mockSinaResponse
      });

      const result = await fetchSinaAShareKlines("sh600519", false);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("symbol=sh600519&scale=240"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Referer": "https://finance.sina.com.cn/"
          })
        })
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: "2026-06-01",
        open: 1300.00,
        high: 1310.00,
        low: 1290.00,
        close: 1305.00,
        volume: 4500000
      });
      expect(result[1].close).toBe(1315.00);
      expect(result[1].volume).toBe(5000000);
    });

    it("should fetch Sina weekly K-line when requested", async () => {
      mockedFetch().mockResolvedValue({
        ok: true,
        json: async () => [{ day: "2026-06-01", open: "10", high: "12", low: "9", close: "11", volume: "100" }]
      });

      await fetchSinaAShareKlines("sh600519", true);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("scale=1200"),
        expect.any(Object)
      );
    });

    it("should throw error if fetch failed", async () => {
      mockedFetch().mockResolvedValue({
        ok: false,
        status: 500
      });

      await expect(fetchSinaAShareKlines("sh600519")).rejects.toThrow("新浪K线接口请求失败");
    });

    it("should throw error if data is empty or invalid", async () => {
      mockedFetch().mockResolvedValue({
        ok: true,
        json: async () => []
      });

      await expect(fetchSinaAShareKlines("sh600519")).rejects.toThrow("新浪K线数据返回为空或格式不正确");
    });
  });
});
