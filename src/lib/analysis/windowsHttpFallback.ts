import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const ALLOWED_HOSTS = new Set([
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
]);

export async function fetchYahooJsonViaWindows<T>(url: string, timeoutMs: number): Promise<T> {
  if (process.platform !== "win32") {
    throw new Error("Windows HTTP fallback is unavailable on this platform");
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" || !ALLOWED_HOSTS.has(parsedUrl.hostname)) {
    throw new Error(`Windows HTTP fallback rejected host: ${parsedUrl.hostname}`);
  }

  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const script = [
    "$ProgressPreference = 'SilentlyContinue'",
    "$response = Invoke-WebRequest -Uri $env:ZENITH_HTTP_URL -UseBasicParsing -TimeoutSec ([int]$env:ZENITH_HTTP_TIMEOUT)",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "[Console]::Write($response.Content)",
  ].join("; ");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ZENITH_HTTP_URL: url,
        ZENITH_HTTP_TIMEOUT: String(timeoutSeconds),
      },
      maxBuffer: MAX_RESPONSE_BYTES,
      timeout: timeoutMs + 2000,
      windowsHide: true,
    },
  );

  return JSON.parse(stdout) as T;
}
