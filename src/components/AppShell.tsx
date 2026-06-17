"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useNow } from "@/lib/hooks";
import { sessionGreeting } from "@/lib/sessions";
import { useStore } from "@/lib/store";
import { IconBell, IconHelp } from "./Icons";
import Logo, { Wordmark } from "./Logo";

// These overlays are never visible on first paint and the two animated ones
// drag in framer-motion. Loading them with next/dynamic keeps that code out of
// the initial bundle — each chunk is fetched only the first time its overlay
// opens (see the *Loaded latches below), cutting initial JS and main-thread work.
const AboutModal = dynamic(() => import("./AboutModal"), { ssr: false });
const ChartModal = dynamic(() => import("./ChartModal"), { ssr: false });
const CommandPalette = dynamic(() => import("./CommandPalette"), { ssr: false });
const NotifSettings = dynamic(() => import("./NotifSettings"), { ssr: false });

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/pulse", label: "Pulse" },
  { href: "/buzz", label: "Buzz" },
  { href: "/news", label: "News" },
];

export default function AppShell({
  children,
  ticker,
}: {
  children: React.ReactNode;
  ticker?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  const pathname = usePathname();
  const now = useNow(1000);
  const { useUTC, toggleUTC, openAbout, aboutSeen, notifPrefs } = useStore();
  const togglePalette = useStore((s) => s.togglePalette);
  const openPalette = useStore((s) => s.openPalette);

  // Open-state for the lazy overlays. Once an overlay has been opened we keep
  // it mounted (the *Loaded latch) so its enter/exit animations still play on
  // subsequent toggles — but its chunk isn't fetched until that first open.
  const paletteOpen = useStore((s) => s.paletteOpen);
  const aboutOpen = useStore((s) => s.aboutOpen);
  const modalAsset = useStore((s) => s.modalAsset);
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  const [aboutLoaded, setAboutLoaded] = useState(false);
  const [chartLoaded, setChartLoaded] = useState(false);
  useEffect(() => {
    if (paletteOpen) setPaletteLoaded(true);
  }, [paletteOpen]);
  useEffect(() => {
    if (aboutOpen) setAboutLoaded(true);
  }, [aboutOpen]);
  useEffect(() => {
    if (modalAsset) setChartLoaded(true);
  }, [modalAsset]);

  // First visit ever: open the tour once
  useEffect(() => {
    if (mounted && !aboutSeen) openAbout();
  }, [mounted, aboutSeen, openAbout]);

  // Global ⌘K / Ctrl+K toggles the command palette; "/" opens it when the
  // user isn't typing into a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = e.target as HTMLElement | null;
        const tag = el?.tagName;
        const typing =
          tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable;
        if (!typing) {
          e.preventDefault();
          openPalette();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [togglePalette, openPalette]);

  // Close bell popover on outside click
  useEffect(() => {
    if (!bellOpen) return;
    function onDown(e: MouseEvent) {
      const el = document.getElementById("notif-bell-root");
      if (el && !el.contains(e.target as Node)) setBellOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [bellOpen]);

  return (
    <div className="bg-glow flex min-h-screen flex-col">
      {ticker}

      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1700px] items-center gap-1 px-3 py-2.5 sm:gap-2 sm:px-4 lg:px-6">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2 sm:gap-2.5" aria-label="Opentide home">
            <Logo size={28} />
            <Wordmark className="hidden text-xl sm:inline" />
          </Link>

          {/* Nav — horizontally scrollable on very small screens so it never
              pushes the controls off-edge */}
          <nav
            className="scrollbar-none ml-1 flex min-w-0 items-center gap-0.5 overflow-x-auto sm:ml-3 sm:gap-1"
            aria-label="Main navigation"
          >
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors sm:px-3 sm:text-sm ${
                    active
                      ? "bg-surface2 font-medium text-text"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          {/* Spacer — pushes right-side controls to the far right */}
          <div className="flex-1" />

          {mounted && (
            <>
              {/* Session greeting — large screens only */}
              <p className="hidden min-w-0 truncate text-sm text-muted xl:block xl:max-w-xs">
                {sessionGreeting(now)}
              </p>

              {/* Search — ⌘K command palette */}
              <button
                onClick={openPalette}
                title="Search (⌘K)"
                aria-label="Search"
                className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-2 text-muted transition-colors hover:text-text sm:px-2.5 sm:pr-2"
              >
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <kbd className="num hidden rounded border border-border bg-surface2 px-1.5 py-0.5 text-[10px] sm:inline">
                  ⌘K
                </kbd>
              </button>

              {/* Bell — notification settings */}
              <div id="notif-bell-root" className="relative shrink-0">
                <button
                  onClick={() => setBellOpen((v) => !v)}
                  title="Notification settings"
                  aria-label="Notification settings"
                  aria-expanded={bellOpen}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                    notifPrefs.enabled
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-border bg-surface text-muted hover:text-text"
                  }`}
                >
                  <IconBell size={16} />
                </button>
                {bellOpen && <NotifSettings onClose={() => setBellOpen(false)} />}
              </div>

              {/* UTC / local clock toggle — compact (no seconds) on mobile to
                  save width and reduce the per-second repaint */}
              <button
                onClick={toggleUTC}
                className="num shrink-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] text-muted transition-colors hover:text-text sm:px-3 sm:text-sm"
                title="Toggle between local time and UTC"
              >
                <span className="sm:hidden">
                  {useUTC
                    ? `${now.toISOString().slice(11, 16)}Z`
                    : now.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                </span>
                <span className="hidden sm:inline">
                  {useUTC
                    ? `${now.toISOString().slice(11, 19)} UTC`
                    : now.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                </span>
              </button>

              {/* About / tour */}
              <button
                onClick={openAbout}
                title="What is Opentide? Take the 60-second tour"
                aria-label="About Opentide"
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-text"
              >
                <IconHelp size={16} />
                {!aboutSeen && (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                )}
              </button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1700px] flex-1 px-4 pb-10 pt-4 lg:px-6">
        {children}
      </main>

      {mounted && chartLoaded && <ChartModal />}
      {mounted && aboutLoaded && <AboutModal />}
      {mounted && paletteLoaded && <CommandPalette />}

      <footer className="mx-auto w-full max-w-[1700px] px-4 pb-8 text-center text-xs text-muted/60 lg:px-6">
        <p>
          Data: Binance · Frankfurter (ECB) · Finnhub · CoinGecko · Yahoo · CoinDesk · Cointelegraph
          · CNBC · MarketWatch · FXStreet. Charts by TradingView. Not investment advice.
        </p>
        <p className="mt-2">
          Built by{" "}
          <a
            href="https://olumideb.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-muted/80 underline-offset-2 transition-colors hover:text-text hover:underline"
          >
            Olumide
          </a>{" "}
          ·{" "}
          <a
            href="https://github.com/bcypher01"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 transition-colors hover:text-text hover:underline"
          >
            GitHub
          </a>{" "}
          ·{" "}
          <a
            href="https://olumideb.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 transition-colors hover:text-text hover:underline"
          >
            Portfolio
          </a>
        </p>
      </footer>
    </div>
  );
}
