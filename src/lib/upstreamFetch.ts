// ---------------------------------------------------------------------------
// upstreamFetch.ts — fetch wrapper for EXTERNAL market-data providers.
//
// Same signature as global fetch, plus two things global fetch lacks:
//   1. A per-attempt timeout (AbortSignal.timeout) so a stalled TCP/TLS connect
//      fails fast instead of hanging on undici's stock 10s connect timeout.
//   2. Transparent retry with exponential backoff.
//
// External hosts (Binance, Finnhub, Frankfurter) are reached over a high-latency
// link and occasionally stall the connect; a single stalled socket otherwise
// surfaces as `UND_ERR_CONNECT_TIMEOUT` and the datapoint is lost. A short
// timeout + a couple of retries turns those transient stalls into successes.
//
// Retries on: any thrown error (connect/response timeout via abort, reset, DNS)
// and the transient HTTP statuses 429/500/502/503/504. Non-transient responses
// (401/404/…) are returned as-is on the first try. After the final attempt the
// last error is rethrown / last Response returned, so callers keep their
// existing `res.ok` + try/catch degrade paths unchanged.
//
// Only for third-party upstreams. Internal own-route reads use internalFetch.ts.
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface RetryOptions {
  /** Extra attempts after the first (default 2 → up to 3 total tries). */
  retries?: number;
  /** Base backoff in ms; delay is base * 2**attempt (default 250). */
  backoffMs?: number;
  /** Per-attempt timeout in ms; abort + retry past this (default 7000). */
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function upstreamFetch(
  input: string | URL,
  init?: RequestInit & { next?: { revalidate?: number } },
  { retries = 2, backoffMs = 250, timeoutMs = 7000 }: RetryOptions = {},
): Promise<Response> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Respect a caller-supplied signal; otherwise bound each attempt so a
      // stalled connect aborts and retries instead of hanging.
      const signal = init?.signal ?? AbortSignal.timeout(timeoutMs);
      const res = await fetch(input, { ...init, signal });
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
