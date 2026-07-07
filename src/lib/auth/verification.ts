import { createHash, randomInt } from "crypto";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_RESEND_COOLDOWN_MS = 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(email: string, code: string): string {
  // Codes are 6 digits with a 5-attempt limit, so a salted sha256 is enough.
  return createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex");
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export function isValidPassword(password: string): boolean {
  return typeof password === "string" && password.length >= 8 && password.length <= 100;
}
