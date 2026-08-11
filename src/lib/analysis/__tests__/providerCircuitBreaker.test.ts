import { describe, expect, it } from "vitest";
import { ProviderCircuitBreaker } from "../providerCircuitBreaker";

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
});
