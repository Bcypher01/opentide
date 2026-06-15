import { NextResponse } from "next/server";
import {
  pushConfigured,
  removeSubByEndpoint,
  upsertSub,
  type PushPrefs,
  type PushSubscriptionJSON,
} from "@/lib/push-server";

// web-push needs Node APIs (crypto) — not the edge runtime.
export const runtime = "nodejs";

interface SubscribeBody {
  subscription?: PushSubscriptionJSON;
  prefs?: Partial<PushPrefs>;
  watchlist?: string[];
}

function normalizePrefs(p: Partial<PushPrefs> | undefined): PushPrefs {
  return {
    sessionAlerts: p?.sessionAlerts ?? true,
    calendarAlerts: p?.calendarAlerts ?? true,
    watchlistAlerts: p?.watchlistAlerts ?? false,
    leadMinutes: Math.min(60, Math.max(1, Math.round(p?.leadMinutes ?? 15))),
  };
}

export async function POST(req: Request) {
  if (!pushConfigured()) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  }

  const watchlist = Array.isArray(body.watchlist)
    ? body.watchlist.filter((x) => typeof x === "string").slice(0, 100)
    : [];

  const ok = await upsertSub({
    subscription: { endpoint: sub.endpoint, keys: sub.keys },
    prefs: normalizePrefs(body.prefs),
    watchlist,
    updatedAt: Date.now(),
  });

  if (!ok) return NextResponse.json({ error: "store_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  let endpoint: string | undefined;
  try {
    endpoint = ((await req.json()) as { endpoint?: string }).endpoint;
  } catch {
    /* tolerate empty body */
  }
  if (!endpoint) {
    return NextResponse.json({ error: "missing_endpoint" }, { status: 400 });
  }
  await removeSubByEndpoint(endpoint);
  return NextResponse.json({ ok: true });
}
