"use client";

import { useRef, useState } from "react";
import type { ExplainResult, ExplainTarget } from "@/lib/explain";
import { IconHelp, IconX } from "./Icons";

// ---------------------------------------------------------------------------
// Explain — a reusable "✦ Explain" toggle + inline panel for any tappable
// market object (news headline, calendar event, funding extreme). POSTs the
// target to /api/explain on first open (lazy — no request until asked), caches
// the result locally so re-opening is instant, and self-suppresses when the AI
// layer is unavailable (degraded response → a one-line graceful note, and the
// button won't re-fire). Mirrors the EconCalendar explainer styling so the
// whole app teaches the same way.
// ---------------------------------------------------------------------------

interface Props {
  target: ExplainTarget;
  /** Button label. Defaults to "Explain". */
  label?: string;
  className?: string;
}

type Status = "idle" | "loading" | "ready" | "error";

export default function Explain({ target, label = "Explain", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ExplainResult | null>(null);
  // Cache the in-flight request so a fast double-tap doesn't double-fetch.
  const fetchedRef = useRef(false);

  async function load() {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setStatus("loading");
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as ExplainResult;
      setResult(data);
      setStatus(data.degraded ? "error" : "ready");
    } catch {
      // Allow a retry on a transient network error.
      fetchedRef.current = false;
      setStatus("error");
      setResult(null);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && status === "idle") void load();
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`inline-flex min-h-[24px] items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
          open
            ? "border-accent/50 bg-accent/10 text-accent"
            : "border-border bg-surface2 text-muted hover:border-accent/40 hover:text-accent"
        }`}
      >
        <IconHelp size={11} />
        {label}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Explanation"
          className="fade-in mt-2 rounded-xl border border-accent/30 bg-surface p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted/70">
              In plain English
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close explanation"
              className="-mr-1 -mt-1 shrink-0 rounded-md p-0.5 text-muted transition-colors hover:bg-surface2 hover:text-text"
            >
              <IconX size={13} />
            </button>
          </div>

          {status === "loading" && (
            <div className="mt-2 space-y-1.5">
              <div className="skeleton h-2.5 w-full rounded" />
              <div className="skeleton h-2.5 w-4/5 rounded" />
              <div className="skeleton h-2.5 w-2/3 rounded" />
            </div>
          )}

          {status === "ready" && result && (
            <div className="mt-1.5">
              <p className="text-xs leading-relaxed text-text/90">
                <span className="font-medium text-muted">What it is — </span>
                {result.what}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-text/90">
                <span className="font-medium text-muted">Why it matters — </span>
                {result.why}
              </p>
              {result.risk && (
                <p className="mt-1.5 text-xs leading-relaxed text-text/90">
                  <span className="font-medium text-muted">Watch out — </span>
                  {result.risk}
                </p>
              )}
              <p className="mt-2 text-[10px] uppercase tracking-wider text-muted/50">
                AI-generated · descriptive, not financial advice
              </p>
            </div>
          )}

          {status === "error" && (
            <p className="mt-2 text-xs text-muted">
              Can&apos;t generate an explanation right now. The rest of the app is unaffected.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
