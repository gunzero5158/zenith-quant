import { describe, expect, it } from "vitest";
import { parseLLMJsonResponse } from "../llmJson";

describe("LLM JSON response parsing", () => {
  it("parses plain and fenced JSON responses", () => {
    expect(parseLLMJsonResponse<{ overview: string }>('{"overview":"ok"}')).toEqual({ overview: "ok" });
    expect(parseLLMJsonResponse<{ overview: string }>('```json\n{"overview":"ok"}\n```')).toEqual({ overview: "ok" });
  });

  it("repairs raw line breaks and tabs inside JSON string values", () => {
    const response = `{
      "overview": "First line
Second line",
      "technicalAnalysis": "EMA\tremains constructive"
    }`;

    expect(parseLLMJsonResponse<Record<string, string>>(response)).toEqual({
      overview: "First line\nSecond line",
      technicalAnalysis: "EMA\tremains constructive",
    });
  });

  it("repairs less common control characters inside strings", () => {
    const response = `{"overview":"left${String.fromCharCode(1)}right"}`;
    expect(parseLLMJsonResponse<{ overview: string }>(response).overview).toBe(`left${String.fromCharCode(1)}right`);
  });

  it("preserves escaped quotes, backslashes, and structural whitespace", () => {
    const response = '{\n  "overview": "MSFT says \\"cloud\\" and C:\\\\Azure"\n}';
    expect(parseLLMJsonResponse<{ overview: string }>(response).overview).toBe('MSFT says "cloud" and C:\\Azure');
  });

  it("does not hide unrelated JSON structure errors", () => {
    expect(() => parseLLMJsonResponse('{"overview":"ok",}')).toThrow(SyntaxError);
  });
});
