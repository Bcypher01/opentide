import { NextResponse, type NextRequest } from "next/server";
import { runAgent, type AgentEvent } from "@/lib/agent/runtime";
import {
  acquireLock,
  appendTurn,
  isValidSessionId,
  loadHistory,
  releaseLock,
} from "@/lib/agent/session";
import { llmEnabled } from "@/lib/llm";

// ---------------------------------------------------------------------------
// /api/assistant — the agentic market assistant.
//
//   GET  → { enabled } cheap capability probe so the UI can self-hide when no
//          provider key is configured (matches the AiInsights "look unchanged
//          when AI is off" posture).
//   POST → { "message": "why is BTC down?", "sessionId"?: "…" } ; responds with
//          a Server-Sent Events stream: zero or more `tool` progress events (so
//          the client can show "Checking prices…" chips as the agent works)
//          followed by one terminal `answer` event.
//
// Multi-turn: when a valid sessionId is supplied we load the conversation's
// prior turns (agent/session.ts), run the agent with them as context, and
// persist the new exchange. A per-session lock enforces concurrency 1 — a
// second message for the same session while one is in flight is refused with a
// friendly answer rather than running two loops in parallel.
//
// The agent runs READ-ONLY tools only and never trades or mutates state
// (lib/agent/tools.ts). It is grounded in live data and degrades gracefully:
// no key (or all providers failing) → a single answer event with degraded:true
// and a friendly message. Never 502s.
//
// Rate limiting (repo rule): the route is covered by the dedicated, tightest
// `api-agent` bucket in middleware.ts — one agent request fans out into several
// upstream calls, so it must not share the api-ai budget.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_MESSAGE_CHARS = 1_000;

export function GET() {
  return NextResponse.json({ enabled: llmEnabled() });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const raw = (body as { message?: unknown })?.message;
  const message =
    typeof raw === "string" ? raw.trim().slice(0, MAX_MESSAGE_CHARS) : "";
  if (!message) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  const sessionId = (body as { sessionId?: unknown })?.sessionId;
  const sid = isValidSessionId(sessionId) ? sessionId : null;

  const encoder = new TextEncoder();
  const send = (
    controller: ReadableStreamDefaultController,
    event: AgentEvent,
  ) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      // Concurrency 1 per session: refuse a second overlapping loop rather than
      // double-spend the LLM budget. No store / no sessionId → always granted.
      const locked = sid ? await acquireLock(sid) : true;
      if (!locked) {
        send(controller, {
          type: "answer",
          answer: "I'm still working on your previous question — one moment.",
          degraded: false,
          stop: "answered",
        });
        controller.close();
        return;
      }

      try {
        const history = sid ? await loadHistory(sid) : [];
        const result = await runAgent(message, {
          history,
          onEvent: (e) => {
            try {
              send(controller, e);
            } catch {
              // client disconnected — runAgent still finishes cheaply
            }
          },
        });
        send(controller, {
          type: "answer",
          answer: result.answer,
          degraded: result.degraded,
          stop: result.stop,
        });
        // Persist the exchange only when the agent actually answered.
        if (sid && !result.degraded && result.stop !== "unavailable") {
          await appendTurn(sid, message, result.answer);
        }
      } catch {
        send(controller, {
          type: "answer",
          answer: "The assistant is unavailable right now.",
          degraded: true,
          stop: "unavailable",
        });
      } finally {
        if (sid) await releaseLock(sid);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
