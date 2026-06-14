import { NextResponse, type NextRequest } from "next/server";

/**
 * Generates a fresh nonce per request and ships a strict, nonce-based
 * Content-Security-Policy. Next.js detects the nonce in the request's CSP
 * header and automatically stamps it onto every script tag it emits, so
 * `'strict-dynamic'` lets those trusted scripts load their own chunks while
 * everything else is blocked — this is what satisfies Lighthouse's
 * "CSP is effective against XSS" and "Mitigate DOM-based XSS" checks.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    `default-src 'self'`,
    // strict-dynamic + nonce: trusted scripts only, no host allowlist needed.
    // https:/http: are ignored by CSP3 browsers but kept as a fallback for old ones.
    // 'unsafe-eval' is added in dev only — Next's HMR/Fast Refresh compiles
    // modules with eval(); without it the app never hydrates. Production stays strict.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    // Inline styles are required by Tailwind's runtime + framer-motion.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self'`,
    // 'self' covers our /api routes; the Binance market-data mirror is the only
    // direct client-side connection (live crypto prices over WebSocket).
    `connect-src 'self' https://data-stream.binance.vision wss://data-stream.binance.vision`,
    // TradingView chart embeds.
    `frame-src https://www.tradingview.com https://s.tradingview.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    // Lock DOM sinks to vetted policies (Trusted Types). Report-only in dev so a
    // missing policy never blocks Fast Refresh while iterating.
    ...(isDev ? [] : [`require-trusted-types-for 'script'`, `trusted-types nextjs default dompurify`]),
    `upgrade-insecure-requests`,
  ].join("; ");

  // Next reads the CSP from the request header and auto-stamps the nonce onto
  // its own scripts, so we only need to forward the policy on the request.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and image files, which don't
    // execute scripts and benefit from staying cacheable.
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
