import { eq } from "drizzle-orm";
import { ensureDbReady, schema } from "@/lib/db";
import type { LLMConfig } from "@/lib/analysis/llmProxy";

export const DEFAULT_PRICE_PER_USE_CENTS = 5; // 0.05 元

const PRICE_KEY = "price_per_use_cents";
const PLATFORM_LLM_KEY = "platform_llm";

export async function getSetting<T>(key: string): Promise<T | null> {
  const db = await ensureDbReady();
  const row = (
    await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).limit(1)
  )[0];
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await ensureDbReady();
  const now = Date.now();
  await db.insert(schema.appSettings)
    .values({ key, value: JSON.stringify(value), updatedAt: now })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: JSON.stringify(value), updatedAt: now },
    });
}

export async function getPricePerUseCents(): Promise<number> {
  const v = await getSetting<number>(PRICE_KEY);
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : DEFAULT_PRICE_PER_USE_CENTS;
}

export async function setPricePerUseCents(cents: number): Promise<void> {
  await setSetting(PRICE_KEY, cents);
}

export type PlatformLlmConfig = LLMConfig;

export async function getPlatformLlmConfig(): Promise<PlatformLlmConfig | null> {
  const v = await getSetting<PlatformLlmConfig>(PLATFORM_LLM_KEY);
  return v && typeof v.apiKey === "string" && v.apiKey ? v : null;
}

export async function setPlatformLlmConfig(config: PlatformLlmConfig): Promise<void> {
  await setSetting(PLATFORM_LLM_KEY, config);
}
