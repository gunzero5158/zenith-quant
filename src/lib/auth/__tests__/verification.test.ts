import { describe, it, expect } from "vitest";
import { generateCode, hashCode, isValidEmail, isValidPassword } from "../verification";

describe("generateCode", () => {
  it("returns 6 digits, zero-padded", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("hashCode", () => {
  it("is deterministic per email+code and email-scoped", () => {
    expect(hashCode("a@b.com", "123456")).toBe(hashCode("a@b.com", "123456"));
    expect(hashCode("a@b.com", "123456")).not.toBe(hashCode("c@d.com", "123456"));
    expect(hashCode("a@b.com", "123456")).not.toBe(hashCode("a@b.com", "654321"));
  });

  it("is case-insensitive on the email", () => {
    expect(hashCode("A@B.com", "123456")).toBe(hashCode("a@b.com", "123456"));
  });
});

describe("isValidEmail", () => {
  it("accepts normal addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("u.ser+tag@sub.example.co")).toBe(true);
  });
  it("rejects malformed addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
    expect(isValidEmail(`${"x".repeat(250)}@example.com`)).toBe(false);
  });
});

describe("isValidPassword", () => {
  it("enforces 8-100 chars", () => {
    expect(isValidPassword("short")).toBe(false);
    expect(isValidPassword("longenough")).toBe(true);
    expect(isValidPassword("x".repeat(101))).toBe(false);
  });
});
