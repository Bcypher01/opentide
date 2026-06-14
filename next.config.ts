import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy. This is a *static*, nonce-free policy so every route
// stays statically prerendered and CDN-cacheable. (A per-request nonce would
// force dynamic rendering on every page — that's what hung the live site after
// the strict-CSP merge.) Without a nonce/hash, 'unsafe-inline' is what lets
// Next's inline bootstrap + RSC payload scripts execute on a static page.
//
// UPGRADE PATH — to get the strict "no 'unsafe-inline'" CSP back (e.g. to pass
// Lighthouse's XSS audit) WITHOUT giving up static rendering, switch from a
// nonce to build-time hash integrity: add `experimental: { sri: { algorithm:
// "sha256" } }` below and drop 'unsafe-inline' from script-src. SRI is still
// experimental, so verify on a Vercel *preview* deploy first — App Router's
// inline scripts are the known edge case. And when you add sign-up, revisit this
// together with httpOnly/SameSite session cookies: authed pages render
// dynamically anyway, so a per-request nonce CSP becomes cost-free on them.
const csp = [
  `default-src 'self'`,
  // 'unsafe-eval' is dev-only — Next's HMR/Fast Refresh compiles modules with eval().
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Inline styles are required by Tailwind's runtime + framer-motion.
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' blob: data: https:`,
  `font-src 'self'`,
  // The Binance market-data mirror is the only direct client-side connection
  // (live crypto prices over WebSocket).
  `connect-src 'self' https://data-stream.binance.vision wss://data-stream.binance.vision`,
  // TradingView chart embeds.
  `frame-src https://www.tradingview.com https://s.tradingview.com`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  // NOTE: Trusted Types enforcement (`require-trusted-types-for 'script'`) is
  // deliberately NOT set. It only runs in a production build, which is why the
  // app worked in `next dev` but crashed on every Vercel deploy: multiple
  // scripts on the page assign a raw string to `script.src` and none of them go
  // through a Trusted Types policy —
  //   1. @vercel/analytics (<Analytics/> in the root layout) injects its script
  //      with a plain-string src and creates no policy at all; and
  //   2. Next's webpack runtime falls back to a raw string whenever its
  //      createPolicy("nextjs#bundler") call throws (it's instantiated more than
  //      once under the App Router).
  // Either one trips the rule and takes the whole app down with a client-side
  // exception. Making third-party scripts TT-compliant isn't feasible, and the
  // only workaround — a global passthrough `default` policy — would neuter
  // Trusted Types anyway. Every other CSP directive above still applies; this
  // just drops the one defense-in-depth layer that's incompatible here.
  // To revisit, do it behind a per-request nonce on authed/dynamic pages only.
  `upgrade-insecure-requests`,
].join("; ");

// Static security headers applied to every response.
const securityHeaders = [
  // The CSP above — now static, so it lives here alongside the other headers
  // rather than in middleware.
  { key: "Content-Security-Policy", value: csp },
  // Stop other origins embedding us in a frame (clickjacking). frame-ancestors
  // in the CSP is the modern equivalent; we send both for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't let browsers MIME-sniff responses away from their declared type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Isolate our browsing context group — required for a strong origin boundary
  // and to satisfy the "origin isolation with COOP" best-practice check.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Trim the referrer we leak to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop powerful features we never use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Tell browsers to stick to HTTPS for two years (incl. subdomains).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Don't advertise the framework.
  poweredByHeader: false,

  // Strip console.* from production bundles (keeps console.error) — smaller JS
  // and a cleaner console, addressing the "errors logged to console" notice.
  compiler: {
    removeConsole: { exclude: ["error"] },
  },

  // Let Next tree-shake these libraries so only the parts we import ship.
  experimental: {
    optimizePackageImports: ["framer-motion"],
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
