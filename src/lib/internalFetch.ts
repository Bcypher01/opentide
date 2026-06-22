// ---------------------------------------------------------------------------
// internalFetch.ts — read this app's own /api/* routes server-side.
//
// Lifted out of app/api/recommendations/route.ts so the agent toolset and the
// recommendations route share ONE implementation of "resolve a base URL + GET a
// own-route JSON payload, never throw". Each upstream route already manages its
// own cache (revalidate), so callers here just ask and degrade to null on any
// failure — same posture as the rest of the codebase (never 502 the caller).
// ---------------------------------------------------------------------------

/** Absolute base URL for reading this app's own data routes server-side. */
export function internalBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Fetch one own-route JSON payload; null on any failure (never throws).
 * `revalidate` is the seconds the result may be served from Next's fetch cache
 * (defaults to 5 min, matching the recommendations route).
 */
export async function readRoute<T>(
  path: string,
  revalidate = 300,
): Promise<T | null> {
  try {
    const res = await fetch(`${internalBaseUrl()}${path}`, {
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
