// ---------------------------------------------------------------------------
// Session engine — DST-aware market session math.
// Sessions are defined by their LOCAL open/close hours in their home IANA
// timezone, so daylight-saving shifts are handled automatically.
// ---------------------------------------------------------------------------

export type SessionId = "sydney" | "tokyo" | "london" | "newyork";

export interface SessionDef {
  id: SessionId;
  name: string;
  city: string;
  tz: string;
  openHour: number; // local hour
  closeHour: number; // local hour
  color: string; // lane color
  hint: string; // what's typically active
}

export const SESSIONS: SessionDef[] = [
  {
    id: "sydney",
    name: "Sydney",
    city: "Sydney",
    tz: "Australia/Sydney",
    openHour: 8,
    closeHour: 17,
    color: "#7C6FF0",
    hint: "AUD & NZD pairs wake up",
  },
  {
    id: "tokyo",
    name: "Tokyo",
    city: "Tokyo",
    tz: "Asia/Tokyo",
    openHour: 9,
    closeHour: 18,
    color: "#E06CA8",
    hint: "JPY pairs most active",
  },
  {
    id: "london",
    name: "London",
    city: "London",
    tz: "Europe/London",
    openHour: 8,
    closeHour: 17,
    color: "#4FA8E8",
    hint: "GBP & EUR pairs surge",
  },
  {
    id: "newyork",
    name: "New York",
    city: "New York",
    tz: "America/New_York",
    openHour: 8,
    closeHour: 17,
    color: "#E8B44F",
    hint: "US stocks + USD pairs",
  },
];

/** Minutes that `tz` is ahead of UTC at `date` (DST-aware, no deps). */
export function zoneOffsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

interface Window {
  open: number; // ms epoch
  close: number; // ms epoch
}

/**
 * Trading windows (Mon–Fri local) for a session, from `daysBack` days before
 * to `daysAhead` days after `now`.
 */
function windowsAround(def: SessionDef, now: Date, daysBack = 2, daysAhead = 8): Window[] {
  const offsetMin = zoneOffsetMinutes(def.tz, now);
  // Current local date in the session's zone:
  const local = new Date(now.getTime() + offsetMin * 60000);
  const baseY = local.getUTCFullYear();
  const baseM = local.getUTCMonth();
  const baseD = local.getUTCDate();

  const windows: Window[] = [];
  for (let d = -daysBack; d <= daysAhead; d++) {
    // Local midnight (as a UTC timestamp pretending local == UTC), then
    // convert back to a real epoch using the offset *at that moment*.
    const guess = new Date(Date.UTC(baseY, baseM, baseD + d, 12, 0, 0));
    const offAtDay = zoneOffsetMinutes(def.tz, guess);
    const localNoon = new Date(guess.getTime() + offAtDay * 60000);
    const dow = localNoon.getUTCDay();
    if (dow === 0 || dow === 6) continue; // weekend in the session's zone
    const y = localNoon.getUTCFullYear();
    const m = localNoon.getUTCMonth();
    const day = localNoon.getUTCDate();
    const open = Date.UTC(y, m, day, def.openHour, 0, 0) - offAtDay * 60000;
    const close = Date.UTC(y, m, day, def.closeHour, 0, 0) - offAtDay * 60000;
    windows.push({ open, close });
  }
  return windows.sort((a, b) => a.open - b.open);
}

export interface SessionState {
  def: SessionDef;
  isOpen: boolean;
  /** epoch ms of next open (if closed) */
  opensAt: number | null;
  /** epoch ms of close of the current window (if open) */
  closesAt: number | null;
  /** Fraction [0,1) of the 24h UTC day where today's band starts/ends. May wrap. */
  bandStart: number;
  bandEnd: number;
}

export function getSessionState(def: SessionDef, now: Date): SessionState {
  const t = now.getTime();
  const windows = windowsAround(def, now);

  let isOpen = false;
  let opensAt: number | null = null;
  let closesAt: number | null = null;

  for (const w of windows) {
    if (t >= w.open && t < w.close) {
      isOpen = true;
      closesAt = w.close;
    }
    if (w.open > t && opensAt === null) opensAt = w.open;
  }

  // Band position on a 24h UTC axis (today): derive from current offset.
  const offsetMin = zoneOffsetMinutes(def.tz, now);
  const openUTC = (((def.openHour * 60 - offsetMin) % 1440) + 1440) % 1440;
  const closeUTC = (((def.closeHour * 60 - offsetMin) % 1440) + 1440) % 1440;

  return {
    def,
    isOpen,
    opensAt,
    closesAt,
    bandStart: openUTC / 1440,
    bandEnd: closeUTC / 1440,
  };
}

export function getAllSessionStates(now: Date): SessionState[] {
  return SESSIONS.map((s) => getSessionState(s, now));
}

/** True when the traditional (forex/stocks) markets are in the weekend gap. */
export function isMarketWeekend(now: Date): boolean {
  return getAllSessionStates(now).every((s) => !s.isOpen && s.opensAt !== null && s.opensAt - now.getTime() > 3 * 3600_000);
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function sessionGreeting(now: Date): string {
  const states = getAllSessionStates(now);
  const open = states.filter((s) => s.isOpen);
  if (open.length >= 2) {
    const names = open.map((s) => s.def.name).join(" + ");
    return `${names} overlap — peak liquidity window`;
  }
  if (open.length === 1) {
    const s = open[0];
    const left = s.closesAt ? s.closesAt - now.getTime() : 0;
    if (left < 90 * 60000) return `${s.def.name} is in its final ${formatCountdown(left)}`;
    return `${s.def.name} session is live — ${s.def.hint}`;
  }
  const next = states
    .filter((s) => s.opensAt !== null)
    .sort((a, b) => (a.opensAt as number) - (b.opensAt as number))[0];
  if (next) {
    return `Markets quiet — ${next.def.name} opens in ${formatCountdown((next.opensAt as number) - now.getTime())}`;
  }
  return "Crypto never sleeps";
}
