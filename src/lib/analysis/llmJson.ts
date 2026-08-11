function stripMarkdownFence(value: string): string {
  const trimmed = value.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function escapeControlCharactersInsideStrings(value: string): string {
  let result = "";
  let insideString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const code = character.charCodeAt(0);

    if (!insideString) {
      result += character;
      if (character === '"') insideString = true;
      continue;
    }

    if (escaped) {
      result += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      result += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      result += character;
      insideString = false;
      continue;
    }

    if (code <= 0x1f) {
      if (character === "\b") result += "\\b";
      else if (character === "\t") result += "\\t";
      else if (character === "\n") result += "\\n";
      else if (character === "\f") result += "\\f";
      else if (character === "\r") result += "\\r";
      else result += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }

    result += character;
  }

  return result;
}

function parseJsonCandidate(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (initialError) {
    const repaired = escapeControlCharactersInsideStrings(value);
    if (repaired === value) throw initialError;
    return JSON.parse(repaired);
  }
}

function extractBalancedObjectCandidates(value: string): string[] {
  const candidates: string[] = [];

  for (let start = 0; start < value.length; start += 1) {
    if (value[start] !== "{") continue;

    let depth = 0;
    let insideString = false;
    let escaped = false;

    for (let index = start; index < value.length; index += 1) {
      const character = value[index];

      if (insideString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          insideString = false;
        }
        continue;
      }

      if (character === '"') {
        insideString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(value.slice(start, index + 1));
          break;
        }
      }
    }
  }

  return candidates;
}

function requireJsonObject<T>(value: unknown): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SyntaxError("LLM response must contain a JSON object.");
  }
  return value as T;
}

export function parseLLMJsonResponse<T>(response: string): T {
  const cleaned = stripMarkdownFence(response);
  let initialError: unknown;

  try {
    const parsed = parseJsonCandidate(cleaned);
    return requireJsonObject<T>(parsed);
  } catch (error) {
    if (!(error instanceof SyntaxError) || error.message === "LLM response must contain a JSON object.") {
      throw error;
    }
    initialError = error;
  }

  for (const candidate of extractBalancedObjectCandidates(cleaned)) {
    if (candidate === cleaned) continue;
    try {
      return requireJsonObject<T>(parseJsonCandidate(candidate));
    } catch {
      // Keep scanning: explanatory text may contain braces before the real payload.
    }
  }

  throw initialError;
}
