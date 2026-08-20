"use client";

import {
  AnimatePresence,
  MotionConfig,
  motion,
  type Variants,
} from "framer-motion";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import {
  IconActivity,
  IconArrowUpRight,
  IconCalendar,
  IconCandles,
  IconClock,
  IconNews,
  IconPin,
  IconStar,
  IconSun,
} from "./Icons";
import Logo from "./Logo";

interface Slide {
  key: string;
  icon: ((p: { size?: number; className?: string }) => React.ReactNode) | null;
  kicker: string;
  title: string;
  body: string;
  details: string[];
  where: string;
  links?: { label: string; href: string }[];
}

const SLIDES: Slide[] = [
  {
    key: "what",
    icon: null, // Logo
    kicker: "Welcome to Opentide",
    title: "The market is a 24-hour tide.",
    body: "A free, real-time market companion that knows what time it is — in every market.",
    details: [
      "Forex, crypto and US stocks on one live surface — no tab-hopping.",
      "100% free: no account, no paywall, no ads. Everything you see is live.",
      "Built around market sessions — the thing no other free tool gets right.",
    ],
    where:
      "You're on the Dashboard. Pulse, Buzz and News each have their own page — see the nav, top-left.",
  },
  {
    key: "sessions",
    icon: IconClock,
    kicker: "Session clock",
    title: "Know when markets move",
    body: "The signature element: which financial centers are awake right now, and where the high-liquidity overlaps are.",
    details: [
      "Each session lights up while its center is open; overlaps mark the busiest hours.",
      "Big events — FOMC, CPI, jobs day — appear as markers with live countdowns.",
      "Tap a session to filter the markets list to the assets it drives.",
    ],
    where:
      "Top of the dashboard, just under the ticker tape. Switch local time / UTC with the clock button in the header.",
  },
  {
    key: "watch",
    icon: IconStar,
    kicker: "Markets & watchlist",
    title: "Make it yours",
    body: "Every asset, live. Star what you care about and it stays one glance away.",
    details: [
      "Tap the ☆ on any asset to pin it to your watchlist — it persists between visits.",
      "Filter by market (forex / crypto / stocks) or by the session that's open.",
      "Prices flash green or red as they tick, and Top movers updates live.",
    ],
    where:
      "Left column of the dashboard — watchlist on top, all markets below it. The Watchlist tab opens the full view: live prices, AI ideas tuned to your picks, and news filtered to your names.",
  },
  {
    key: "chart",
    icon: IconCandles,
    kicker: "Charts",
    title: "Chart anything in one tap",
    body: "A full TradingView chart is never more than one tap away, wherever you are.",
    details: [
      "Tap any asset, mover, ticker entry or headline tag and the chart opens instantly.",
      "Switch intervals from 1 minute to 1 week; \"In the news\" suggests charts worth a look.",
      "Stories tagged to the charted asset appear right beneath it.",
    ],
    where:
      "Center of the dashboard. From any other page it opens as an overlay — ESC closes it.",
  },
  {
    key: "news",
    icon: IconNews,
    kicker: "Newswire & attention",
    title: "See what's moving — and why",
    body: "A free multi-source newswire, tagged to the exact assets each story affects.",
    details: [
      "Sources include CoinDesk, CNBC, MarketWatch and FXStreet — merged and de-duplicated.",
      "Tap an asset tag on any headline to jump straight to its chart.",
      "The Markets page ranks what the market is talking about most right now.",
    ],
    where:
      "Right column of the dashboard. The full wire lives on the News page; what's getting attention lives in the Markets page's Attention band.",
  },
  {
    key: "briefing",
    icon: IconSun,
    kicker: "Daily briefing & calendar",
    title: "Your day in 60 seconds",
    body: "One card that reads the whole page for you, every morning, in plain language.",
    details: [
      "Sessions, sentiment, biggest movers, today's calendar and the top headline — summarized.",
      "Collapses to a one-line live digest once read; back fresh tomorrow.",
      "Economic calendar countdowns ride on the session clock all day.",
    ],
    where:
      "The sun card at the very top of the dashboard. Educational, not investment advice.",
  },
  {
    key: "markets",
    icon: IconActivity,
    kicker: "Markets",
    title: "Mood and attention, one page",
    body: "The whole board in one destination — how markets feel right now (Mood), and what they're watching (Attention).",
    details: [
      "Mood — a risk-on / risk-off dial synthesized from crypto, equities, both Fear & Greed readings and the dollar, plus heatmaps and per-session stats.",
      "Attention — the trending coins and stocks, the names dominating the news, scheduled event risk and upcoming IPOs.",
      "Tap anything to chart it; composites and attention, never buy signals.",
    ],
    where:
      "The Markets tab in the nav, top-left. The dashboard's “Market pulse” strip is the teaser; this page is the full read.",
  },
  {
    key: "tools",
    icon: IconCalendar,
    kicker: "More tools",
    title: "Take Opentide with you",
    body: "Three optional extras that bring market context into the apps you already use.",
    details: [
      "Digest view — a stripped-down dashboard showing only your starred assets, for a quick morning glance.",
      "Calendar feed — subscribe and market session opens plus big releases (Fed meetings, CPI, jobs day) appear automatically in Google, Apple Calendar or Notion.",
      "Embeddable clock — drop the session clock onto your own site, blog or Notion with a one-line snippet.",
    ],
    where:
      "Digest: the “Digest ›” button on the “Your day in 60 seconds” card, once you've starred at least one asset. Calendar feed and embed snippet live at the /api/ics and /widget URLs.",
  },
  {
    key: "maker",
    icon: null, // Logo
    kicker: "About the developer",
    title: "Built by Olumide",
    body: "Opentide is free, with no account and no ads — built and maintained by Olumide.",
    details: [
      "Everything you see is live and free; there's no paywall and nothing is for sale.",
      "Educational tool only — Opentide is not investment advice.",
      "Feedback, ideas and bug reports are always welcome.",
    ],
    where:
      "These credits also live in the footer at the bottom of every page.",
    links: [
      { label: "GitHub", href: "https://github.com/bcypher01" },
      { label: "Portfolio", href: "https://olumideb.vercel.app/" },
    ],
  },
];

/* ---- motion ---- */

const PANEL_SPRING = {
  type: "spring",
  stiffness: 360,
  damping: 30,
  mass: 0.9,
} as const;

// Parent slide: springs into place from the direction of travel, staggers its
// children once it owns the stage.
const slideVariants: Variants = {
  center: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 320,
      damping: 30,
      staggerChildren: 0.055,
      delayChildren: 0.03,
    },
  },
  left: {
    x: -56,
    opacity: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
  },
  right: {
    x: 56,
    opacity: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
  },
};

const itemVariants: Variants = {
  center: {
    y: 0,
    opacity: 1,
    transition: { type: "spring", stiffness: 420, damping: 28 },
  },
  left: { y: 12, opacity: 0, transition: { duration: 0.12 } },
  right: { y: 12, opacity: 0, transition: { duration: 0.12 } },
};

// Icon overshoots with a bouncier spring than the text.
const iconVariants: Variants = {
  center: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring", stiffness: 380, damping: 16 },
  },
  left: { scale: 0.6, opacity: 0, transition: { duration: 0.12 } },
  right: { scale: 0.6, opacity: 0, transition: { duration: 0.12 } },
};

/**
 * "What is Opentide" tour — a slide deck covering the whole platform, with a
 * "where to find it" pin on every feature. Auto-opens once for first-time
 * visitors, then only via the ? in the header or the intro hero. Arrow keys,
 * dots and swipe all navigate. Animated with framer-motion springs;
 * MotionConfig honors prefers-reduced-motion.
 *
 * Memoized: AppShell re-renders every second (header clock), and without memo
 * each tick re-renders all six motion slides while the tour is open.
 */
function AboutModal() {
  const aboutOpen = useStore((s) => s.aboutOpen);
  const closeAbout = useStore((s) => s.closeAbout);
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const last = SLIDES.length - 1;

  const go = useCallback(
    (i: number) => setIndex(Math.max(0, Math.min(last, i))),
    [last]
  );

  // Fresh start each open + scroll lock + pause background animation work
  // (the marquee ticker repaints continuously under the overlay otherwise)
  useEffect(() => {
    if (!aboutOpen) return;
    setIndex(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("tour-open");
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("tour-open");
    };
  }, [aboutOpen]);

  // ESC closes, arrows navigate
  useEffect(() => {
    if (!aboutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAbout();
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aboutOpen, closeAbout, go, index]);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {aboutOpen && (
          <motion.div
            key="about-tour"
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="What is Opentide — quick tour"
          >
            {/* backdrop — no backdrop-blur: blurring the whole live page
                (ticker, price flashes) every frame tanks the compositor */}
            <motion.button
              aria-label="Close tour"
              onClick={closeAbout}
              className="absolute inset-0 bg-black/75"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.25 } }}
              exit={{ opacity: 0, transition: { duration: 0.18 } }}
            />

            {/* panel */}
            <motion.div
              className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden module shadow-2xl"
              initial={{ opacity: 0, y: 28, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: PANEL_SPRING }}
              exit={{
                opacity: 0,
                y: 14,
                scale: 0.97,
                transition: { duration: 0.18, ease: "easeIn" },
              }}
            >
              {/* header */}
              <div className="flex items-center gap-2 px-5 pt-4">
                <Logo size={20} />
                <span className="num text-[11px] text-muted">
                  {index + 1} / {SLIDES.length}
                </span>
                <button
                  onClick={closeAbout}
                  className="ml-auto rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface2 hover:text-text"
                >
                  Skip tour
                </button>
              </div>

              {/* slide stack — all slides share one grid cell, so the panel
                  sits at the tallest slide's height; the active slide springs
                  in from the direction of travel and staggers its content */}
              <div
                className="min-h-0 overflow-y-auto overflow-x-hidden"
                onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
                onTouchEnd={(e) => {
                  if (touchX.current === null) return;
                  const dx = e.changedTouches[0].clientX - touchX.current;
                  touchX.current = null;
                  if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
                }}
              >
                <div className="grid">
                  {SLIDES.map((s, i) => {
                    const active = i === index;
                    return (
                      <motion.div
                        key={s.key}
                        aria-hidden={!active}
                        inert={!active}
                        variants={slideVariants}
                        initial="right"
                        animate={active ? "center" : i < index ? "left" : "right"}
                        className={`[grid-area:1/1] px-6 pb-3 pt-6 sm:px-10 ${
                          active ? "" : "pointer-events-none"
                        }`}
                      >
                        <div className="mx-auto flex max-w-lg flex-col items-center text-center">
                          <motion.span
                            variants={iconVariants}
                            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent"
                          >
                            {s.icon ? <s.icon size={30} /> : <Logo size={34} />}
                          </motion.span>

                          <motion.div variants={itemVariants}>
                            <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
                              {s.kicker}
                            </p>
                            <h2 className="font-display mt-1.5 text-2xl font-semibold leading-tight tracking-tight sm:text-[28px]">
                              {s.title}
                            </h2>
                            <p className="mt-2 text-sm leading-relaxed text-muted">
                              {s.body}
                            </p>
                          </motion.div>

                          <motion.ul
                            variants={itemVariants}
                            className="mt-5 w-full space-y-2.5 text-left"
                          >
                            {s.details.map((d) => (
                              <li
                                key={d}
                                className="flex gap-3 rounded-xl bg-surface/40 px-4 py-2.5"
                              >
                                <span
                                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                                  aria-hidden="true"
                                />
                                <span className="text-[13px] leading-relaxed text-text/90">
                                  {d}
                                </span>
                              </li>
                            ))}
                          </motion.ul>

                          {s.links && (
                            <motion.div
                              variants={itemVariants}
                              className="mt-4 flex w-full flex-wrap gap-2.5"
                            >
                              {s.links.map((l) => (
                                <a
                                  key={l.href}
                                  href={l.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface/40 px-4 py-2.5 text-sm font-medium text-text/90 transition-colors hover:bg-surface2 hover:text-accent"
                                >
                                  {l.label}
                                  <IconArrowUpRight size={14} />
                                </a>
                              ))}
                            </motion.div>
                          )}

                          <motion.p
                            variants={itemVariants}
                            className="mt-4 flex w-full items-start gap-2.5 rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3 text-left"
                          >
                            <span className="mt-0.5 shrink-0 text-accent">
                              <IconPin size={14} />
                            </span>
                            <span className="text-xs leading-relaxed text-text/80">
                              <span className="font-medium text-accent">
                                Where to find it:{" "}
                              </span>
                              {s.where}
                            </span>
                          </motion.p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* footer: dots + nav */}
              <div className="flex items-center gap-2 border-t border-border/60 px-5 py-4">
                <button
                  onClick={() => go(index - 1)}
                  disabled={index === 0}
                  aria-label="Previous slide"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.055] text-muted transition-colors enabled:hover:border-accent/40 enabled:hover:text-text disabled:opacity-30"
                >
                  ‹
                </button>

                <div
                  className="mx-auto flex items-center gap-2"
                  role="tablist"
                  aria-label="Slides"
                >
                  {SLIDES.map((s, i) => (
                    <motion.button
                      key={s.key}
                      onClick={() => go(i)}
                      role="tab"
                      aria-selected={i === index}
                      aria-label={`Slide ${i + 1}: ${s.kicker}`}
                      animate={{
                        width: i === index ? 24 : 8,
                        backgroundColor:
                          i === index
                            ? "var(--color-accent)"
                            : "var(--color-border)",
                      }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className="h-2 rounded-full"
                    />
                  ))}
                </div>

                {index < last ? (
                  <button
                    onClick={() => go(index + 1)}
                    className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
                  >
                    Next ›
                  </button>
                ) : (
                  <button
                    onClick={closeAbout}
                    className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
                  >
                    Let&apos;s go →
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

export default memo(AboutModal);
