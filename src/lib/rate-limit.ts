// ---------------------------------------------------------------------------
// rate-limit.ts — edge-safe, fixed-window rate limiter backed by Upstash Redis.
//
// Mirrors the keyless-fetch Redis pattern in push-server.ts, but deliberately
// imports NOTHING from node / "server-only" so it can run inside Next.js
// middleware (Edge runtime). The whole module is plain fetch + Web APIs.
//
// Strategy: a fixed window per (key, route-bucket). The first request in a
// window does INCR -> 1 and sets EXPIRE NX = windowSeconds; every later request
// in the same window just increments. When the counter exceeds the limit we
// reject with the seconds left until the key expires.
//
// Degrades gracefully: if Upstash isn't configured, or the REST call fails for
// any reason, we FAIL OPEN (allow the request). A rate limiter should never be
// the thing that takes the app down — and local dev has no Redis.
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** True when the limiter has a backing store and will actually enforce. */
export function rateLimitEnabled(): boolean {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

export interface RateLimitResult {
  /** Whether the request is allowed through. */
  allowed: boolean;
  /** Configured ceiling for this window. */
  limit: number;
  /** Requests left in the current window (never negative). */
  remaining: number;
  /** Unix epoch seconds at which the window resets. */
  reset: number;
  /** Seconds until reset — convenient for a Retry-After header. */
  retryAfter: number;
}

// Upstash pipeline endpoint: POST an array of commands, get back an array of
// { result } | { error }. One round trip keeps INCR + EXPIRE effectively
// atomic for our purposes.
async function pipeline(
  commands: (string | number)[][],
): Promise<Array<{ result?: unknown; error?: string }> | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Array<{ result?: unknown; error?: string }>;
  } catch {
    return null;
  }
}

/**
 * Check (and consume) one unit from the fixed window for `identifier`.
 *
 * @param identifier  Stable per-client key, e.g. an IP address.
 * @param opts.limit  Max requests allowed per window.
 * @param opts.windowSeconds  Window length in seconds.
 * @param opts.bucket Namespace so different route groups get separate budgets.
 */
export async function rateLimit(
  identifier: string,
  opts: { limit: number; windowSeconds: number; bucket?: string },
): Promise<RateLimitResult> {
  const { limit, windowSeconds, bucket = "default" } = opts;
  const now = Math.floor(Date.now() / 1000);

  // Window-aligned key so counters reset cleanly and old keys self-expire.
  const windowId = Math.floor(now / windowSeconds);
  const key = `rl:${bucket}:${identifier}:${windowId}`;
  const reset = (windowId + 1) * windowSeconds;
  const retryAfter = Math.max(1, reset - now);

  // No store configured -> fail open, but report the budget as full so callers
  // can still surface sensible headers.
  if (!rateLimitEnabled()) {
    return { allowed: true, limit, remaining: limit, reset, retryAfter };
  }

  const results = await pipeline([
    ["INCR", key],
    // Only set the TTL on the first hit of the window; NX avoids resetting it.
    ["EXPIRE", key, windowSeconds, "NX"],
  ]);

  // Pipeline failed -> fail open.
  if (!results || results.length === 0 || typeof results[0]?.result !== "number") {
    return { allowed: true, limit, remaining: limit, reset, retryAfter };
  }

  const count = results[0].result as number;
  const remaining = Math.max(0, limit - count);
  const allowed = count <= limit;

  return { allowed, limit, remaining, reset, retryAfter };
}
