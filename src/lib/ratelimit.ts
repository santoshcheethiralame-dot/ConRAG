// Fixed-window limiter, in-process. Good enough for one server instance; a shared
// store (Redis, or a Postgres table) would be needed behind several.
const hits = new Map<string, { n: number; reset: number }>();

export function tooMany(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const h = hits.get(key);
  if (!h || h.reset <= now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    return false;
  }
  h.n++;
  return h.n > limit;
}

export function clearLimits() {
  hits.clear();
}
