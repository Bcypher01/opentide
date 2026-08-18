// ---------------------------------------------------------------------------
// upstreamFetch.ts — fetch wrapper for EXTERNAL market-data providers.
//
// Same signature as global fetch, plus transparent retry with exponential
// backoff. External hosts (Binance, Finnhub, Frankfurter) are reached over a
// high-latency link and occasionally stall the TCP/TLS connect; Node's undici
// gives up at its connect timeout with ZERO retries, so a single stalled socket
// surfaces as `UND_ERR_CONNECT_TIMEOUT` and the datapoint is lost. A couple of
// quick retries turn those transient stalls into successes.
//
// Retries on: any thrown network error (connect timeout, reset, DNS) and the
// transient HTTP statuses 429/500/502/503/504. Non-transient responses (e.g.
// 401/404) are returned as-is on the first try — retrying them is pointless.
// After the final attempt the last error is rethrown / last Response returned,
// so callers keep their existing `res.ok` + try/catch degrade paths unchanged.
//
// Only for third-party upstreams. Internal own-route reads use internalFetch.ts.
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface RetryOptions {
  /** Extra attempts after the first (default 2 → up to 3 total tries). */
  retries?: number;
  /** Base backoff in ms; delay is base * 2**attempt (default 250). */
  backoffMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function upstreamFetch(
  input: string | URL,
  init?: RequestInit & { next?: { revalidate?: number } },
  { retries = 2, backoffMs = 250 }: RetryOptions = {},
): Promise<Response> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      // Success or a non-transient status → hand straight back to the caller.
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === retries) {
        return res;
      }
      lastErr = new Error(`upstream ${res.status}`);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) throw err;
    }
    await sleep(backoffMs * 2 ** attempt);
  }

  // Unreachable in practice (loop returns or throws), but satisfies the types.
  throw lastErr;
}
