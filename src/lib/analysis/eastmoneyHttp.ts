import { request as httpsRequest } from "node:https";

interface EastMoneyKlineUrlOptions {
  host: string;
  secid: string;
  klt: string;
  limit: number;
}

export function buildEastMoneyKlineUrl(options: EastMoneyKlineUrlOptions): string {
  const params = new URLSearchParams({
    secid: options.secid,
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56",
    klt: options.klt,
    fqt: "1",
    beg: "19900101",
    end: "20991231",
    lmt: String(options.limit),
    ut: "fa5fd190ac2ec2c49a057690f96c340f",
  });

  return `https://${options.host}/api/qt/stock/kline/get?${params.toString()}`;
}

export async function fetchEastMoneyJson<T>(url: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = httpsRequest(url, {
      agent: false,
      timeout: timeoutMs,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://quote.eastmoney.com/",
        "Accept": "application/json,*/*",
      },
    }, (res) => {
      const chunks: Buffer[] = [];

      res.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`EastMoney request failed (${res.statusCode || "unknown"})`));
          return;
        }

        try {
          resolve(JSON.parse(text) as T);
        } catch (error: unknown) {
          reject(error);
        }
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("EastMoney request timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}
