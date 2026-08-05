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

export function parseLLMJsonResponse<T>(response: string): T {
  const cleaned = stripMarkdownFence(response);

  try {
    return JSON.parse(cleaned) as T;
  } catch (initialError) {
    const repaired = escapeControlCharactersInsideStrings(cleaned);
    if (repaired === cleaned) throw initialError;
    return JSON.parse(repaired) as T;
  }
}
