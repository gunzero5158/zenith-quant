import { request as httpsRequest } from "node:https";

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
