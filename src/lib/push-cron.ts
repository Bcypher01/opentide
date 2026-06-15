// ---------------------------------------------------------------------------
// push-cron.ts — the alert computation driven by the scheduler:
//   · /api/inngest     (Inngest scheduled function — the only trigger)
//
// Pure server logic: load subscriptions, work out which session-open,
// high-impact-calendar and watchlist-move alerts are due right now, dedupe
// per subscriber, and deliver them.
// ---------------------------------------------------------------------------

import "server-only";
import { ASSET_BY_ID } from "@/lib/assets";
import type { CalendarEvent, CalendarPayload } from "@/app/api/calendar/route";
import { getAllSessionStates } from "@/lib/sessions";
import { allSubs, claimOnce, sendPush } from "@/lib/push-server";

const MOVE_THRESHOLD = 3; // percent
const MAX_LEAD_MS = 60 * 60_000; // never look further than 60 min ahead

export interface CronResult {
  ok: boolean;
  subs: number;
  sent: number;
  pruned: number;
}

/**
 * Absolute base URL for fetching this app's own public API routes from a
 * server context that has no incoming request (Inngest). Configure APP_URL in
 * prod; falls back to Vercel's URL env, then localhost in dev.
 */
export function appBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** Fetch one of this deployment's own JSON endpoints. */
async function self<T>(origin: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${origin}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Build an asset-id -> 24h change% map from the three price endpoints. */
async function changeMap(origin: string): Promise<Record<string, number>> {
  type QuoteResp = { quotes?: Array<{ symbol: string; changePct: number | null }> };
  const markets: Array<["crypto" | "forex" | "stocks", string]> = [
    ["crypto", "/api/crypto"],
    ["forex", "/api/forex"],
    ["stocks", "/api/stocks"],
  ];
  const map: Record<string, number> = {};
  const results = await Promise.all(
    markets.map(([, path]) => self<QuoteResp>(origin, path))
  );
  results.forEach((resp, i) => {
    const market = markets[i][0];
    for (const q of resp?.quotes ?? []) {
      if (q.changePct === null || q.changePct === undefined) continue;
      map[`${market}:${q.symbol}`] = q.changePct;
    }
  });
  return map;
}

/**
 * Compute and deliver all due alerts. `origin` is the absolute base URL used
 * to read this app's own market-data routes.
 */
export async function runPushCron(origin: string): Promise<CronResult> {
  const now = Date.now();

  const subs = await allSubs();
  if (subs.length === 0) return { ok: true, subs: 0, sent: 0, pruned: 0 };

  // ---- shared inputs, fetched once for all subscribers ----
  const states = getAllSessionStates(new Date(now));
  const cal = await self<CalendarPayload>(origin, "/api/calendar");
  const highEvents: CalendarEvent[] = (cal?.events ?? []).filter(
    (e) => e.impact === "High" && e.ts > now && e.ts - now <= MAX_LEAD_MS
  );
  // Only pull prices if at least one subscriber wants move alerts.
  const wantMoves = subs.some(({ sub }) => sub.prefs.watchlistAlerts);
  const changes = wantMoves ? await changeMap(origin) : {};
  const dayKey = new Date(now).toISOString().slice(0, 10);

  let sent = 0;
  let pruned = 0;

  for (const { id, sub } of subs) {
    const lead = Math.max(1, sub.prefs.leadMinutes) * 60_000;

    const fire = async (tag: string, ttl: number, msg: Parameters<typeof sendPush>[2]) => {
      if (!(await claimOnce(id, tag, ttl))) return;
      const r = await sendPush(id, sub, msg);
      if (r === "ok") sent++;
      else if (r === "gone") pruned++;
    };

    // 1) Session opens
    if (sub.prefs.sessionAlerts) {
      for (const s of states) {
        if (s.opensAt === null) continue;
        const delta = s.opensAt - now;
        if (delta <= 0 || delta > lead) continue;
        const mins = Math.max(1, Math.round(delta / 60_000));
        await fire(`sess:${s.def.id}:${s.opensAt}`, 12 * 3600, {
          title: `${s.def.name} opens in ${mins} min`,
          body: s.def.hint,
          tag: `sess:${s.def.id}`,
          url: "/",
        });
      }
    }

    // 2) High-impact calendar events
    if (sub.prefs.calendarAlerts) {
      for (const e of highEvents) {
        const delta = e.ts - now;
        if (delta <= 0 || delta > lead) continue;
        const mins = Math.max(1, Math.round(delta / 60_000));
        await fire(`cal:${e.id}`, 6 * 3600, {
          title: `${e.title} (${e.country}) in ${mins} min`,
          body: e.forecast ? `High-impact · forecast ${e.forecast}` : "High-impact release",
          tag: `cal:${e.id}`,
          url: "/",
        });
      }
    }

    // 3) Watchlist big moves (>= 3% on the day) — once per asset per day.
    if (sub.prefs.watchlistAlerts) {
      for (const assetId of sub.watchlist) {
        const pct = changes[assetId];
        if (pct === undefined || Math.abs(pct) < MOVE_THRESHOLD) continue;
        const a = ASSET_BY_ID[assetId];
        const label = a?.symbol ?? assetId;
        const up = pct >= 0;
        await fire(`move:${assetId}:${dayKey}`, 26 * 3600, {
          title: `${label} ${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`,
          body: `Big move on your watchlist${a ? ` — ${a.name}` : ""}`,
          tag: `move:${assetId}`,
          url: "/",
        });
      }
    }
  }

  return { ok: true, subs: subs.length, sent, pruned };
}
