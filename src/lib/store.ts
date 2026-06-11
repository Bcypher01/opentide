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

  heroDismissed: boolean;
  dismissHero: () => void;

  useUTC: boolean;
  toggleUTC: () => void;
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

      heroDismissed: false,
      dismissHero: () => set({ heroDismissed: true }),

      useUTC: false,
      toggleUTC: () => set((s) => ({ useUTC: !s.useUTC })),
    }),
    {
      name: "opentide",
      partialize: (s) => ({
        watchlist: s.watchlist,
        useUTC: s.useUTC,
        heroDismissed: s.heroDismissed,
        selectedAsset: s.selectedAsset,
      }),
    }
  )
);
