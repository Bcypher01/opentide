import { NextResponse, type NextRequest } from "next/server";
import { runAgent, type AgentEvent } from "@/lib/agent/runtime";
import { llmEnabled } from "@/lib/llm";

// ---------------------------------------------------------------------------
// /api/assistant — the agentic market assistant.
//
//   GET  → { enabled } cheap capability probe so the UI can self-hide when no
//          provider key is configured (matches the AiInsights "look unchanged
//          when AI is off" posture).
//   POST → { "message": "why is BTC down?" } ; responds with a Server-Sent
//          Events stream: zero or more `tool` progress events (so the client can
//          show "Checking prices…" chips as the agent works) followed by one
//          terminal `answer` event.
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

  const encoder = new TextEncoder();
  const send = (
    controller: ReadableStreamDefaultController,
    event: AgentEvent,
  ) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await runAgent(message, {
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
      } catch {
        send(controller, {
          type: "answer",
          answer: "The assistant is unavailable right now.",
          degraded: true,
          stop: "unavailable",
        });
      } finally {
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
