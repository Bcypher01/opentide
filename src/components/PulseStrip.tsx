"use client";

import { useEffect, useState } from "react";
import type { PulsePayload } from "@/app/api/pulse/route";
import { formatChangePct } from "@/lib/format";

interface Props {
  data: PulsePayload | null;
}

/** Color ramp for Fear & Greed: extreme fear → bear, extreme greed → bull. */
function fgColor(v: number): string {
  if (v <= 25) return "text-bear";
  if (v <= 45) return "text-bear/80";
  if (v < 55) return "text-muted";
  if (v < 75) return "text-bull/80";
  return "text-bull";
}

/**
 * A single chip descriptor. `explainer` is shown in a tap-to-open panel below
 * the strip so newcomers can learn what each metric means — on mobile too,
 * where hover tooltips never appear.
 */
interface ChipDef {
  key: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  subClass?: string;
  explainer: {
    title: string;
    what: string; // plain-language: what the number is
    why: string; // why a trader watches it
    source: string;
  };
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v3.5" strokeLinecap="round" />
      <circle cx="8" cy="5.25" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Chip({
  def,
  open,
  onToggle,
}: {
  def: ChipDef;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex shrink-0 items-baseline gap-2 rounded-full border bg-surface py-1.5 pl-3.5 pr-1.5 transition-colors ${
        open ? "border-accent/60" : "border-border"
      }`}
    >
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
        {def.label}
      </span>
      <span className="num text-xs text-text">{def.value}</span>
      {def.sub !== undefined && (
        <span className={`num text-[10px] ${def.subClass ?? "text-muted"}`}>
          {def.sub}
        </span>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`What is ${def.explainer.title}?`}
        className={`flex h-5 w-5 items-center justify-center self-center rounded-full transition-colors ${
          open
            ? "bg-accent/15 text-accent"
            : "text-muted hover:bg-surface2 hover:text-text"
        }`}
      >
        <InfoIcon />
      </button>
    </div>
  );
}

/**
 * Market Pulse — a thin sentiment/macro strip: crypto Fear & Greed, BTC
 * dominance, total-mcap 24h, the US dollar index and US yields. Each chip
 * carries a tap-to-open explainer so the strip reads clearly whether you're a
 * first-day beginner or a desk veteran. Chips hide individually when their
 * upstream is unavailable; the strip hides entirely until something loads.
 */
export default function PulseStrip({ data }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Close the explainer on Escape for keyboard users.
  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey]);

  if (!data) return null;
  const { fearGreed: fg, btcDominance, mcapChangePct, dxy, yields } = data;
  if (!fg && btcDominance === null && !dxy && !yields) return null;

  const fgDelta = fg && fg.yesterday !== null ? fg.value - fg.yesterday : null;

  const chips: ChipDef[] = [];

  if (fg) {
    chips.push({
      key: "fg",
      label: "Fear & Greed",
      value: (
        <>
          <span className={fgColor(fg.value)}>{fg.value}</span>
          <span className="ml-1.5 text-muted">{fg.classification}</span>
        </>
      ),
      sub:
        fgDelta === null
          ? undefined
          : `${fgDelta > 0 ? "▲" : fgDelta < 0 ? "▼" : "·"} ${Math.abs(fgDelta)} vs yda`,
      subClass:
        fgDelta === null
          ? undefined
          : fgDelta > 0
            ? "text-bull"
            : fgDelta < 0
              ? "text-bear"
              : "text-muted",
      explainer: {
        title: "the Crypto Fear & Greed Index",
        what: "A 0–100 mood meter for the crypto market. Below 25 is “extreme fear”, above 75 is “extreme greed”.",
        why: "Sentiment often swings to extremes near turning points — deep fear can mark a bottom, euphoric greed a top. It's a gut-check, not a buy/sell signal.",
        source: "alternative.me",
      },
    });
  }

  if (btcDominance !== null) {
    chips.push({
      key: "btcd",
      label: "Bitcoin dominance",
      value: `${btcDominance.toFixed(1)}%`,
      explainer: {
        title: "Bitcoin dominance (BTC.D)",
        what: "Bitcoin's share of the entire crypto market's value, as a percentage.",
        why: "Rising dominance means money is flowing into Bitcoin; falling dominance often means traders are rotating into altcoins.",
        source: "CoinGecko",
      },
    });
  }

  if (mcapChangePct !== null) {
    chips.push({
      key: "mcap",
      label: "Crypto market 24h",
      value: formatChangePct(mcapChangePct),
      subClass: "text-muted",
      explainer: {
        title: "total crypto market cap, 24h change",
        what: "How much the combined value of all cryptocurrencies has moved over the last 24 hours.",
        why: "A one-glance read on whether the whole market — not just one coin — is risk-on or risk-off today.",
        source: "CoinGecko",
      },
    });
  }

  if (dxy) {
    chips.push({
      key: "dxy",
      label: "Dollar index",
      value: dxy.value.toFixed(2),
      sub:
        dxy.changePct === null
          ? "DXY · daily"
          : `${formatChangePct(dxy.changePct)} · DXY daily`,
      subClass:
        dxy.changePct === null
          ? undefined
          : dxy.changePct >= 0
            ? "text-bull"
            : "text-bear",
      explainer: {
        title: "the US Dollar Index (DXY)",
        what: "The strength of the US dollar measured against a basket of major currencies (euro, yen, pound and others).",
        why: "A stronger dollar is usually a headwind for crypto, gold and other risk assets; a weaker dollar tends to be a tailwind. This is a daily approximation from ECB reference rates.",
        source: `ECB daily reference · as of ${dxy.asOf}`,
      },
    });
  }

  if (yields) {
    chips.push({
      key: "y10",
      label: "US 10-year yield",
      value: `${yields.y10.toFixed(2)}%`,
      explainer: {
        title: "the US 10-year Treasury yield",
        what: "The interest rate the US government pays to borrow money for 10 years.",
        why: "It's the world's benchmark “risk-free” rate. When it rises, borrowing gets pricier everywhere and riskier assets often come under pressure.",
        source: `US Treasury · as of ${yields.asOf}`,
      },
    });
    chips.push({
      key: "curve",
      label: "Yield curve",
      value: `${yields.spread > 0 ? "+" : ""}${yields.spread} bps`,
      subClass: yields.spread < 0 ? "text-bear" : "text-muted",
      explainer: {
        title: "the yield curve (2s10s spread)",
        what: "The 10-year yield minus the 2-year yield, in basis points (100 bps = 1%). A negative number means short-term rates are higher than long-term — an “inverted” curve.",
        why: "An inverted curve has preceded most US recessions, so a negative reading is a classic warning sign watched across all markets.",
        source: "US Treasury",
      },
    });
  }

  if (chips.length === 0) return null;

  const active = chips.find((c) => c.key === openKey) ?? null;

  return (
    <section aria-label="Market pulse" className="mt-4">
      <div className="mb-1.5 flex items-center gap-2 px-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted/70">
          Market pulse
        </span>
        <span className="text-[10px] text-muted/50">
          tap ⓘ on any tile to learn what it means
        </span>
      </div>

      <div className="scrollbar-none flex items-center gap-2 overflow-x-auto">
        {chips.map((c) => (
          <Chip
            key={c.key}
            def={c}
            open={openKey === c.key}
            onToggle={() => setOpenKey((k) => (k === c.key ? null : c.key))}
          />
        ))}
      </div>

      {active && (
        <div
          role="region"
          aria-label={`About ${active.explainer.title}`}
          className="mt-2 rounded-xl border border-accent/30 bg-surface p-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-xs font-semibold capitalize text-text">
              {active.explainer.title}
            </h3>
            <button
              type="button"
              onClick={() => setOpenKey(null)}
              aria-label="Close explainer"
              className="-mr-1 -mt-1 shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-surface2 hover:text-text"
            >
              ✕
            </button>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-text/90">
            <span className="font-medium text-muted">What it is — </span>
            {active.explainer.what}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-text/90">
            <span className="font-medium text-muted">Why it matters — </span>
            {active.explainer.why}
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-wider text-muted/60">
            Source: {active.explainer.source}
          </p>
        </div>
      )}
    </section>
  );
}
