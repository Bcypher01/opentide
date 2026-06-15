"use client";

import { useEffect, useState } from "react";
import {
  cancelAllNotifs,
  notifPermission,
  pushConfigured,
  requestNotifPermission,
  subscribeToPush,
  syncPushSubscription,
  unsubscribeFromPush,
  type PushSyncPayload,
} from "@/lib/notifications";
import { useStore } from "@/lib/store";
import { IconBell } from "./Icons";

interface Props {
  onClose: () => void;
}

const LEAD_OPTIONS = [5, 10, 15, 30];

/** Pill toggle — controlled, accessible. */
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
        checked ? "bg-accent" : "bg-surface2 ring-1 ring-inset ring-border"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function NotifSettings({ onClose }: Props) {
  const { notifPrefs, setNotifPrefs, watchlist } = useStore();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const hasPush = pushConfigured();

  useEffect(() => {
    setPermission(notifPermission());
  }, []);

  /** Build the server payload from a set of prefs + current watchlist. */
  function payloadFrom(prefs: typeof notifPrefs): PushSyncPayload {
    return {
      sessionAlerts: prefs.sessionAlerts,
      calendarAlerts: prefs.calendarAlerts,
      watchlistAlerts: prefs.watchlistAlerts,
      leadMinutes: prefs.leadMinutes,
      watchlist,
    };
  }

  /** Update a pref locally and, if subscribed, push the change to the server. */
  function applyPref(partial: Partial<typeof notifPrefs>) {
    setNotifPrefs(partial);
    if (hasPush) void syncPushSubscription(payloadFrom({ ...notifPrefs, ...partial }));
  }

  async function handleToggle(on: boolean) {
    if (on) {
      const p = await requestNotifPermission();
      setPermission(p);
      if (p === "granted") {
        const next = { ...notifPrefs, enabled: true };
        setNotifPrefs({ enabled: true });
        if (hasPush) void subscribeToPush(payloadFrom(next));
      }
    } else {
      cancelAllNotifs();
      setNotifPrefs({ enabled: false });
      if (hasPush) void unsubscribeFromPush();
    }
  }

  const isOn = notifPrefs.enabled && permission === "granted";

  return (
    <div
      role="dialog"
      aria-label="Notification settings"
      className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-border bg-surface shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <IconBell size={14} className="text-accent" />
          <span className="text-sm font-medium text-text">Alerts</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:text-text"
        >
          ✕
        </button>
      </div>

      <div className="p-4">
        {permission === "denied" ? (
          <p className="text-xs leading-relaxed text-muted">
            Notifications are blocked by your browser. Enable them in{" "}
            <strong className="text-text">Site Settings</strong> then reload.
          </p>
        ) : (
          <>
            {/* Master toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text">Enable alerts</p>
                <p className="text-[11px] text-muted">
                  {isOn ? "Notifications are on" : "Get notified before key events"}
                </p>
              </div>
              <Toggle checked={isOn} onChange={handleToggle} />
            </div>

            {/* Sub-settings */}
            {isOn && (
              <>
                <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-text">Session opens</p>
                      <p className="text-[11px] text-muted">London, New York, Tokyo, Sydney</p>
                    </div>
                    <Toggle
                      checked={notifPrefs.sessionAlerts}
                      onChange={(v) => applyPref({ sessionAlerts: v })}
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-text">High-impact events</p>
                      <p className="text-[11px] text-muted">CPI, NFP, FOMC and majors</p>
                    </div>
                    <Toggle
                      checked={notifPrefs.calendarAlerts}
                      onChange={(v) => applyPref({ calendarAlerts: v })}
                    />
                  </label>

                  {hasPush && (
                    <label className="flex cursor-pointer items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-text">Watchlist big moves</p>
                        <p className="text-[11px] text-muted">When a starred asset moves ≥3% today</p>
                      </div>
                      <Toggle
                        checked={notifPrefs.watchlistAlerts}
                        onChange={(v) => applyPref({ watchlistAlerts: v })}
                      />
                    </label>
                  )}
                </div>

                {/* Lead time */}
                <div className="mt-4 border-t border-border/60 pt-4">
                  <p className="mb-2.5 text-xs text-muted">Alert me before</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {LEAD_OPTIONS.map((m) => (
                      <button
                        key={m}
                        onClick={() => applyPref({ leadMinutes: m })}
                        className={`rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                          notifPrefs.leadMinutes === m
                            ? "border-accent/60 bg-accent/10 text-accent"
                            : "border-border bg-surface2 text-muted hover:text-text"
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <p className="mt-4 text-[10px] text-muted/50">
          {hasPush
            ? "No account needed · delivered even when the tab is closed"
            : "In-tab only · no account needed · no data leaves your browser"}
        </p>
      </div>
    </div>
  );
}
