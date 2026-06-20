import { NextResponse, type NextRequest } from "next/server";
import {
  explainCacheKey,
  getExplanation,
  sanitizeTarget,
  type ExplainResult,
} from "@/lib/explain";

// ---------------------------------------------------------------------------
// /api/explain — POST a single tappable market object, get a short plain-English
// explanation back.
//
//   POST { "kind": "headline", "title": "...", "source"?, "market"?, "assets"? }
//   POST { "kind": "event",    "title": "...", "country"?, "impact"? }
//   POST { "kind": "funding",  "symbol": "BTC", "ratePct": 0.0123 }
//   POST { "kind": "mover",    "symbol": "BTC", "changePct": 4.2, "name"?, "market"? }
//
// Same quota hygiene as /api/recommendations: results are cached per normalized
// target for an hour and shared across clients (headlines/events are stable for
// a long time), the cache is bounded (LRU eviction), and the route is on the
// strict per-IP "api-ai" budget in middleware.ts. Degrades gracefully: with no
// provider key (or on any failure) it returns { degraded: true } and the UI
// hides the affordance. Never 502s.
// ---------------------------------------------------------------------------

export const revalidate = 0; // we manage our own cache below
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — explanations of a fixed item are stable
const DEGRADED_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

const cache = new Map<string, { data: ExplainResult; expires: number }>();

function cacheGet(key: string): ExplainResult | null {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  if (hit) cache.delete(key);
  return null;
}

function cacheSet(key: string, data: ExplainResult): void {
  cache.set(key, {
    data,
    expires: Date.now() + (data.degraded ? DEGRADED_TTL_MS : CACHE_TTL_MS),
  });
  // Insertion-ordered map → first key is oldest; evict it when over budget.
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const target = sanitizeTarget(body);
  if (!target) {
    return NextResponse.json({ error: "invalid target" }, { status: 400 });
  }

  const key = explainCacheKey(target);
  const cached = cacheGet(key);
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });
  }

  const data = await getExplanation(target);
  cacheSet(key, data);
  return NextResponse.json(data, { headers: { "X-Cache": "MISS" } });
}
