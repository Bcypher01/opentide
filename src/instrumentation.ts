// ---------------------------------------------------------------------------
// instrumentation.ts — runs once on server startup (Next.js instrumentation
// hook). We use it to install a process-wide undici dispatcher so EVERY
// server-side fetch (route handlers, RSC, cache revalidation) shares one tuned
// HTTP client.
//
// Why: Node's built-in fetch (undici) defaults to a 10s connect timeout with no
// retries, and its Happy-Eyeballs path could pick a stalling address family.
// From a high-latency link, firing a burst of parallel requests (e.g. one
// Finnhub call per symbol) means an occasional socket stalls past 10s and
// throws `UND_ERR_CONNECT_TIMEOUT` — even though the host is perfectly
// reachable (curl connects in <100ms). Widening the connect timeout, pinning
// IPv4, and bounding the per-origin connection pool removes that whole class of
// spurious timeouts. Per-request retry lives in lib/upstreamFetch.ts.
// ---------------------------------------------------------------------------

export async function register() {
  // Guard the Node runtime: undici isn't available on the Edge runtime, and the
  // dynamic import keeps it out of the Edge bundle entirely.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { setGlobalDispatcher, Agent } = await import("undici");

  setGlobalDispatcher(
    new Agent({
      connect: {
        // Give a stalled TLS handshake room to recover instead of the stock 10s.
        timeout: 20_000,
        // Force IPv4: these providers publish no usable AAAA records, and a
        // broken IPv6 route is a classic "curl works, fetch hangs" cause.
        family: 4,
      },
      // Cap sockets per origin so a batched route (many symbols at once) can't
      // open a connection storm that starves the link and self-inflicts timeouts.
      connections: 8,
      keepAliveTimeout: 30_000,
    }),
  );
}
