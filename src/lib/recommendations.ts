// ---------------------------------------------------------------------------
// recommendations.ts — turn the market context the dashboard already polls into
// a short list of *actionable* AI recommendations.
//
// Grounding: pulse (sentiment + macro), derivatives funding extremes, top
// movers, today's high-impact calendar events, and a light read of the news
// wire for catalysts. The LLM is asked for STRICT JSON against a fixed schema;
// we then validate every item (drop malformed ones, verify assetId against the
// known universe) so the UI can render without defensive parsing.
//
// Not financial advice — see SYSTEM prompt; the UI repeats the disclaimer.
// ---------------------------------------------------------------------------

import { ASSET_BY_ID } from "./assets";
import { generate, type LlmMessage, type LlmProvider } from "./llm";

export type RecAction = "watch" | "long" | "short" | "hedge";

export interface AiRecommendation {
  /** One-line, imperative headline, e.g. "Watch BTC into the FOMC print". */
  title: string;
  /** 1–2 sentence rationale tied to the supplied data. */
  rationale: string;
  action: RecAction;
  /** 1 = highest. Drives ordering + accent in the UI. */
  priority: 1 | 2 | 3;
  /** Optional asset id ("crypto:BTC") so the card is tap-to-chart. */
  assetId?: string;
}

export interface RecommendationsResult {
  recommendations: AiRecommendation[];
  /** Which provider produced these (telemetry / UI badge). */
  provider?: LlmProvider;
  ts: number;
  /** True when AI was unavailable and the list is empty. */
  degraded: boolean;
  /** True when recommendations were tailored to a non-empty watchlist. */
  personalized: boolean;
  /** Dev-only failure reason when degraded (omitted in production). */
  error?: string;
}

// --- Context shapes (kept minimal to hold token cost down) ----------------
export interface MoverLite {
  id: string;
  symbol: string;
  changePct: number;
}
export interface EventLite {
  title: string;
  country: string;
  whenISO: string;
  impact: string;
}
export interface HeadlineLite {
  title: string;
  source: string;
  weight: string;
}
export interface WatchlistLite {
  id: string;
  symbol: string;
  market: string;
  price: number | null;
  changePct: number | null;
}

export interface RecommendationContext {
  pulse: {
    cryptoFearGreed?: number | null;
    cryptoFGLabel?: string | null;
    stockFearGreed?: number | null;
    btcDominance?: number | null;
    mcapChangePct?: number | null;
    dxy?: number | null;
    yieldSpread2s10s?: number | null;
  };
  topGainers: MoverLite[];
  topLosers: MoverLite[];
  fundingExtremes: Array<{ symbol: string; ratePct: number }>;
  events: EventLite[];
  headlines: HeadlineLite[];
  /** The user's watchlisted assets with live quotes. Empty = market-wide. */
  watchlist: WatchlistLite[];
}

const SYSTEM = [
  "You are a markets analyst inside a real-time trading dashboard called OpenTide.",
  "From the structured market snapshot you are given, produce 3 to 5 concise, ACTIONABLE recommendations a discretionary trader could act on today.",
  "Ground every recommendation in the supplied numbers (sentiment, funding, movers, macro events, headlines). Do not invent data, prices, or events not present.",
  "Each recommendation must be specific (name the asset/theme and the trigger), not generic advice like 'diversify' or 'do your research'.",
  "If a WATCHLIST is provided, make the MAJORITY of recommendations about those assets (use their live quotes), ordered by how actionable they are. You may include AT MOST 1-2 notable market-wide ideas outside the watchlist so the user doesn't miss a major catalyst. If the watchlist is empty, give market-wide recommendations.",
  "This is market commentary for an informed user, NOT personalized financial advice. Be measured; flag risk where relevant.",
  "",
  "Respond with ONLY a JSON object of this exact shape (no markdown, no prose):",
  '{ "recommendations": [ { "title": string, "rationale": string, "action": "watch"|"long"|"short"|"hedge", "priority": 1|2|3, "assetId": string|null } ] }',
  "title: <= 80 chars, imperative. rationale: 1-2 sentences. priority: 1 = most urgent.",
  "assetId must be one of the provided asset ids, or null if the idea is cross-market.",
].join("\n");

// OpenAPI-subset schema handed to Gemini's responseSchema (see llm.ts). Forces
// the model to emit JSON of exactly this shape, so parseRecommendations() drops
// far fewer items. The prompt above still spells the schema out for the
// OpenRouter fallback path, which stays on plain json_object.
// NOTE: Gemini's responseSchema is an OpenAPI subset that wants UPPERCASE type
// names; a malformed schema 400s, which our ladder treats as fatal for the
// whole provider. So we keep it to plain shape/field-presence (the thing that
// actually fixes malformed drops) and leave value constraints (action enum,
// priority 1-3, assetId membership) to parseRecommendations().
const RECS_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    recommendations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          rationale: { type: "STRING" },
          action: { type: "STRING" },
          priority: { type: "INTEGER" },
          assetId: { type: "STRING", nullable: true },
        },
        required: ["title", "rationale", "action", "priority"],
      },
    },
  },
  required: ["recommendations"],
};

/** Build the chat messages for one recommendations pass. */
export function buildMessages(ctx: RecommendationContext): LlmMessage[] {
  const validIds = Object.keys(ASSET_BY_ID);
  const hasWatchlist = ctx.watchlist.length > 0;
  const user = [
    hasWatchlist
      ? `The user is WATCHING these assets: ${ctx.watchlist
          .map((w) => w.id)
          .join(", ")}. Center your recommendations on them (see "watchlist" in the snapshot for live quotes), and add at most 1-2 broader market ideas.`
      : "The user has no watchlist — give market-wide recommendations.",
    "",
    "MARKET SNAPSHOT (JSON):",
    JSON.stringify(ctx, null, 2),
    "",
    `Valid assetId values: ${validIds.join(", ")}`,
    "",
    "Return the JSON object now.",
  ].join("\n");

  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}

const ACTIONS: ReadonlySet<string> = new Set(["watch", "long", "short", "hedge"]);

/** Pull the first JSON value (object OR array) out of a possibly-fenced
 *  model response, picking whichever bracket type appears first. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;

  const firstObj = body.indexOf("{");
  const firstArr = body.indexOf("[");
  let start: number;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);

  if (start < 0) return body;
  const close = body[start] === "[" ? "]" : "}";
  const end = body.lastIndexOf(close);
  return end > start ? body.slice(start, end + 1) : body;
}

/**
 * Parse + validate the model output into clean recommendations. Anything that
 * doesn't fit the schema is dropped rather than thrown, so a single bad item
 * can't blank the whole feed.
 */
export function parseRecommendations(text: string): AiRecommendation[] {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch {
    return [];
  }

  const arr = Array.isArray(raw)
    ? raw
    : ((raw as { recommendations?: unknown })?.recommendations ?? []);
  if (!Array.isArray(arr)) return [];

  const out: AiRecommendation[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;

    const title = typeof o.title === "string" ? o.title.trim() : "";
    const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
    const action = typeof o.action === "string" ? o.action.toLowerCase() : "";
    if (!title || !rationale || !ACTIONS.has(action)) continue;

    let priority: 1 | 2 | 3 = 2;
    const p = Number(o.priority);
    if (p === 1 || p === 2 || p === 3) priority = p;

    let assetId: string | undefined;
    if (typeof o.assetId === "string" && o.assetId in ASSET_BY_ID) {
      assetId = o.assetId;
    }

    out.push({
      title: title.slice(0, 120),
      rationale,
      action: action as RecAction,
      priority,
      assetId,
    });
  }

  // Highest priority first; cap at 5 so the UI stays a glanceable card.
  return out.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

/**
 * One-shot: build prompt → call LLM (Gemini → OpenRouter) → validate.
 * Never throws; returns a degraded result if AI is unavailable.
 */
export async function getRecommendations(
  ctx: RecommendationContext,
): Promise<RecommendationsResult> {
  const personalized = ctx.watchlist.length > 0;
  try {
    const { text, provider } = await generate(buildMessages(ctx), {
      json: true,
      schema: RECS_SCHEMA,
      temperature: 0.4,
    });
    const recommendations = parseRecommendations(text);
    return {
      recommendations,
      provider,
      ts: Date.now(),
      degraded: recommendations.length === 0,
      personalized,
      // Parsed empty despite a successful call → flag it (dev only).
      ...(recommendations.length === 0 && process.env.NODE_ENV !== "production"
        ? { error: "LLM returned no parseable recommendations" }
        : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recommendations] failed:", message);
    return {
      recommendations: [],
      ts: Date.now(),
      degraded: true,
      personalized,
      ...(process.env.NODE_ENV !== "production" ? { error: message } : {}),
    };
  }
}
