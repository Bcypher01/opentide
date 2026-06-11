"use client";

import { usePathname } from "next/navigation";
import { useStore } from "./store";

/**
 * Open an asset's chart from anywhere in the app.
 * On the dashboard it selects the center chart panel (and scrolls on mobile);
 * on every other page it opens the chart modal in place — no rerouting.
 */
export function useOpenChart(): (id: string) => void {
  const pathname = usePathname();
  const setSelectedAsset = useStore((s) => s.setSelectedAsset);
  const openModal = useStore((s) => s.openModal);

  return (id: string) => {
    if (pathname !== "/") {
      openModal(id);
      return;
    }
    setSelectedAsset(id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      document.getElementById("chart")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
}
