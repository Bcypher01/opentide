"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_CHART_ASSET, type Market } from "./assets";
import type { SessionId } from "./sessions";

interface OpentideState {
  watchlist: string[]; // asset ids, e.g. "crypto:BTC"
  toggleWatch: (id: string) => void;
  isWatched: (id: string) => boolean;

  marketFilter: Market | "all";
  setMarketFilter: (m: Market | "all") => void;

  sessionFilter: SessionId | null;
  setSessionFilter: (s: SessionId | null) => void;

  selectedAsset: string;
  setSelectedAsset: (id: string) => void;

  /** asset shown in the overlay chart modal (subpages), null = closed */
  modalAsset: string | null;
  openModal: (id: string) => void;
  closeModal: () => void;

  /** ⌘K command palette — global, never persisted */
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;

  heroDismissed: boolean;
  dismissHero: () => void;

  /** "What is Opentide" tour modal — opt-in, never auto-opened */
  aboutOpen: boolean;
  openAbout: () => void;
  closeAbout: () => void;
  /** persisted: has the user ever opened the tour? drives the header hint dot */
  aboutSeen: boolean;

  /** local date (YYYY-MM-DD) the daily briefing was last collapsed/read */
  briefingReadDate: string | null;
  setBriefingReadDate: (d: string | null) => void;

  /**
   * Per-day briefing engagement, e.g. { "2026-06-11": { read: 1, reopen: 2 } }.
   * Kept to the last 60 days. Gates the watchlist-digest step on the roadmap:
   * if we aren't reading the briefing ourselves, don't build more into it.
   */
  briefingStats: Record<string, { read: number; reopen: number }>;
  trackBriefing: (date: string, ev: "read" | "reopen") => void;

  useUTC: boolean;
  toggleUTC: () => void;

  /** Morning digest view mode — collapses dashboard to watchlist-only ritual */
  digestMode: boolean;
  setDigestMode: (on: boolean) => void;

  /** Notification preferences */
  notifPrefs: {
    enabled: boolean;
    sessionAlerts: boolean;
    calendarAlerts: boolean;
    leadMinutes: number;
  };
  setNotifPrefs: (prefs: Partial<OpentideState["notifPrefs"]>) => void;
}

export const useStore = create<OpentideState>()(
  persist(
    (set, get) => ({
      watchlist: [],
      toggleWatch: (id) =>
        set((s) => ({
          watchlist: s.watchlist.includes(id)
            ? s.watchlist.filter((x) => x !== id)
            : [...s.watchlist, id],
        })),
      isWatched: (id) => get().watchlist.includes(id),

      marketFilter: "all",
      setMarketFilter: (m) => set({ marketFilter: m }),

      sessionFilter: null,
      setSessionFilter: (s) => set({ sessionFilter: s }),

      selectedAsset: DEFAULT_CHART_ASSET,
      setSelectedAsset: (id) => set({ selectedAsset: id }),

      modalAsset: null,
      openModal: (id) => set({ modalAsset: id }),
      closeModal: () => set({ modalAsset: null }),

      paletteOpen: false,
      openPalette: () => set({ paletteOpen: true }),
      closePalette: () => set({ paletteOpen: false }),
      togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),

      heroDismissed: false,
      dismissHero: () => set({ heroDismissed: true }),

      aboutOpen: false,
      openAbout: () => set({ aboutOpen: true, aboutSeen: true }),
      closeAbout: () => set({ aboutOpen: false }),
      aboutSeen: false,

      briefingReadDate: null,
      setBriefingReadDate: (d) => set({ briefingReadDate: d }),

      briefingStats: {},
      trackBriefing: (date, ev) =>
        set((s) => {
          const day = s.briefingStats[date] ?? { read: 0, reopen: 0 };
          const next = {
            ...s.briefingStats,
            [date]: { ...day, [ev]: day[ev] + 1 },
          };
          // YYYY-MM-DD sorts chronologically as strings; drop oldest past 60
          const keys = Object.keys(next).sort();
          while (keys.length > 60) delete next[keys.shift()!];
          return { briefingStats: next };
        }),

      useUTC: false,
      toggleUTC: () => set((s) => ({ useUTC: !s.useUTC })),

      digestMode: false,
      setDigestMode: (on) => set({ digestMode: on }),

      notifPrefs: {
        enabled: false,
        sessionAlerts: true,
        calendarAlerts: true,
        leadMinutes: 15,
      },
      setNotifPrefs: (prefs) =>
        set((s) => ({ notifPrefs: { ...s.notifPrefs, ...prefs } })),
    }),
    {
      name: "opentide",
      partialize: (s) => ({
        watchlist: s.watchlist,
        useUTC: s.useUTC,
        heroDismissed: s.heroDismissed,
        aboutSeen: s.aboutSeen,
        briefingReadDate: s.briefingReadDate,
        briefingStats: s.briefingStats,
        selectedAsset: s.selectedAsset,
        notifPrefs: s.notifPrefs,
      }),
    }
  )
);
