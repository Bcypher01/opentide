// ---------------------------------------------------------------------------
// notifications.ts — alert scheduling, two delivery paths:
//
//   1. In-tab  — Notification API scheduled via setTimeout (+ a SW message),
//                works while the tab/SW is alive. The zero-config fallback.
//   2. Web Push — when VAPID + a server are configured, the browser registers
//                a push subscription and the Inngest cron delivers alerts
//                even when the tab is closed. See subscribeToPush() below.
//
// Both are $0; push adds a tiny serverless store (Upstash) + cron.
// ---------------------------------------------------------------------------

import type { CalendarEvent } from "@/app/api/calendar/route";
import type { SessionState } from "./sessions";

export type NotifPrefs = {
  enabled: boolean;
  sessionAlerts: boolean;
  calendarAlerts: boolean;
  /** notify when a watchlist asset moves >=3% on the day (push only) */
  watchlistAlerts: boolean;
  leadMinutes: number;
};

// Timers currently pending — keyed by a stable tag so we don't double-schedule.
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Request notification permission. Returns the resulting PermissionState. */
export async function requestNotifPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

/** Current permission without prompting. */
export function notifPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

/** Show a notification now (or via SW if available). */
function fire(title: string, body: string, tag: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  // Try via SW first (works even if the tab has lost focus)
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SCHEDULE_NOTIF",
      title,
      body,
      fireAt: Date.now(),
      tag,
    });
  } else {
    // Fallback: direct Notification API
    new Notification(title, {
      body,
      icon: "/icon-192.png",
      tag,
    });
  }
}

/** Schedule a notification at a future ms epoch. Idempotent per tag. */
function schedule(title: string, body: string, tag: string, fireAt: number) {
  if (pending.has(tag)) return; // already scheduled
  const delay = fireAt - Date.now();
  if (delay < 0 || delay > 24 * 60 * 60 * 1000) return; // past or >24h out

  // Schedule via SW message (survives tab sleep better)
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SCHEDULE_NOTIF",
      title,
      body,
      fireAt,
      tag,
    });
  }

  // Also schedule via setTimeout as a backup
  const t = setTimeout(() => {
    pending.delete(tag);
    fire(title, body, tag);
  }, delay);
  pending.set(tag, t);
}

/** Cancel all pending timers (call before re-scheduling). */
export function cancelAllNotifs() {
  for (const t of pending.values()) clearTimeout(t);
  pending.clear();
}

// ---------------------------------------------------------------------------
// Session open alerts
// ---------------------------------------------------------------------------

/** Schedule "X session opens in leadMinutes" for each upcoming session open. */
export function scheduleSessionAlerts(
  states: SessionState[],
  prefs: NotifPrefs
) {
  if (!prefs.enabled || !prefs.sessionAlerts) return;
  if (notifPermission() !== "granted") return;

  const lead = prefs.leadMinutes * 60_000;
  const now = Date.now();

  for (const s of states) {
    if (!s.opensAt) continue;
    const fireAt = s.opensAt - lead;
    if (fireAt <= now) continue; // already past the lead time

    const tag = `session-open:${s.def.id}:${s.opensAt}`;
    const title = `${s.def.name} opens in ${prefs.leadMinutes} min`;
    const body = s.def.hint;
    schedule(title, body, tag, fireAt);
  }
}

// ---------------------------------------------------------------------------
// Economic calendar alerts
// ---------------------------------------------------------------------------

/** Schedule alerts for upcoming high-impact calendar events. */
export function scheduleCalendarAlerts(
  events: CalendarEvent[],
  prefs: NotifPrefs
) {
  if (!prefs.enabled || !prefs.calendarAlerts) return;
  if (notifPermission() !== "granted") return;

  const lead = prefs.leadMinutes * 60_000;
  const now = Date.now();

  const high = events.filter((e) => e.impact === "High" && e.ts > now);

  for (const e of high) {
    const fireAt = e.ts - lead;
    if (fireAt <= now) continue;

    const tag = `calendar:${e.id}`;
    const title = `${e.title} (${e.country}) in ${prefs.leadMinutes} min`;
    const body = e.forecast ? `Forecast: ${e.forecast}` : "High-impact release";
    schedule(title, body, tag, fireAt);
  }
}

// ---------------------------------------------------------------------------
// Web Push — closed-tab delivery via the server cron.
// ---------------------------------------------------------------------------
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** True when the deployment has push wired up (VAPID public key present). */
export function pushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC);
}

/** Browser supports the Push API + service workers. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** VAPID keys are base64url; subscribe() wants the raw bytes as an ArrayBuffer. */
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

/** What the server needs to target and filter a subscription. */
export interface PushSyncPayload {
  sessionAlerts: boolean;
  calendarAlerts: boolean;
  watchlistAlerts: boolean;
  leadMinutes: number;
  watchlist: string[];
}

async function postSubscription(
  subscription: PushSubscription,
  payload: PushSyncPayload
): Promise<boolean> {
  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        prefs: {
          sessionAlerts: payload.sessionAlerts,
          calendarAlerts: payload.calendarAlerts,
          watchlistAlerts: payload.watchlistAlerts,
          leadMinutes: payload.leadMinutes,
        },
        watchlist: payload.watchlist,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure a push subscription exists and register it (with prefs + watchlist)
 * on the server. Safe to call repeatedly. Returns true on success.
 */
export async function subscribeToPush(payload: PushSyncPayload): Promise<boolean> {
  if (!pushConfigured() || !pushSupported()) return false;
  if (notifPermission() !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC),
      });
    }
    return postSubscription(sub, payload);
  } catch {
    return false;
  }
}

/**
 * Push the latest prefs/watchlist to the server for an EXISTING subscription.
 * No-op if the user never subscribed. Use this on watchlist/pref changes.
 */
export async function syncPushSubscription(payload: PushSyncPayload): Promise<void> {
  if (!pushConfigured() || !pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await postSubscription(sub, payload);
  } catch {
    /* ignore */
  }
}

/** Outcome of a test-push attempt — maps to UI feedback. */
export type TestPushResult =
  | "ok"
  | "unsupported"
  | "not_subscribed"
  | "no_subscription"
  | "push_not_configured"
  | "error";

/**
 * Ask the server to deliver one test notification to THIS browser's
 * subscription. Returns a status that pinpoints where the path breaks.
 */
export async function sendTestPush(): Promise<TestPushResult> {
  if (!pushConfigured() || !pushSupported()) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return "not_subscribed";
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    if (res.ok) return "ok";
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return (data.error as TestPushResult) ?? "error";
  } catch {
    return "error";
  }
}

/** Unsubscribe locally and tell the server to drop the record. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  } catch {
    /* ignore */
  }
}
