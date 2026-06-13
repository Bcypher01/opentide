import { NextRequest } from "next/server";
import schedule from "@/lib/us-macro-schedule.json";
import { SESSIONS, zoneOffsetMinutes } from "@/lib/sessions";

// ---------------------------------------------------------------------------
// /api/ics — subscribable iCalendar feed.
//
// Includes:
//   • Session open/close events for the next 60 days (DST-aware)
//   • High-impact ForexFactory economic events (two-week window)
//   • US macro anchors from the static schedule (rest of year)
//
// Query params:
//   sessions   comma-separated list of session ids to include
//              e.g. "london,newyork"  (default: all four)
//   tz         IANA timezone for the VTIMEZONE component label (informational)
//              e.g. "America/New_York"  (default: UTC)
//   lead       minutes before event to fire the VALARM (default: 15)
// ---------------------------------------------------------------------------

const FF_BASE = "https://nfs.faireconomy.media";

function icsDate(ms: number): string {
  // Basic UTC datetime string: 20260101T060000Z
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function uid(seed: string): string {
  // Simple deterministic uid so calendar clients don't duplicate on re-subscribe
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return `${Math.abs(h).toString(16)}-opentide@opentide.dev`;
}

function fold(line: string): string {
  // RFC 5545 §3.1: fold lines longer than 75 octets
  const out: string[] = [];
  while (line.length > 75) {
    out.push(line.slice(0, 75));
    line = " " + line.slice(75);
  }
  out.push(line);
  return out.join("\r\n");
}

function vevent({
  uid: id,
  summary,
  description,
  dtstart,
  dtend,
  lead,
}: {
  uid: string;
  summary: string;
  description: string;
  dtstart: number;
  dtend: number;
  lead: number;
}): string {
  const alarm =
    lead > 0
      ? [
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          fold(`DESCRIPTION:Reminder: ${summary}`),
          `TRIGGER:-PT${lead}M`,
          "END:VALARM",
        ].join("\r\n")
      : "";

  return [
    "BEGIN:VEVENT",
    fold(`UID:${id}`),
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(dtstart)}`,
    `DTEND:${icsDate(dtend)}`,
    fold(`SUMMARY:${summary}`),
    description ? fold(`DESCRIPTION:${description}`) : "",
    alarm,
    "END:VEVENT",
  ]
    .filter(Boolean)
    .join("\r\n");
}

/** Build all session windows for a given session over the next N days. */
function sessionWindows(
  defId: string,
  days: number
): Array<{ open: number; close: number; name: string }> {
  const def = SESSIONS.find((s) => s.id === defId);
  if (!def) return [];

  const now = new Date();
  const out: Array<{ open: number; close: number; name: string }> = [];

  for (let d = 0; d <= days; d++) {
    const guess = new Date(now.getTime() + d * 86_400_000);
    const offsetMin = zoneOffsetMinutes(def.tz, guess);

    // Local noon in session tz — use to get local date info
    const localNoon = new Date(guess.getTime() + offsetMin * 60_000);
    const dow = localNoon.getUTCDay();
    if (dow === 0 || dow === 6) continue; // weekend in session's zone

    const y = localNoon.getUTCFullYear();
    const m = localNoon.getUTCMonth();
    const day = localNoon.getUTCDate();

    const open = Date.UTC(y, m, day, def.openHour, 0, 0) - offsetMin * 60_000;
    const close = Date.UTC(y, m, day, def.closeHour, 0, 0) - offsetMin * 60_000;

    // Only include future events (skip sessions already closed today)
    if (close > now.getTime()) {
      out.push({ open, close, name: def.name });
    }
  }
  return out;
}

interface FfRow {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
}

async function fetchHighImpact(): Promise<
  Array<{ title: string; country: string; ts: number; forecast: string | null }>
> {
  const rows: FfRow[] = [];
  try {
    const [a, b] = await Promise.all([
      fetch(`${FF_BASE}/ff_calendar_thisweek.json`, {
        next: { revalidate: 3600 },
        headers: { "User-Agent": "Mozilla/5.0 (opentide)" },
      }),
      fetch(`${FF_BASE}/ff_calendar_nextweek.json`, {
        next: { revalidate: 3600 },
        headers: { "User-Agent": "Mozilla/5.0 (opentide)" },
      }),
    ]);
    if (a.ok) rows.push(...((await a.json()) as FfRow[]));
    if (b.ok) rows.push(...((await b.json()) as FfRow[]));
  } catch {
    /* feed unavailable — ICS still includes sessions + anchors */
  }

  const now = Date.now();
  const seen = new Set<string>();
  const out: Array<{ title: string; country: string; ts: number; forecast: string | null }> = [];

  for (const row of rows) {
    if (!row?.title || !row.country || !row.date) continue;
    if (row.impact !== "High") continue;
    const ts = Date.parse(row.date);
    if (!Number.isFinite(ts) || ts < now) continue;
    const key = `${row.country}|${row.title}|${ts}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: row.title, country: row.country, ts, forecast: row.forecast ?? null });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const sessionIds = (params.get("sessions") ?? "sydney,tokyo,london,newyork")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const lead = Math.min(120, Math.max(0, Number(params.get("lead") ?? "15")));

  // --- Build events ---
  const vevents: string[] = [];

  // 1. Session opens/closes for the next 60 days
  for (const id of sessionIds) {
    for (const w of sessionWindows(id, 60)) {
      // Open event (30-min block at open time)
      vevents.push(
        vevent({
          uid: uid(`open:${id}:${w.open}`),
          summary: `${w.name} Session Opens`,
          description: SESSIONS.find((s) => s.id === id)?.hint ?? "",
          dtstart: w.open,
          dtend: w.open + 30 * 60_000,
          lead,
        })
      );
    }
  }

  // 2. High-impact economic events (ForexFactory two-week window)
  const economic = await fetchHighImpact();
  for (const e of economic) {
    vevents.push(
      vevent({
        uid: uid(`econ:${e.country}:${e.title}:${e.ts}`),
        summary: `🔴 ${e.title} (${e.country})`,
        description: e.forecast ? `Forecast: ${e.forecast}` : "",
        dtstart: e.ts,
        dtend: e.ts + 60_000, // 1-min point-event
        lead,
      })
    );
  }

  // 3. Static US macro anchors (FOMC, CPI, NFP, PPI — rest of year)
  const now = Date.now();
  for (const ev of schedule.events) {
    const ts = Date.parse(ev.date);
    if (!Number.isFinite(ts) || ts < now) continue;
    // Skip if already covered by the live feed
    const alreadyCovered = economic.some(
      (e) => Math.abs(e.ts - ts) < 60_000 && e.title.toLowerCase().includes(ev.kind)
    );
    if (alreadyCovered) continue;
    vevents.push(
      vevent({
        uid: uid(`anchor:${ev.kind}:${ts}`),
        summary: `🔴 ${ev.title}`,
        description: "US macro event — from official published schedule",
        dtstart: ts,
        dtend: ts + 60_000,
        lead,
      })
    );
  }

  // --- Assemble iCalendar ---
  const cal = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Opentide//Market Sessions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Opentide — Market Sessions",
    "X-WR-CALDESC:Session opens and high-impact economic events from Opentide",
    "X-WR-TIMEZONE:UTC",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(cal, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="opentide.ics"',
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
