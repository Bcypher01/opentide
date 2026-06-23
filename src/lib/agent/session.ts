// ---------------------------------------------------------------------------
// agent/session.ts — multi-turn conversation memory for the agent.
//
// Stores a short rolling history of (user, assistant) TEXT turns per client
// `sessionId` on Upstash Redis — the same store the rate limiter already uses,
// so no new infra. The client mints the sessionId (localStorage) and sends it
// with each message; we load the prior turns, run the agent with them as
// context, then append the new exchange.
//
// Why text-only turns (no tool-call replay): the agent re-fetches live data on
// every message anyway (prices move), so persisting tool calls would just bloat
// tokens and risk stale numbers. Keeping the last few plain turns is enough for
// follow-ups like "and ETH?" or "why does that matter?".
//
// Bounded by construction (the whole point of going agentic safely):
//   · TTL_SECONDS        — a session self-expires (no unbounded storage)
//   · MAX_TURNS          — only the most recent N messages are kept
//   · MAX_TOTAL_CHARS    — hard cap on stored history size
//   · a per-session LOCK — concurrency 1, so one session can't run two loops
//
// Degrades gracefully: with no Upstash configured (e.g. local dev) loadHistory
// returns [], appends no-op, and the lock always grants — the assistant simply
// behaves single-turn instead of erroring.
// ---------------------------------------------------------------------------

import type { AgentMessage } from "@/lib/llm";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const TTL_SECONDS = 2 * 60 * 60; // a conversation lives 2h after the last turn
const MAX_TURNS = 8; // last 8 messages (~4 exchanges)
const MAX_TOTAL_CHARS = 6_000; // cap stored history size
const MAX_TURN_CHARS = 1_500; // cap any single stored turn
const LOCK_TTL_SECONDS = 35; // > the runtime DEADLINE_MS (30s) + slack

/** A stored turn — plain text only (see header). */
interface StoredTurn {
  role: "user" | "assistant";
  content: string;
}

/** True when there's a backing store; otherwise everything degrades to no-op. */
export function sessionMemoryEnabled(): boolean {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

/** Validate a client-supplied session id: short, url-safe, length-capped. */
export function isValidSessionId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

/** Run one Upstash REST command; null on any failure (fail soft). */
async function redis(command: (string | number)[]): Promise<unknown> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(REDIS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: unknown };
    return json.result ?? null;
  } catch {
    return null;
  }
}

const histKey = (id: string) => `agent:hist:${id}`;
const lockKey = (id: string) => `agent:lock:${id}`;

/**
 * Acquire the per-session lock (concurrency 1). Returns true if this caller now
 * holds it. With no store, always grants. The lock auto-expires so a crashed
 * request can't wedge a session permanently.
 */
export async function acquireLock(sessionId: string): Promise<boolean> {
  if (!sessionMemoryEnabled()) return true;
  // SET key 1 NX EX ttl → "OK" when set, null when the key already exists.
  const r = await redis(["SET", lockKey(sessionId), "1", "NX", "EX", LOCK_TTL_SECONDS]);
  return r === "OK";
}

/** Release the per-session lock. Best-effort; the TTL is the real safety net. */
export async function releaseLock(sessionId: string): Promise<void> {
  if (!sessionMemoryEnabled()) return;
  await redis(["DEL", lockKey(sessionId)]);
}

/** Load prior turns as AgentMessages the runtime can prepend. [] when empty. */
export async function loadHistory(sessionId: string): Promise<AgentMessage[]> {
  if (!sessionMemoryEnabled()) return [];
  const raw = await redis(["GET", histKey(sessionId)]);
  if (typeof raw !== "string") return [];
  let turns: StoredTurn[];
  try {
    turns = JSON.parse(raw) as StoredTurn[];
  } catch {
    return [];
  }
  if (!Array.isArray(turns)) return [];
  return turns
    .filter(
      (t) =>
        t &&
        (t.role === "user" || t.role === "assistant") &&
        typeof t.content === "string",
    )
    .map((t) => ({ role: t.role, content: t.content }) as AgentMessage);
}

/** Append one (user, assistant) exchange, then trim + refresh the TTL. */
export async function appendTurn(
  sessionId: string,
  userText: string,
  assistantText: string,
): Promise<void> {
  if (!sessionMemoryEnabled()) return;

  const prior = await loadHistory(sessionId);
  const next: StoredTurn[] = [
    ...prior.map((m) => ({
      role: m.role as "user" | "assistant",
      content: "content" in m && typeof m.content === "string" ? m.content : "",
    })),
    { role: "user", content: userText.slice(0, MAX_TURN_CHARS) },
    { role: "assistant", content: assistantText.slice(0, MAX_TURN_CHARS) },
  ];

  // Trim to the most recent MAX_TURNS, then enforce the total-size cap by
  // dropping the oldest pairs until we're under budget.
  let trimmed = next.slice(-MAX_TURNS);
  while (
    trimmed.length > 2 &&
    trimmed.reduce((n, t) => n + t.content.length, 0) > MAX_TOTAL_CHARS
  ) {
    trimmed = trimmed.slice(2); // drop the oldest exchange
  }

  await redis(["SET", histKey(sessionId), JSON.stringify(trimmed), "EX", TTL_SECONDS]);
}

/** Forget a conversation (e.g. a "new chat" action). Best-effort. */
export async function clearHistory(sessionId: string): Promise<void> {
  if (!sessionMemoryEnabled()) return;
  await redis(["DEL", histKey(sessionId)]);
}
