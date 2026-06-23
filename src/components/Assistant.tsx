"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconX, IconZap } from "./Icons";

// ---------------------------------------------------------------------------
// Assistant — the agentic market assistant, as a floating chat widget.
//
// Renders a launcher button pinned to the bottom-right on every screen. Tapping
// it opens a compact chat window in the same corner; the dashboard underneath is
// untouched. Asks /api/assistant (GET) on mount whether AI is configured; if not,
// it renders nothing at all (same self-hiding posture as AiInsights), so with no
// key the app looks exactly as before.
//
// When the user asks, the panel streams the agent's progress: "Checking prices…"
// chips appear as tools run, then the grounded answer replaces them.
//
// Multi-turn: a per-browser sessionId (persisted in localStorage) is sent with
// every ask, so the server can thread follow-ups ("and ETH?") onto the prior
// conversation (see lib/agent/session.ts). The transcript below also keeps the
// turns client-side for display.
//
// Read-only + not financial advice: the footer repeats the disclaimer.
// ---------------------------------------------------------------------------

interface Turn {
  role: "user" | "assistant";
  text: string;
}

const SESSION_KEY = "opentide.assistant.session";

/** Stable per-browser conversation id; created once and reused across visits. */
function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "")
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // localStorage blocked (private mode) → ephemeral, single-turn session.
    return "";
  }
}

type AgentEvent =
  | { type: "tool"; tool: string; label: string }
  | { type: "answer"; answer: string; degraded: boolean; stop: string };

// Render the agent's answer, turning markdown links [text](url) — the citation
// format the get_news tool asks the model to use — into real, safe anchors.
// Only http(s) links are linkified; everything else stays plain text.
const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
function renderWithLinks(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MD_LINK.lastIndex = 0;
  while ((m = MD_LINK.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <a
        key={m.index}
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-accent underline underline-offset-2 hover:text-accent/80"
      >
        {m[1]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const SUGGESTIONS = [
  "Why is Bitcoin moving today?",
  "Is the market risk-on or risk-off?",
  "What's driving EUR/USD?",
];

export default function Assistant() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chips, setChips] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionId = useRef<string>("");

  // Mint/restore the conversation id once on mount (client-only).
  useEffect(() => {
    sessionId.current = getSessionId();
  }, []);

  // Capability probe — hide entirely when no provider key is configured.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j: { enabled?: boolean }) => {
        if (!cancelled) setEnabled(Boolean(j.enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, chips, open]);

  // Focus the input when the window opens; close on Escape.
  useEffect(() => {
    if (open) inputRef.current?.focus();
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text: q }]);
    setBusy(true);
    setChips([]);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          ...(sessionId.current ? { sessionId: sessionId.current } : {}),
        }),
      });

      if (!res.ok || !res.body) {
        const msg =
          res.status === 429
            ? "You're asking a lot quickly — give it a moment."
            : "The assistant is unavailable right now.";
        setTurns((t) => [...t, { role: "assistant", text: msg }]);
        return;
      }

      // Parse the SSE stream: `data: {json}\n\n` frames.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 2);
          if (!frame.startsWith("data:")) continue;

          let evt: AgentEvent;
          try {
            evt = JSON.parse(frame.slice(5).trim()) as AgentEvent;
          } catch {
            continue;
          }

          if (evt.type === "tool") {
            setChips((c) => (c.includes(evt.label) ? c : [...c, evt.label]));
          } else {
            setChips([]);
            setTurns((t) => [...t, { role: "assistant", text: evt.answer }]);
          }
        }
      }
    } catch {
      setTurns((t) => [
        ...t,
        { role: "assistant", text: "Something interrupted that. Try again." },
      ]);
    } finally {
      setBusy(false);
      setChips([]);
    }
  }

  // Hidden until we know AI is configured (and then only the launcher shows).
  if (!enabled) return null;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {/* Launcher — pinned bottom-right, hidden while the window is open. */}
      {!open && (
        <motion.button
          key="launcher"
          onClick={() => setOpen(true)}
          aria-label="Ask OpenTide"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="fixed bottom-5 right-5 z-50 flex origin-bottom-right items-center gap-2 rounded-full border border-accent/40 bg-surface/95 px-4 py-3 text-sm font-medium text-text shadow-lg shadow-black/20 backdrop-blur transition-colors hover:border-accent hover:bg-surface"
        >
          <IconZap className="h-4 w-4 text-accent" />
          <span className="hidden sm:inline">Ask OpenTide</span>
        </motion.button>
      )}

      {/* Chat window — same corner, compact, scrollable. */}
      {open && (
        <motion.div
          key="window"
          role="dialog"
          aria-label="OpenTide assistant"
          initial={{ opacity: 0, scale: 0.9, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed bottom-5 right-5 z-50 flex max-h-[min(70vh,560px)] w-[min(380px,calc(100vw-2.5rem))] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/30"
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <IconZap className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium text-text">Ask OpenTide</span>
            <span className="rounded-full border border-border bg-surface2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted/70">
              beta
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="ml-auto rounded-lg p-1 text-muted transition-colors hover:bg-surface2 hover:text-text"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>

          {/* Transcript */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {turns.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted">
                  Ask about any market — I&apos;ll pull live data to answer.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-full border border-border bg-surface2/60 px-3 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-text"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t, i) => (
              <div
                key={i}
                className={
                  t.role === "user" ? "flex justify-end" : "flex justify-start"
                }
              >
                <p
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                    t.role === "user"
                      ? "bg-accent/15 text-text"
                      : "border border-border bg-surface2/50 text-text"
                  }`}
                >
                  {t.role === "assistant" ? renderWithLinks(t.text) : t.text}
                </p>
              </div>
            ))}

            {busy && (
              <div className="flex flex-wrap items-center gap-2">
                {chips.length === 0 ? (
                  <span className="text-xs text-muted">Thinking…</span>
                ) : (
                  chips.map((c) => (
                    <span
                      key={c}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-surface2 px-2.5 py-1 text-[11px] text-muted"
                    >
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                      {c}…
                    </span>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="flex items-center gap-2 border-t border-border px-3 py-2.5"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a market…"
              disabled={busy}
              className="min-w-0 flex-1 bg-transparent px-1 text-sm text-text placeholder:text-muted/60 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
            >
              Ask
            </button>
          </form>

          <p className="px-4 pb-3 text-[10px] leading-snug text-muted/60">
            Grounded in live market data · not financial advice. Can&apos;t place
            trades. Verify before acting.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
