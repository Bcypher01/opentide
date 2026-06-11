import { NextResponse } from "next/server";
import schedule from "@/lib/us-macro-schedule.json";

// Economic calendar — ForexFactory's public widget feed (keyless, unofficial,
// same posture as the CNN F&G source): cache 1h, never hammer it, and if it
// breaks the panel simply hides. Enriched with a small static file of
// US macro anchor dates (FOMC / CPI / NFP / PPI, published ~a year ahead and
// regenerated yearly) so the session clock can still say "next FOMC in 12
// days" beyond the feed's two-week window.

const FF_BASE = "https://nfs.faireconomy.media";

export type Impact = "High" | "Medium" | "Low" | "Holiday";

export interface CalendarEvent {
  id: string;
  title: string;
  /** currency code ("USD", "EUR", …) or "All" */
  country: string;
  ts: number; // epoch ms
  impact: Impact;
  forecast: string | null;
  previous: string | null;
}

export interface MacroAnchor {
  kind: "fomc" | "cpi" | "nfp" | "ppi";
  title: string;
  ts: number;
}

export interface CalendarPayload {
  /** null = feed unavailable (UI hides markers/chips, falls back to anchors) */
  events: CalendarEvent[] | null;
  /** next upcoming static anchor per kind (FOMC / CPI / NFP / PPI) */
  anchors: MacroAnchor[];
  ts: number;
}

interface FfRow {
  title?: string;
  country?: string;
  date?: string; // ISO with TZ offset
  impact?: string;
  forecast?: string;
  previous?: string;
}

const IMPACTS = new Set<Impact>(["High", "Medium", "Low", "Holiday"]);

async function fetchWeek(file: string): Promise<FfRow[] | null> {
  try {
    const res = await fetch(`${FF_BASE}/${file}`, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "Mozilla/5.0 (opentide)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return Array.isArray(json) ? (json as FfRow[]) : null;
  } catch {
    return null;
  }
}

async function ffEvents(): Promise<CalendarEvent[] | null> {
  const [thisWeek, nextWeek] = await Promise.all([
    fetchWeek("ff_calendar_thisweek.json"),
    fetchWeek("ff_calendar_nextweek.json"),
  ]);
  // thisweek is required; nextweek failing alone just shortens the window.
  if (!thisWeek) return null;

  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  for (const row of [...thisWeek, ...(nextWeek ?? [])]) {
    if (!row?.title || !row.country || !row.date) continue;
    const ts = Date.parse(row.date);
    if (!Number.isFinite(ts)) continue;
    const impact = IMPACTS.has(row.impact as Impact)
      ? (row.impact as Impact)
      : "Low";
    const id = `${row.country}|${row.title}|${ts}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: row.title,
      country: row.country,
      ts,
      impact,
      forecast: row.forecast || null,
      previous: row.previous || null,
    });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

function nextAnchors(now: number): MacroAnchor[] {
  const out: MacroAnchor[] = [];
  for (const kind of ["fomc", "cpi", "nfp", "ppi"] as const) {
    const next = schedule.events
      .filter((e) => e.kind === kind)
      .map((e) => ({ kind, title: e.title, ts: Date.parse(e.date) }))
      .filter((e) => Number.isFinite(e.ts) && e.ts > now)
      .sort((a, b) => a.ts - b.ts)[0];
    if (next) out.push(next);
  }
  return out;
}

export async function GET() {
  const events = await ffEvents();
  const payload: CalendarPayload = {
    events,
    anchors: nextAnchors(Date.now()),
    ts: Date.now(),
  };
  return NextResponse.json(payload);
}
