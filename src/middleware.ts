// ---------------------------------------------------------------------------
// middleware.ts — per-IP rate limiting for the API surface.
//
// Runs on every /api/* request (see `config.matcher`). Each client IP gets a
// fixed-window budget; expensive routes get a stricter budget. Over the limit
// → 429 with Retry-After + standard X-RateLimit-* headers. Allowed requests
// also carry the X-RateLimit-* headers so clients can self-throttle.
//
// The Inngest endpoint is skipped: it has its own signing-key auth and is
// machine-to-machine, so it shouldn't share a human IP budget. If Upstash
// isn't configured the limiter fails open (see rate-limit.ts).
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

// Routes exempt from rate limiting (authenticated machine-to-machine).
const EXEMPT_PREFIXES = ["/api/inngest"];

// Expensive routes that reach large upstream universes / heavy computation.
const STRICT_PREFIXES = ["/api/search", "/api/sessionstats"];

// AI routes hit a quota-limited LLM upstream — kept on the tightest per-IP
// budget so one client can't burn the shared free-tier quota. (The route also
// serves a 10-min shared cache; see app/api/recommendations/route.ts.)
const AI_PREFIXES = ["/api/recommendations", "/api/explain"];

// Budgets (requests per window, per IP).
const DEFAULT_LIMIT = 60;
const STRICT_LIMIT = 20;
const AI_LIMIT = 10;
const WINDOW_SECONDS = 60;

/** Best-effort client IP from the usual proxy headers (Vercel sets these). */
function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Pick the tightest matching budget: AI < strict < default.
  let limit = DEFAULT_LIMIT;
  let bucket = "api-default";
  if (AI_PREFIXES.some((p) => pathname.startsWith(p))) {
    limit = AI_LIMIT;
    bucket = "api-ai";
  } else if (STRICT_PREFIXES.some((p) => pathname.startsWith(p))) {
    limit = STRICT_LIMIT;
    bucket = "api-strict";
  }

  const ip = clientIp(req);
  const result = await rateLimit(ip, { limit, windowSeconds: WINDOW_SECONDS, bucket });

  const headers = new Headers({
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  });

  if (!result.allowed) {
    headers.set("Retry-After", String(result.retryAfter));
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests. Slow down." },
      { status: 429, headers },
    );
  }

  const res = NextResponse.next();
  headers.forEach((value, key) => res.headers.set(key, value));
  return res;
}

// Only run on the API surface. Static assets and pages are untouched.
export const config = {
  matcher: ["/api/:path*"],
};
