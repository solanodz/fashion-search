/**
 * Fixed-window rate limit kept in memory. Each serverless instance counts on
 * its own, so this caps abuse per instance rather than globally; enough to
 * keep a public demo's paid API calls bounded.
 */
export function createRateLimit({
  limit,
  windowMs,
}: {
  limit: number;
  windowMs: number;
}) {
  const windows = new Map<string, { start: number; count: number }>();
  return function allow(key: string, now = Date.now()): boolean {
    const current = windows.get(key);
    if (!current || now - current.start >= windowMs) {
      // Drop stale entries now and then so the map stays small.
      if (windows.size > 10_000) windows.clear();
      windows.set(key, { start: now, count: 1 });
      return true;
    }
    if (current.count >= limit) return false;
    current.count++;
    return true;
  };
}
