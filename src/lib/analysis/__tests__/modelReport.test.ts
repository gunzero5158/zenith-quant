import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateLLMReport } from "../llmProxy";
import { requestValidatedReport, ReportValidationError } from "../modelReport";
vi.mock("../llmProxy", () => ({ generateLLMReport: vi.fn() }));
const generate = vi.mocked(generateLLMReport);
const config = { provider: "custom" as const, apiKey: "test", modelName: "test" };
const validate = (value: unknown) => {
  const result = value as { status: string; text: string };
  if (result.status !== "consistent") throw new Error("status/action conflict");
  return result;
};
describe("Model-owned report repair", () => {
  beforeEach(() => vi.resetAllMocks());
  it("returns a valid independent report verbatim without a second call", async () => {
    generate.mockResolvedValue(JSON.stringify({status:"consistent",text:"Independent judgment"}));
    expect(await requestValidatedReport("facts",config,"system",validate)).toEqual({status:"consistent",text:"Independent judgment"});
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("sends a specific conflict back to the model and returns only the model repair", async () => {
    generate.mockResolvedValueOnce('{"status":"conflicting","text":"Original"}')
      .mockResolvedValueOnce('{"status":"consistent","text":"Model repaired"}');
    const deadline=Date.now()+30_000;
    expect((await requestValidatedReport("facts",config,"system",validate,deadline)).text).toBe("Model repaired");
    expect(generate.mock.calls[1][0]).toContain("status/action conflict");
    expect(generate.mock.calls[1][0]).toContain("Original");
    expect(generate.mock.calls[1][3]).toBeLessThanOrEqual(generate.mock.calls[0][3]!);
  });
  it("fails explicitly after one repair with no fallback report", async () => {
    generate.mockResolvedValue('{"status":"conflicting"}');
    await expect(requestValidatedReport("facts",config,"system",validate)).rejects.toBeInstanceOf(ReportValidationError);
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("does not retry transport failures or start with an exhausted budget", async () => {
    generate.mockRejectedValue(new Error("HTTP 524"));
    await expect(requestValidatedReport("facts",config,"system",validate)).rejects.toThrow("524");
    expect(generate).toHaveBeenCalledTimes(1);
    await expect(requestValidatedReport("facts",config,"system",validate,Date.now())).rejects.toThrow("deadline");
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
