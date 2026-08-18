// ---------------------------------------------------------------------------
// instrumentation.ts — runs once on server startup (Next.js instrumentation
// hook). We use it to make every server-side fetch prefer IPv4.
//
// Why: Node's built-in fetch (undici) uses a Happy-Eyeballs path that can pick
// an IPv6 address whose route silently blackholes, so the connect stalls for
// the full timeout and throws `UND_ERR_CONNECT_TIMEOUT` — even though the host
// is perfectly reachable over IPv4 (curl connects in <100ms). Our upstream
// providers (Binance, Finnhub, Frankfurter) publish no usable AAAA records, so
// pinning IPv4 removes that whole class of spurious timeouts.
//
// We deliberately do NOT import `undici` to tune a global Agent: it isn't an
// installed dependency (webpack can't resolve it → build fails), and its
// setGlobalDispatcher wouldn't reliably bind to Node's built-in fetch anyway.
// `node:dns` is a core module, so this stays dependency-free. Per-request
// connect/response timeouts + retry live in lib/upstreamFetch.ts.
// ---------------------------------------------------------------------------

export async function register() {
  // Node runtime only — the Edge runtime has no `node:dns`.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    // webpackIgnore keeps webpack from trying to bundle the `node:` scheme
    // (it errors with UnhandledSchemeError); Node resolves it natively at
    // runtime, which is the only place register() ever runs.
    const { setDefaultResultOrder } = await import(
      /* webpackIgnore: true */ "node:dns"
    );
    setDefaultResultOrder("ipv4first");
  } catch {
    // Very old Node without the API — safe to ignore.
  }
}
