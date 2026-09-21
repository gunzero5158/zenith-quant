import { fetchWithTimeout, parseUpstreamJson, resolveBaseUrl, sanitizeModelName, upstreamError } from "./llmProxy";
import type { JevQuestion } from "./jevDecision";

export interface JevConfig {
  apiKey: string;
  baseUrl?: string;
  modelName?: string;
}

export interface JevResponse {
  model?: string;
  answers?: Record<string, unknown>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const JEV_DEFAULT_BASE_URL = "https://api.typesafe.ai";
const JEV_DEFAULT_MODEL = "jev-latest";
const JEV_TIMEOUT_MS = 30_000;
// 429 (rate limit) and 529 (overloaded) are documented as retryable with backoff.
const JEV_RETRY_DELAYS_MS = [1_000, 3_000];

/** Accepts a bare host, a /v1 base, or the full /v1/systemone endpoint. */
export function resolveJevEndpoint(baseUrl: string | undefined): string {
  const base = resolveBaseUrl(baseUrl, JEV_DEFAULT_BASE_URL);
  const parsed = new URL(base);
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (/\/systemone$/i.test(pathname)) return base;
  parsed.pathname = /\/v1$/i.test(pathname) ? `${pathname}/systemone` : `${pathname}/v1/systemone`;
  return parsed.toString().replace(/\/+$/, "");
}

export async function requestJevDecision(
  state: unknown,
  questions: Record<string, JevQuestion>,
  config: JevConfig
): Promise<JevResponse> {
  if (!config.apiKey) {
    throw new Error("Missing API Key for Jev");
  }

  const url = resolveJevEndpoint(config.baseUrl);
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: sanitizeModelName(config.modelName, JEV_DEFAULT_MODEL),
      state,
      questions,
    }),
  };

  for (let attempt = 0; ; attempt++) {
    const res = await fetchWithTimeout(url, init, "Jev", JEV_TIMEOUT_MS);
    if (res.ok) {
      return parseUpstreamJson<JevResponse>("Jev", res);
    }
    const retryDelay = JEV_RETRY_DELAYS_MS[attempt];
    if ((res.status === 429 || res.status === 529) && retryDelay !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      continue;
    }
    throw await upstreamError("Jev", res);
  }
}
