export interface LLMConfig {
  provider: string;   // 'gemini' | 'openai' | 'anthropic' | 'custom'
  apiKey: string;
  baseUrl?: string;
  modelName: string;
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
    const defaultBase = "https://generativelanguage.googleapis.com";
    const base = (baseUrl || defaultBase).replace(/\/$/, "");
    const url = `${base}/v1beta/models/${modelName || "gemini-1.5-flash"}:generateContent?key=${apiKey}`;

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

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini返回数据为空。";
  }

  // --- 2. Anthropic (Claude) ---
  if (provider === "anthropic") {
    const defaultBase = "https://api.anthropic.com";
    const base = (baseUrl || defaultBase).replace(/\/$/, "");
    const url = `${base}/v1/messages`;

    const payload = {
      model: modelName || "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      system: "You are a professional Wall Street quantitative analyst specializing in TradingView stock ideas. Write extremely insightful technical analysis reports with clear headings and bullet points in the language requested by the user.",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data?.content?.[0]?.text || "Anthropic返回数据为空。";
  }

  // --- 3. OpenAI / DeepSeek / Custom OpenAI-compatible ---
  const defaultOpenAIBase = "https://api.openai.com/v1";
  const openaiBase = (baseUrl || defaultOpenAIBase).replace(/\/$/, "");
  const openaiUrl = `${openaiBase}/chat/completions`;

  const payload = {
    model: modelName || "gpt-4o-mini",
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

  const res = await fetch(openaiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${provider.toUpperCase()} API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || `${provider}返回数据为空。`;
}
