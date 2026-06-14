import type { NextConfig } from "next";

// Static security headers applied to every response. The Content-Security-Policy
// is set separately in middleware.ts because it needs a per-request nonce.
const securityHeaders = [
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
