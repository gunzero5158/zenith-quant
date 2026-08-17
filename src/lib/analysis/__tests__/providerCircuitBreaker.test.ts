import { describe, expect, it, vi } from "vitest";
import { ProviderCircuitBreaker, runSequentialProviderChain } from "../providerCircuitBreaker";

describe("ProviderCircuitBreaker", () => {
  it("opens after consecutive failures and retries after the cooldown", () => {
    const breaker = new ProviderCircuitBreaker(2, 5_000);

    expect(breaker.shouldAttempt("yahoo", false, 1_000)).toBe(true);
    breaker.recordFailure("yahoo", 1_000);
    expect(breaker.shouldAttempt("yahoo", false, 1_001)).toBe(true);

    breaker.recordFailure("yahoo", 2_000);
    expect(breaker.shouldAttempt("yahoo", false, 6_999)).toBe(false);
    expect(breaker.shouldAttempt("yahoo", false, 7_000)).toBe(true);
  });

  it("clears failures after a successful request", () => {
    const breaker = new ProviderCircuitBreaker(2, 5_000);

    breaker.recordFailure("eastmoney", 1_000);
    breaker.recordSuccess("eastmoney");
    breaker.recordFailure("eastmoney", 2_000);

    expect(breaker.shouldAttempt("eastmoney", false, 2_001)).toBe(true);
  });

  it("never attempts another provider after data has already succeeded", () => {
    const breaker = new ProviderCircuitBreaker();
    expect(breaker.shouldAttempt("tonghuashun", true, 1_000)).toBe(false);
  });

  it("treats an empty provider response as a failure and tries the next provider", async () => {
    const breaker = new ProviderCircuitBreaker(1, 5_000);
    const attempt = vi.fn(async (provider: "yahoo" | "tencent") =>
      provider === "yahoo" ? null : { source: provider },
    );

    const result = await runSequentialProviderChain(
      ["yahoo", "tencent"],
      attempt,
      { circuitBreaker: breaker },
    );

    expect(result).toEqual({ provider: "tencent", value: { source: "tencent" } });
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(breaker.shouldAttempt("yahoo", false)).toBe(false);
  });

  it("records thrown failures and continues through the provider chain", async () => {
    const breaker = new ProviderCircuitBreaker(1, 5_000);
    const failure = new Error("provider unavailable");
    const onFailure = vi.fn();

    const result = await runSequentialProviderChain(
      ["eastmoney", "tonghuashun"],
      async (provider) => {
        if (provider === "eastmoney") throw failure;
        return "ok";
      },
      { circuitBreaker: breaker, onFailure },
    );

    expect(result).toEqual({ provider: "tonghuashun", value: "ok" });
    expect(onFailure).toHaveBeenCalledWith("eastmoney", failure);
  });
});
