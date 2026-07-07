// Minimal in-memory sliding-window rate limiter. Per-instance only — good
// enough to blunt brute force on a single Vercel function instance; swap for
// Upstash if the app ever runs hot enough for that to matter.
const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 10_000;

export function rateLimit(key: string, maxHits: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) buckets.clear();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= maxHits) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
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
