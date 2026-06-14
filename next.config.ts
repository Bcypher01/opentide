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
  // Lock DOM script sinks to vetted Trusted Types policies (prod only, so Fast
  // Refresh is never blocked in dev). Next's webpack runtime creates a
  // "nextjs#bundler" policy to set <script>.src for chunk loading, so that name
  // must be allow-listed. CRUCIALLY, the App Router instantiates the webpack
  // runtime more than once, so createPolicy("nextjs#bundler") runs repeatedly;
  // without 'allow-duplicates' the 2nd call throws "already exists", the runtime
  // silently falls back to assigning a raw string to script.src, and that trips
  // require-trusted-types-for — crashing the app with a client-side exception
  // (no CSP "violates" message, since the name itself is allowed).
  ...(isDev
    ? []
    : [
        `require-trusted-types-for 'script'`,
        `trusted-types nextjs#bundler nextjs default dompurify 'allow-duplicates'`,
      ]),
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
