import { NextResponse } from "next/server";
import {
  getSubByEndpoint,
  pushConfigured,
  sendPush,
  subIdFor,
} from "@/lib/push-server";

// web-push needs Node APIs (crypto) — not the edge runtime.
export const runtime = "nodejs";

/**
 * On-demand verification: deliver a single test notification to the caller's
 * own subscription. The JSON response is itself diagnostic —
 *   503 push_not_configured  → server env (VAPID/Redis) incomplete
 *   400 missing_endpoint     → client sent no endpoint
 *   404 no_subscription      → this browser never registered (toggle Alerts on)
 *   200 { ok:false, result } → stored, but delivery failed (VAPID/push service)
 *   200 { ok:true }          → full path works; a notification was sent
 */
export async function POST(req: Request) {
  if (!pushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "push_not_configured" },
      { status: 503 }
    );
  }

  let endpoint: string | undefined;
  try {
    endpoint = ((await req.json()) as { endpoint?: string }).endpoint;
  } catch {
    /* tolerate empty body */
  }
  if (!endpoint) {
    return NextResponse.json(
      { ok: false, error: "missing_endpoint" },
      { status: 400 }
    );
  }

  const sub = await getSubByEndpoint(endpoint);
  if (!sub) {
    return NextResponse.json(
      { ok: false, error: "no_subscription" },
      { status: 404 }
    );
  }

  const result = await sendPush(subIdFor(endpoint), sub, {
    title: "Opentide test ✓",
    body: "Push is working — you'll get session, calendar and watchlist alerts here.",
    tag: "opentide-test",
    url: "/",
  });

  return NextResponse.json({ ok: result === "ok", result });
}
