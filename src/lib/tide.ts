import {
  getAllSessionStates,
  SESSIONS,
  type SessionId,
  type SessionState,
} from "./sessions";

export interface TidePoint {
  /** Fraction [0,1) of the UTC day. */
  x: number;
  /** Normalized expected activity, including the crypto floor. */
  y: number;
  dominant: SessionId | null;
  overlap: boolean;
}

export interface TideReading {
  height: number;
  dominant: SessionId | null;
  overlap: boolean;
}

const SESSION_WEIGHT: Record<SessionId, number> = {
  sydney: 0.4,
  tokyo: 0.6,
  london: 1,
  newyork: 0.95,
};

const DAY_MS = 86_400_000;
const STEP_COUNT = 96;
const RAMP_MINUTES = 90;
const CRYPTO_FLOOR = 0.15;

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function circularMinutes(startFrac: number, endFrac: number): number {
  const raw = ((endFrac - startFrac + 1) % 1) * 1440;
  return raw === 0 ? 1440 : raw;
}

function minutesSince(startFrac: number, pointFrac: number): number {
  return ((pointFrac - startFrac + 1) % 1) * 1440;
}

export function tideEnvelopeAt(pointFrac: number, state: SessionState): number {
  const duration = circularMinutes(state.bandStart, state.bandEnd);
  const elapsed = minutesSince(state.bandStart, pointFrac);
  if (elapsed >= duration) return 0;

  const ramp = Math.min(RAMP_MINUTES, duration / 2);
  const up = smoothstep(0, ramp, elapsed);
  const down = 1 - smoothstep(duration - ramp, duration, elapsed);
  return Math.max(0, Math.min(up, down));
}

function volMultiplier(volProfile: number[] | undefined, pointFrac: number): number {
  if (!volProfile?.length) return 1;
  const hour = Math.min(23, Math.max(0, Math.floor(pointFrac * 24)));
  const normalized = volProfile[hour];
  if (!Number.isFinite(normalized)) return 1;
  return 0.75 + Math.max(0, Math.min(1, normalized)) * 0.5;
}

function dayStartUTC(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function getTideReading(
  when: Date,
  volProfile?: number[],
): TideReading {
  const pointFrac =
    (when.getUTCHours() * 60 + when.getUTCMinutes() + when.getUTCSeconds() / 60) / 1440;
  const states = getAllSessionStates(when);

  let rawHeight = 0;
  let dominant: SessionId | null = null;
  let dominantContribution = 0;
  let openLike = 0;

  for (const state of states) {
    const env = state.isOpen ? tideEnvelopeAt(pointFrac, state) : 0;
    if (env <= 0) continue;
    openLike += 1;
    const contribution = env * SESSION_WEIGHT[state.def.id];
    rawHeight += contribution;
    if (contribution > dominantContribution) {
      dominantContribution = contribution;
      dominant = state.def.id;
    }
  }

  const height = Math.max(
    CRYPTO_FLOOR,
    rawHeight * volMultiplier(volProfile, pointFrac),
  );

  return {
    height: Math.min(1, height / 1.8),
    dominant,
    overlap: openLike >= 2,
  };
}

export function buildTideCurve(now: Date, volProfile?: number[]): TidePoint[] {
  const start = dayStartUTC(now);
  return Array.from({ length: STEP_COUNT }, (_, i) => {
    const x = i / STEP_COUNT;
    const reading = getTideReading(new Date(start + x * DAY_MS), volProfile);
    return { x, y: reading.height, dominant: reading.dominant, overlap: reading.overlap };
  });
}

export function sessionColor(id: SessionId | null): string {
  return SESSIONS.find((s) => s.id === id)?.color ?? "var(--color-accent)";
}
