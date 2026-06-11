// ---------------------------------------------------------------------------
// Calendar helpers — filtering, beginner-friendly event explainers, and
// "which session is this event in?" context. Shared by the session clock
// integration and the daily briefing.
// ---------------------------------------------------------------------------

import type { CalendarEvent } from "@/app/api/calendar/route";
import { formatCountdown, type SessionState } from "./sessions";

/** The eight majors the feed covers, plus "All" (OPEC etc.). */
export const MAJOR_COUNTRIES = new Set([
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "CAD",
  "NZD",
  "CNY",
  "All",
]);

export const IMPACT_COLOR: Record<CalendarEvent["impact"], string> = {
  High: "#ef5350",
  Medium: "#e8b44f",
  Low: "#8b919c",
  Holiday: "#7c6ff0",
};

/** Default view: high-impact, majors only. `showAll` lifts both filters. */
export function filterEvents(
  events: CalendarEvent[],
  showAll: boolean
): CalendarEvent[] {
  if (showAll) return events;
  return events.filter(
    (e) => e.impact === "High" && MAJOR_COUNTRIES.has(e.country)
  );
}

/** Next `n` upcoming high-impact majors events. */
export function nextHighImpact(
  events: CalendarEvent[],
  now: number,
  n: number
): CalendarEvent[] {
  return filterEvents(events, false)
    .filter((e) => e.ts > now)
    .slice(0, n);
}

/** "during NY open", "during the London + New York overlap", or "" */
export function sessionContext(ts: number, states: SessionState[]): string {
  // A session is "on" at ts if ts falls in its band on the 24h UTC axis.
  const d = new Date(ts);
  const frac =
    (d.getUTCHours() * 60 + d.getUTCMinutes()) / 1440;
  const open = states.filter((s) => {
    const { bandStart: a, bandEnd: b } = s;
    return a <= b ? frac >= a && frac < b : frac >= a || frac < b;
  });
  if (open.length === 0) return "while major markets are closed";
  if (open.length === 1) return `during the ${open[0].def.name} session`;
  return `during the ${open.map((s) => s.def.name).join(" + ")} overlap`;
}

/** Event time in the viewer's local clock (or UTC), e.g. "13:30". */
export function formatEventTime(ts: number, useUTC: boolean): string {
  const d = new Date(ts);
  if (useUTC) {
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
      d.getUTCMinutes()
    ).padStart(2, "0")} UTC`;
  }
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "today", "tomorrow", or "Mon 15 Jun" — in the viewer's local calendar. */
export function formatEventDay(ts: number, now: number): string {
  const d = new Date(ts);
  const today = new Date(now);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "today";
  const tomorrow = new Date(now + 86_400_000);
  if (sameDay(d, tomorrow)) return "tomorrow";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

export function eventCountdown(ts: number, now: number): string {
  if (ts <= now) return "released";
  return `in ${formatCountdown(ts - now)}`;
}

// ---------------------------------------------------------------------------
// Beginner explainers — plain-language "what is this release and why does the
// market care" for the events traders watch most. Generic fallback otherwise.
// ---------------------------------------------------------------------------

export interface EventExplainer {
  what: string;
  why: string;
}

const EXPLAINERS: Array<{ match: RegExp; ex: EventExplainer }> = [
  {
    match: /\bCPI\b|consumer price/i,
    ex: {
      what: "The Consumer Price Index — the main measure of inflation: how much everyday prices rose versus last month or last year.",
      why: "Central banks raise or cut interest rates largely based on inflation, so a surprise here can move every market at once — often within seconds of the release.",
    },
  },
  {
    match: /non-?farm|employment change|jobs report|\bNFP\b/i,
    ex: {
      what: "A count of how many jobs the economy added or lost last month. The US version (Non-Farm Payrolls) is the most-watched jobs number in the world.",
      why: "Strong jobs = strong economy but possibly higher rates; weak jobs = the opposite. The first Friday of each month is famously volatile because of it.",
    },
  },
  {
    match: /unemployment claims/i,
    ex: {
      what: "How many people filed for unemployment benefits last week — a fast, weekly read on the US job market.",
      why: "It's an early-warning gauge: a sudden jump can signal the economy is cooling before the big monthly reports show it.",
    },
  },
  {
    match: /unemployment rate/i,
    ex: {
      what: "The share of people who want a job but don't have one.",
      why: "A rising rate hints at a weakening economy, which shifts expectations for interest-rate cuts — and that moves currencies, stocks and crypto.",
    },
  },
  {
    match: /\bPPI\b|producer price/i,
    ex: {
      what: "The Producer Price Index — inflation measured at the factory gate: what businesses pay before costs reach consumers.",
      why: "Producer prices often lead consumer prices, so traders use PPI as a preview of where CPI inflation is heading.",
    },
  },
  {
    match: /FOMC|federal funds rate|fed chair/i,
    ex: {
      what: "The US Federal Reserve's interest-rate decision (or related statement/press conference) — the single most important scheduled event in global markets.",
      why: "The Fed sets the price of the world's reserve currency. Rate changes — or even a change of tone — ripple through every asset class instantly.",
    },
  },
  {
    match: /rate statement|monetary policy|refinancing rate|overnight rate|official bank rate|cash rate|policy rate|interest rate decision|press conference/i,
    ex: {
      what: "A central bank announcing its interest-rate decision, or its leaders explaining it. Rates are the main lever banks use to control inflation.",
      why: "Higher rates usually strengthen that country's currency and pressure risk assets; cuts do the reverse. The press conference can move markets more than the decision itself.",
    },
  },
  {
    match: /\bGDP\b/i,
    ex: {
      what: "Gross Domestic Product — the total size of an economy. This release shows how fast it grew or shrank.",
      why: "It's the broadest health-check there is. Two negative quarters in a row is the informal definition of a recession.",
    },
  },
  {
    match: /retail sales/i,
    ex: {
      what: "How much consumers spent in shops and online last month.",
      why: "Consumer spending drives most modern economies, so this is a direct pulse on demand — and on whether rate changes are biting.",
    },
  },
  {
    match: /\bPMI\b|manufacturing index|services index/i,
    ex: {
      what: "A survey of purchasing managers asking if business is getting better or worse. Above 50 = expanding, below 50 = contracting.",
      why: "It's one of the earliest signals available each month — markets treat it as a sneak preview of the harder data to come.",
    },
  },
  {
    match: /crude oil inventories/i,
    ex: {
      what: "The weekly change in how much crude oil the US has in storage.",
      why: "More oil in storage than expected pushes oil prices down (and vice versa) — which feeds into inflation expectations and energy stocks.",
    },
  },
  {
    match: /consumer sentiment|consumer confidence/i,
    ex: {
      what: "A survey of how optimistic ordinary people feel about the economy and their finances.",
      why: "Confident consumers spend more. Sharp drops in sentiment often precede slowdowns in real spending.",
    },
  },
  {
    match: /bank holiday/i,
    ex: {
      what: "A public holiday — that country's banks and exchanges are closed.",
      why: "Less liquidity means thinner trading: moves can be smaller (quiet drift) or oddly sharp, since fewer participants absorb large orders.",
    },
  },
  {
    match: /bond auction/i,
    ex: {
      what: "The government selling new bonds. The result shows what interest rate investors demanded to lend to it.",
      why: "Weak demand at an auction pushes yields up — a signal that borrowing costs across the economy may rise.",
    },
  },
];

export function explainEvent(e: CalendarEvent): EventExplainer {
  for (const { match, ex } of EXPLAINERS) {
    if (match.test(e.title)) return ex;
  }
  const where = e.country === "All" ? "global markets" : `${e.country} markets`;
  return {
    what: `A scheduled economic release or event for ${where}.`,
    why:
      e.impact === "High"
        ? "It's rated high-impact: prices can move sharply in the minutes around the release, especially if the number surprises versus the forecast."
        : "Lower-impact releases rarely move markets on their own, but they build the picture central banks act on.",
  };
}

/** "Markets expect 0.3% — last time it was 0.4%." (or whatever is available) */
export function forecastLine(e: CalendarEvent): string | null {
  if (e.forecast && e.previous)
    return `Markets expect ${e.forecast} — last time it was ${e.previous}.`;
  if (e.forecast) return `Markets expect ${e.forecast}.`;
  if (e.previous) return `Last time it was ${e.previous}.`;
  return null;
}
