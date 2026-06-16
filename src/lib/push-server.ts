// ---------------------------------------------------------------------------
// push-server.ts — server-only Web Push plumbing.
//
//   · Subscription storage  → Upstash Redis (REST, free tier, keyless fetch).
//   · Delivery              → web-push with VAPID.
//   · Dedupe                → short-lived Redis keys so the every-5-min cron
//                             fires each alert exactly once.
//
// Everything degrades gracefully: if the env isn't configured the helpers
// no-op (pushConfigured() === false) and the app stays on in-tab alerts.
// ---------------------------------------------------------------------------

import "server-only";
import crypto from "node:crypto";
import webpush from "web-push";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@opentide.app";

const SUBS_KEY = "push:subs"; // Redis hash: subId -> StoredSub JSON

/** True when storage + VAPID are all configured. */
export function pushConfigured(): boolean {
  return Boolean(REDIS_URL && REDIS_TOKEN && VAPID_PUBLIC && VAPID_PRIVATE);
}

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    vapidReady = true;
  }
}

// ---------------------------------------------------------------------------
// Upstash REST — POST a command array to the base URL, read back { result }.
// ---------------------------------------------------------------------------
async function redis<T = unknown>(...command: (string | number)[]): Promise<T | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(REDIS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: T; error?: string };
    return (json.result ?? null) as T | null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Subscription model
// ---------------------------------------------------------------------------
export interface PushPrefs {
  sessionAlerts: boolean;
  calendarAlerts: boolean;
  watchlistAlerts: boolean;
  leadMinutes: number;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface StoredSub {
  subscription: PushSubscriptionJSON;
  prefs: PushPrefs;
  watchlist: string[]; // asset ids
  updatedAt: number;
}

/** Stable id for a subscription (its endpoint hashed). */
export function subIdFor(endpoint: string): string {
  return crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
}

export async function upsertSub(sub: StoredSub): Promise<boolean> {
  const id = subIdFor(sub.subscription.endpoint);
  const ok = await redis("HSET", SUBS_KEY, id, JSON.stringify(sub));
  return ok !== null;
}

export async function removeSubByEndpoint(endpoint: string): Promise<void> {
  await redis("HDEL", SUBS_KEY, subIdFor(endpoint));
}

async function removeSubById(id: string): Promise<void> {
  await redis("HDEL", SUBS_KEY, id);
}

/** Look up a single stored subscription by its endpoint. */
export async function getSubByEndpoint(endpoint: string): Promise<StoredSub | null> {
  const raw = await redis<string | null>("HGET", SUBS_KEY, subIdFor(endpoint));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSub;
  } catch {
    return null;
  }
}

/** All stored subscriptions, paired with their id. */
export async function allSubs(): Promise<Array<{ id: string; sub: StoredSub }>> {
  // HGETALL returns a flat [field, value, field, value, ...] array.
  const flat = (await redis<string[]>("HGETALL", SUBS_KEY)) ?? [];
  const out: Array<{ id: string; sub: StoredSub }> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      out.push({ id: flat[i], sub: JSON.parse(flat[i + 1]) as StoredSub });
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

/**
 * Atomic "fire this alert once" guard. Returns true the first time a given
 * (subId, tag) is seen within `ttlSeconds`, false afterwards.
 */
export async function claimOnce(
  subId: string,
  tag: string,
  ttlSeconds: number
): Promise<boolean> {
  const res = await redis<string | null>(
    "SET",
    `push:sent:${subId}:${tag}`,
    "1",
    "NX",
    "EX",
    ttlSeconds
  );
  return res === "OK";
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------
export interface PushMessage {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

/**
 * Send one push. Returns "ok" | "gone" | "error". On "gone" (404/410) the
 * caller should drop the subscription — the browser has unsubscribed.
 */
export async function sendPush(
  id: string,
  sub: StoredSub,
  msg: PushMessage
): Promise<"ok" | "gone" | "error"> {
  ensureVapid();
  if (!vapidReady) return "error";
  try {
    await webpush.sendNotification(
      sub.subscription as unknown as webpush.PushSubscription,
      JSON.stringify(msg)
    );
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await removeSubById(id);
      return "gone";
    }
    return "error";
  }
}
