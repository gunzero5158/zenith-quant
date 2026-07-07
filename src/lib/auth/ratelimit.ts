// Minimal in-memory sliding-window rate limiter. Per-instance only — good
// enough to blunt brute force on a single Vercel function instance; swap for
// Upstash if the app ever runs hot enough for that to matter. Durable
// per-account limits (verification-code attempts/cooldowns) live in the DB.
const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 10_000;
const MAX_WINDOW_MS = 60 * 60 * 1000;

// On overflow, drop expired buckets, then oldest entries — never wipe every
// counter at once, or an attacker can reset their own limit by flooding keys.
function evict(now: number): void {
  for (const [key, hits] of buckets) {
    if (hits.every((t) => now - t >= MAX_WINDOW_MS)) buckets.delete(key);
  }
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

export function rateLimit(key: string, maxHits: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size >= MAX_BUCKETS) evict(now);
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= maxHits) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  // Delete-then-set keeps recently active keys at the tail of the Map's
  // insertion order, so eviction drops the stalest keys first.
  buckets.delete(key);
  buckets.set(key, hits);
  return true;
}

export function clientIp(req: { headers: Headers }): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
