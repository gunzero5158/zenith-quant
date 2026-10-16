import type { AnalysisMode } from "./analysisMode";

const INDEX = "zenith_analysis_index";
const PREFIX = "zenith_analysis_";
const PER_MODE_LIMIT = 15;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Cache only analysis results. Never evict settings, credentials or validation records. */
export function createReportCacheStore<T>(getStorage: () => Store) {
  const memory = new Map<string, T>();
  const idFor = (symbol: string, mode: AnalysisMode) => `${mode}:${symbol.trim().toUpperCase()}`;
  const index = (): string[] => {
    try {
      const value: unknown = JSON.parse(getStorage().getItem(INDEX) ?? "[]");
      return Array.isArray(value) ? [...new Set(value.filter((id): id is string =>
        typeof id === "string" && /^(rule-ai|ai-native|jev-ai):/.test(id)))] : [];
    } catch { return []; }
  };
  const removeId = (id: string) => {
    memory.delete(id);
    try { getStorage().removeItem(PREFIX + id); } catch { /* memory remains usable */ }
  };
  const touch = (symbol: string, mode: AnalysisMode) => {
    const id = idFor(symbol, mode);
    if (memory.has(id)) { const value = memory.get(id)!; memory.delete(id); memory.set(id, value); }
    const ids = [...new Set([id, ...index(), ...[...memory.keys()].reverse()])];
    let count = 0;
    const keep = ids.filter(key => {
      if (!key.startsWith(`${mode}:`) || ++count <= PER_MODE_LIMIT) return true;
      removeId(key);
      return false;
    });
    try { getStorage().setItem(INDEX, JSON.stringify(keep)); } catch { /* no storage quota */ }
  };
  return {
    read(symbol: string, mode: AnalysisMode): T | null {
      const id = idFor(symbol, mode);
      if (memory.has(id)) return memory.get(id)!;
      try {
        const raw = getStorage().getItem(PREFIX + id);
        if (!raw) return null;
        const value = JSON.parse(raw) as T;
        memory.set(id, value);
        touch(symbol, mode);
        return value;
      } catch { return null; }
    },
    write(symbol: string, mode: AnalysisMode, entry: T): boolean {
      const id = idFor(symbol, mode);
      memory.delete(id);
      memory.set(id, entry);
      touch(symbol, mode);
      const serialized = JSON.stringify(entry);
      const victims = index().filter(key => key !== id).reverse();
      for (;;) {
        try {
          getStorage().setItem(PREFIX + id, serialized);
          touch(symbol, mode);
          return true;
        } catch (error) {
          // Quota failures used to silently discard the newest (often large LLM) report.
          // Keep the newest in memory even when persistent storage is unavailable.
          if (!(error instanceof Error) || error.name !== "QuotaExceededError" || !victims.length) return false;
          const victim = victims.shift()!;
          try {
            getStorage().removeItem(PREFIX + victim);
            getStorage().setItem(INDEX, JSON.stringify(index().filter(key => key !== victim)));
          } catch { return false; }
        }
      }
    },
    touch,
    remove(symbol: string, mode: AnalysisMode) {
      const id = idFor(symbol, mode);
      removeId(id);
      try { getStorage().setItem(INDEX, JSON.stringify(index().filter(key => key !== id))); } catch { /* blocked storage */ }
    },
  };
}
