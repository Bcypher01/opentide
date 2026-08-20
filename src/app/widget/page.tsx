"use client";

import { useMemo } from "react";
import { useNow } from "@/lib/hooks";
import { getAllSessionStates } from "@/lib/sessions";
import SessionClock from "@/components/SessionClock";

/**
 * /widget — compact embeddable session clock. No header, no footer, no
 * economic calendar section. Just the session lanes, liquidity strip, and
 * countdown chips — everything you need at a glance.
 *
 * Embed with one line:
 *   <iframe src="https://opentide.dev/widget" width="100%" height="320"
 *           style="border:none; border-radius:12px;" loading="lazy"></iframe>
 */
export default function WidgetPage() {
  const now = useNow(1000);
  const states = useMemo(() => getAllSessionStates(now), [now]);

  return (
    <div className="min-h-screen bg-bg p-3">
      {/* Branding strip */}
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[10px] font-medium uppercase tracking-widest text-dim">
          Market session clock
        </span>
        <a
          href="https://opentide.dev"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-accent/70 hover:text-accent"
        >
          opentide.dev ↗
        </a>
      </div>

      {/* Pass calendar={null} so EconCalendar section is suppressed entirely */}
      <SessionClock
        now={now}
        states={states}
        useUTC={false}
        selected={null}
        onSelect={() => {}}
        calendar={null}
      />
    </div>
  );
}
