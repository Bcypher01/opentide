"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CHART_INTERVALS, resolveChartTarget, tvEmbedUrl } from "@/lib/chart";
import { timeAgo } from "@/lib/format";
import { usePolling } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import type { NewsItem } from "./NewsFeed";

interface NewsPayload {
  items: NewsItem[];
}

/**
 * Overlay chart modal — opened when an asset is tapped anywhere outside the
 * dashboard. Shows the TradingView chart plus the stories tagged to it.
 */
export default function ChartModal() {
  const modalAsset = useStore((s) => s.modalAsset);
  const closeModal = useStore((s) => s.closeModal);
  const setSelectedAsset = useStore((s) => s.setSelectedAsset);
  const [interval, setInterval] = useState("60");
  const news = usePolling<NewsPayload>("/api/news", 300_000);

  // ESC to close + scroll lock + pause background animation while open
  // (mirrors AboutModal / the ⌘K palette — the marquee ticker repaints
  // continuously under the overlay otherwise)
  useEffect(() => {
    if (!modalAsset) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("overlay-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      document.body.classList.remove("overlay-open");
    };
  }, [modalAsset, closeModal]);

  if (!modalAsset) return null;

  const target = resolveChartTarget(modalAsset);

  // Related stories: tagged to this asset, or (for custom symbols) a
  // word-boundary match on the ticker in the headline.
  const related = (news.data?.items ?? [])
    .filter((it) => {
      if (target.assetId) return it.assets.includes(target.assetId);
      const sym = target.displaySymbol.split(" ")[0];
      return sym.length >= 2 && new RegExp(`(^|[^A-Za-z0-9])${sym}([^A-Za-z0-9]|$)`, "i").test(it.title);
    })
    .slice(0, 6);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Chart and news for ${target.displaySymbol}`}
    >
      {/* backdrop */}
      <button
        aria-label="Close"
        onClick={closeModal}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* panel */}
      <div className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        {/* header */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-base font-semibold">{target.displaySymbol}</h2>
              <span className="truncate text-xs text-muted">{target.displayName}</span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface2 p-0.5">
              {CHART_INTERVALS.map((iv) => (
                <button
                  key={iv.value}
                  onClick={() => setInterval(iv.value)}
                  className={`num min-h-[28px] rounded-md px-2 py-0.5 text-xs transition-colors ${
                    interval === iv.value ? "bg-text text-bg" : "text-muted hover:text-text"
                  }`}
                >
                  {iv.label}
                </button>
              ))}
            </div>
            <Link
              href="/"
              onClick={() => {
                setSelectedAsset(modalAsset);
                closeModal();
              }}
              className="hidden rounded-lg border border-border bg-surface2 px-3 py-1.5 text-xs text-muted transition-colors hover:text-text sm:block"
            >
              Open on dashboard
            </Link>
            <button
              onClick={closeModal}
              aria-label="Close chart"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface2 hover:text-text"
            >
              ✕
            </button>
          </div>
        </div>

        {/* chart */}
        <div className="h-[320px] w-full shrink-0 bg-bg sm:h-[400px]">
          <iframe
            key={`${target.symbol}-${interval}`}
            src={tvEmbedUrl(target.symbol, interval)}
            title={`TradingView chart — ${target.displaySymbol}`}
            className="h-full w-full"
            frameBorder="0"
            allowFullScreen
          />
        </div>

        {/* related news */}
        <div className="min-h-0 overflow-y-auto border-t border-border p-3">
          <h3 className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted">
            Related news
          </h3>
          {news.data === null ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-4" />
              ))}
            </div>
          ) : related.length === 0 ? (
            <p className="px-1 py-1.5 text-xs text-muted">
              No recent stories tagged to {target.displaySymbol} on the wire.
            </p>
          ) : (
            related.map((it, i) => (
              <a
                key={`${it.link}-${i}`}
                href={it.link}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg px-2 py-2 transition-colors hover:bg-surface2"
              >
                <span className="text-[13px] leading-snug text-text">{it.title}</span>
                <span className="mt-0.5 block text-[11px] text-muted">
                  {it.source} · <span className="num">{timeAgo(it.ts, Date.now())}</span>
                </span>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
