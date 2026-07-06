export interface LLMConfig {
  provider: string;   // 'gemini' | 'openai' | 'anthropic' | 'custom'
  apiKey: string;
  baseUrl?: string;
  modelName: string;
}

const OFFICIAL_PROVIDER_TIMEOUT_MS = 60_000;
const MAX_UPSTREAM_ERROR_CHARS = 240;

// Hostnames/IP ranges that must never be reachable through a user-supplied baseUrl.
// This blocks SSRF against cloud metadata endpoints and internal networks.
// Self-hosted users who run a local LLM (e.g. Ollama) can opt back in with
// ZENITH_ALLOW_PRIVATE_LLM_HOSTS=true.
const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,               // link-local / cloud metadata (AWS/GCP/Azure)
  /^\[?::1\]?$/,               // IPv6 loopback
  /^\[?fc/i,                   // IPv6 unique-local fc00::/7
  /^\[?fe80/i,                 // IPv6 link-local
  /^metadata\./i,
  /\.internal$/i,
];

function allowPrivateHosts(): boolean {
  return process.env.ZENITH_ALLOW_PRIVATE_LLM_HOSTS === "true";
}

/**
 * Validates a user-supplied LLM base URL and returns it normalized (no trailing slash).
 * Rejects non-HTTP(S) schemes, embedded credentials, and private/metadata hosts.
 */
function resolveBaseUrl(baseUrl: string | undefined, defaultBase: string): string {
  if (!baseUrl || !baseUrl.trim()) return defaultBase;

  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    throw new Error("Invalid LLM baseUrl: not a valid URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Invalid LLM baseUrl: only http(s) is supported");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Invalid LLM baseUrl: credentials in URL are not allowed");
  }
  if (!allowPrivateHosts() && PRIVATE_HOST_PATTERNS.some((p) => p.test(parsed.hostname))) {
    throw new Error("Invalid LLM baseUrl: private or internal hosts are not allowed");
  }

  return parsed.toString().replace(/\/+$/, "");
}

/** Model names are interpolated into URL paths; keep them to a conservative charset. */
function sanitizeModelName(modelName: string | undefined, fallback: string): string {
  const name = (modelName || "").trim() || fallback;
  if (!/^[\w.:\-]+$/.test(name)) {
    throw new Error("Invalid LLM model name");
  }
  return name;
}

/** Builds an error without echoing unbounded upstream response bodies back to the client. */
async function upstreamError(provider: string, res: Response): Promise<Error> {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, MAX_UPSTREAM_ERROR_CHARS);
  } catch {
    // ignore body read failures
  }
  return new Error(`${provider} API Error (${res.status}): ${detail}`);
}

async function fetchWithTimeout(url: string, init: RequestInit, provider: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${provider} API timeout after ${timeoutMs / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Dynamically forwards the generated analysis prompt to the specified LLM provider using standard HTTP fetch.
 */
export async function generateLLMReport(prompt: string, config: LLMConfig): Promise<string> {
  const { provider, apiKey, baseUrl, modelName } = config;

  if (!apiKey) {
    throw new Error("Missing API Key for LLM provider");
  }

  // --- 1. Google Gemini ---
  if (provider === "gemini") {
    const base = resolveBaseUrl(baseUrl, "https://generativelanguage.googleapis.com");
    const model = sanitizeModelName(modelName, "gemini-1.5-flash");
    // API key goes in a header instead of the query string so it never lands in proxy/access logs.
    const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    };

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload)
    }, "Gemini", OFFICIAL_PROVIDER_TIMEOUT_MS);

    if (!res.ok) {
      throw await upstreamError("Gemini", res);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini返回数据为空。";
  }

  // --- 2. Anthropic (Claude) ---
  if (provider === "anthropic") {
    const base = resolveBaseUrl(baseUrl, "https://api.anthropic.com");
    const url = `${base}/v1/messages`;

    const payload = {
      model: sanitizeModelName(modelName, "claude-sonnet-5"),
      max_tokens: 4096,
      system: "You are a professional Wall Street quantitative analyst specializing in TradingView stock ideas. Write extremely insightful technical analysis reports with clear headings and bullet points in the language requested by the user.",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(payload)
    }, "Anthropic", OFFICIAL_PROVIDER_TIMEOUT_MS);

    if (!res.ok) {
      throw await upstreamError("Anthropic", res);
    }

    const data = await res.json();
    return data?.content?.[0]?.text || "Anthropic返回数据为空。";
  }

  // --- 3. OpenAI / DeepSeek / Custom OpenAI-compatible ---
  const openaiBase = resolveBaseUrl(baseUrl, "https://api.openai.com/v1");
  const openaiUrl = `${openaiBase}/chat/completions`;

  const payload = {
    model: sanitizeModelName(modelName, "gpt-4o-mini"),
    messages: [
      {
        role: "system",
        content: "You are a professional Wall Street quantitative analyst specializing in TradingView stock ideas. Write extremely insightful technical analysis reports with clear headings and bullet points in the language requested by the user."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.3
  };

  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  };

  // "custom" endpoints get the same timeout as official providers — a hung
  // endpoint must never hold the request handler open indefinitely.
  const res = await fetchWithTimeout(openaiUrl, requestInit, provider.toUpperCase(), OFFICIAL_PROVIDER_TIMEOUT_MS);

  if (!res.ok) {
    throw await upstreamError(provider.toUpperCase(), res);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || `${provider}返回数据为空。`;
}
