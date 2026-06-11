// ---------------------------------------------------------------------------
// Daily briefing — "your day in 60 seconds". Pure composition over data the
// dashboard already polls: pulse strip, quotes, funding, calendar, news.
// Deterministic template text, no LLM. Every block tolerates a null upstream,
// so the briefing always renders with whatever is available.
//
// Lines are built from toned *segments* so the UI can color the numbers
// (green/red/teal) without parsing strings.
// ---------------------------------------------------------------------------

import type { CalendarPayload } from "@/app/api/calendar/route";
import type { DerivsPayload } from "@/app/api/derivs/route";
import type { PulsePayload } from "@/app/api/pulse/route";
import type { NewsItem } from "@/components/NewsFeed";
import { ALL_ASSETS, ASSET_BY_ID } from "./assets";
import {
  formatEventTime,
  nextHighImpact,
  sessionContext,
} from "./calendar";
import { formatChangePct } from "./format";
import { formatCountdown, sessionGreeting, type SessionState } from "./sessions";

export type Tone = "bull" | "bear" | "accent" | "muted";

export interface Seg {
  t: string;
  tone?: Tone;
}

/** seg shorthand */
const s = (t: string, tone?: Tone): Seg => ({ t, tone });

export interface BriefingLine {
  key: string;
  /** short label, e.g. "Mood" */
  label: string;
  segs: Seg[];
  /** optional asset to chart on tap */
  assetId?: string;
  /** optional external link (news) */
  link?: { href: string; title: string };
}

export interface Briefing {
  lines: BriefingLine[];
  /** one-line digest for the collapsed bar, e.g. "Stocks fear (27) · CPI in 2h" */
  summary: Seg[];
}

interface Inputs {
  now: Date;
  states: SessionState[];
  useUTC: boolean;
  pulse: PulsePayload | null;
  quoteOf: Record<string, { price: number; changePct: number | null }>;
  derivs: DerivsPayload | null;
  calendar: CalendarPayload | null;
  news: NewsItem[];
}

function moodWord(v: number): string {
  if (v <= 25) return "extreme fear";
  if (v <= 45) return "fear";
  if (v < 55) return "neutral";
  if (v < 75) return "greed";
  return "extreme greed";
}

function moodTone(v: number): Tone {
  if (v <= 45) return "bear";
  if (v >= 55) return "bull";
  return "muted";
}

function sentimentLine(pulse: PulsePayload | null): BriefingLine | null {
  if (!pulse) return null;
  const { fearGreed: fg, stockFearGreed: sfg } = pulse;
  if (!fg && !sfg) return null;

  const segs: Seg[] = [];
  if (fg && sfg) {
    const sameSide =
      (fg.value < 45 && sfg.value < 45) ||
      (fg.value > 55 && sfg.value > 55) ||
      Math.abs(fg.value - sfg.value) < 15;
    segs.push(
      s("Stocks in "),
      s(`${moodWord(sfg.value)} (${sfg.value})`, moodTone(sfg.value)),
      s(", crypto in "),
      s(`${moodWord(fg.value)} (${fg.value})`, moodTone(fg.value)),
      s(
        sameSide
          ? " — both markets are in the same mood."
          : " — a divergence day: the two markets disagree, which is itself worth watching.",
        "muted"
      )
    );
  } else {
    const one = fg ?? sfg!;
    segs.push(
      s(`${fg ? "Crypto" : "Stocks"} sentiment is at `),
      s(`${one.value} (${moodWord(one.value)})`, moodTone(one.value)),
      s(".")
    );
  }
  return { key: "sentiment", label: "Mood", segs };
}

function macroLine(pulse: PulsePayload | null): BriefingLine | null {
  if (!pulse) return null;
  const segs: Seg[] = [];
  if (pulse.dxy) {
    const d = pulse.dxy;
    const dir =
      d.changePct === null
        ? "at"
        : d.changePct > 0.1
          ? "firmer at"
          : d.changePct < -0.1
            ? "softer at"
            : "steady at";
    segs.push(s(`Dollar ${dir} `), s(d.value.toFixed(1), "accent"));
  }
  if (pulse.yields) {
    segs.push(
      s(segs.length ? "; 10-year yield at " : "10-year yield at "),
      s(`${pulse.yields.y10.toFixed(2)}%`, "accent")
    );
    if (pulse.yields.spread < 0)
      segs.push(
        s("; yield curve still "),
        s(`inverted (${pulse.yields.spread} bps)`, "bear")
      );
  }
  if (segs.length === 0) return null;
  segs.push(
    s(
      ". A stronger dollar and higher yields usually lean against risk assets.",
      "muted"
    )
  );
  return { key: "macro", label: "Macro", segs };
}

function calendarLine(
  calendar: CalendarPayload | null,
  now: Date,
  states: SessionState[],
  useUTC: boolean
): BriefingLine | null {
  const t = now.getTime();
  const endOfLocalDay = new Date(now);
  endOfLocalDay.setHours(23, 59, 59, 999);

  const todays = calendar?.events
    ? nextHighImpact(calendar.events, t, 6).filter(
        (e) => e.ts <= endOfLocalDay.getTime()
      )
    : [];

  if (todays.length === 0) {
    // Fall back to the nearest anchor so the line still orients the day.
    const next = (calendar?.anchors ?? [])
      .filter((a) => a.ts > t)
      .sort((a, b) => a.ts - b.ts)[0];
    if (!next) return null;
    const days = Math.round((next.ts - t) / 86_400_000);
    return {
      key: "calendar",
      label: "Events",
      segs: [
        s("No high-impact releases left today. Next big one: "),
        s(next.title, "accent"),
        s(` in ${days} day${days === 1 ? "" : "s"}.`),
      ],
    };
  }

  const segs: Seg[] = [s("Still to come today: ")];
  todays.slice(0, 3).forEach((e, i) => {
    if (i > 0) segs.push(s(", "));
    segs.push(
      s(`${e.title} (${e.country})`, "accent"),
      s(` at ${formatEventTime(e.ts, useUTC)}`)
    );
  });
  const first = todays[0];
  segs.push(
    s(
      ` — ${sessionContext(first.ts, states)}. Expect extra volatility around the release minute${todays.length > 1 ? "s" : ""}.`,
      "muted"
    )
  );
  return { key: "calendar", label: "Events", segs };
}

function moversLine(inputs: Inputs): BriefingLine | null {
  const ranked = ALL_ASSETS.map((a) => ({
    a,
    pct: inputs.quoteOf[a.id]?.changePct,
  })).filter(
    (x): x is { a: (typeof ALL_ASSETS)[number]; pct: number } =>
      x.pct !== null && x.pct !== undefined && Number.isFinite(x.pct)
  );
  if (ranked.length < 3) return null;
  ranked.sort((x, y) => y.pct - x.pct);
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  return {
    key: "movers",
    label: "Movers",
    segs: [
      s(`${top.a.symbol} leads (`),
      s(formatChangePct(top.pct), top.pct >= 0 ? "bull" : "bear"),
      s(`); ${bottom.a.symbol} lags (`),
      s(formatChangePct(bottom.pct), bottom.pct >= 0 ? "bull" : "bear"),
      s(") over the last 24h."),
    ],
    assetId: Math.abs(top.pct) >= Math.abs(bottom.pct) ? top.a.id : bottom.a.id,
  };
}

const FUNDING_EXTREME = 0.0005; // 0.05% per 8h

function fundingLine(derivs: DerivsPayload | null): BriefingLine | null {
  if (!derivs || derivs.funding.length === 0) return null;
  const extreme = [...derivs.funding].sort(
    (a, b) => Math.abs(b.rate) - Math.abs(a.rate)
  )[0];
  if (!extreme || Math.abs(extreme.rate) < FUNDING_EXTREME) return null;
  const pct = (extreme.rate * 100)
    .toFixed(3)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
  const crowded =
    extreme.rate > 0
      ? " — longs are paying up. Crowded long positioning can snap back hard."
      : " — shorts are paying up. Crowded short positioning can squeeze upward.";
  return {
    key: "funding",
    label: "Funding",
    segs: [
      s(`${extreme.symbol} perp funding at `),
      s(
        `${extreme.rate > 0 ? "+" : ""}${pct}%/8h`,
        extreme.rate > 0 ? "bull" : "bear"
      ),
      s(crowded, "muted"),
    ],
    assetId: `crypto:${extreme.symbol}`,
  };
}

function headlineLine(news: NewsItem[], now: Date): BriefingLine | null {
  if (news.length === 0) return null;
  const recent = news.filter((n) => now.getTime() - n.ts < 18 * 3600_000);
  const pool = recent.length > 0 ? recent : news;
  // "Biggest" = the tagged headline touching the most tracked assets.
  const best = [...pool].sort(
    (a, b) => b.assets.length - a.assets.length || b.ts - a.ts
  )[0];
  if (!best) return null;
  const tag = best.assets[0] ? ASSET_BY_ID[best.assets[0]] : null;
  return {
    key: "headline",
    label: "Headline",
    segs: [s(`${best.source}: `, "muted")],
    assetId: tag?.id,
    link: { href: best.link, title: best.title },
  };
}

function composeSummary(inputs: Inputs): Seg[] {
  const { pulse, calendar, now } = inputs;
  const t = now.getTime();
  const out: Seg[] = [];

  if (pulse?.stockFearGreed) {
    const v = pulse.stockFearGreed.value;
    out.push(s(`Stocks ${moodWord(v)} (${v})`, moodTone(v)));
  }
  if (pulse?.fearGreed) {
    const v = pulse.fearGreed.value;
    if (out.length) out.push(s(" · ", "muted"));
    out.push(s(`crypto ${moodWord(v)} (${v})`, moodTone(v)));
  }

  const nextEvent = calendar?.events
    ? nextHighImpact(calendar.events, t, 1)[0]
    : null;
  if (nextEvent) {
    if (out.length) out.push(s(" · ", "muted"));
    out.push(
      s(`${nextEvent.title} (${nextEvent.country}) `),
      s(`in ${formatCountdown(nextEvent.ts - t)}`, "accent")
    );
  }
  return out;
}

export function composeBriefing(inputs: Inputs): Briefing {
  const { now, states, useUTC, pulse, derivs, calendar, news } = inputs;
  const lines: BriefingLine[] = [
    { key: "sessions", label: "Sessions", segs: [s(`${sessionGreeting(now)}.`)] },
  ];
  for (const line of [
    sentimentLine(pulse),
    macroLine(pulse),
    calendarLine(calendar, now, states, useUTC),
    moversLine(inputs),
    fundingLine(derivs),
    headlineLine(news, now),
  ]) {
    if (line) lines.push(line);
  }
  return { lines, summary: composeSummary(inputs) };
}

/** Local calendar date, e.g. "2026-06-11" — keys "first visit of the day". */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
