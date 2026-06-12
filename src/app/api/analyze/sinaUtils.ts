import { Candle } from "@/lib/analysis/indicators";

export function convertSymbolToSina(symbol: string): string | null {
  const clean = symbol.trim().toUpperCase();
  if (clean.endsWith(".SS") || clean.endsWith(".SH")) {
    const code = clean.split(".")[0];
    return `sh${code}`;
  }
  if (clean.endsWith(".SZ")) {
    const code = clean.split(".")[0];
    return `sz${code}`;
  }
  if (/^\d{6}$/.test(clean)) {
    if (clean.startsWith("60") || clean.startsWith("68") || clean.startsWith("90")) {
      return `sh${clean}`;
    } else {
      return `sz${clean}`;
    }
  }
  return null;
}

export async function fetchSinaAShareKlines(sinaSymbol: string, isWeekly: boolean = false): Promise<Candle[]> {
  const scale = isWeekly ? "1200" : "240";
  const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${sinaSymbol}&scale=${scale}&ma=no&datalen=300`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://finance.sina.com.cn/"
    }
  });

  if (!res.ok) {
    throw new Error(`新浪K线接口请求失败, status: ${res.status}`);
  }

  const data = await res.json();
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error(`新浪K线数据返回为空或格式不正确 (symbol: ${sinaSymbol})`);
  }

  return data.map((c: any) => ({
    date: c.day,
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseInt(c.volume, 10) || 0
  }));
}
