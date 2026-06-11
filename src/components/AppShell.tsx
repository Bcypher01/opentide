"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useNow } from "@/lib/hooks";
import { sessionGreeting } from "@/lib/sessions";
import { useStore } from "@/lib/store";
import AboutModal from "./AboutModal";
import ChartModal from "./ChartModal";
import { IconHelp } from "./Icons";
import Logo, { Wordmark } from "./Logo";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/buzz", label: "Buzz" },
  { href: "/news", label: "News" },
];

export default function AppShell({
  children,
  ticker,
}: {
  children: React.ReactNode;
  ticker?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const pathname = usePathname();
  const now = useNow(1000);
  const { useUTC, toggleUTC, openAbout, aboutSeen } = useStore();

  // First visit ever: open the tour once (after mount, so the persisted
  // aboutSeen flag has hydrated). openAbout marks it seen, so never again.
  useEffect(() => {
    if (mounted && !aboutSeen) openAbout();
  }, [mounted, aboutSeen, openAbout]);

  return (
    <div className="bg-glow flex min-h-screen flex-col">
      {ticker}

      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1700px] items-center gap-2 px-4 py-2.5 lg:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Opentide home">
            <Logo size={28} />
            <Wordmark className="hidden text-xl sm:inline" />
          </Link>

          <nav className="ml-3 flex items-center gap-1" aria-label="Main navigation">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-surface2 font-medium text-text"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          {mounted && (
            <>
              <p className="ml-2 hidden min-w-0 truncate text-sm text-muted xl:block">
                {sessionGreeting(now)}
              </p>
              <button
                onClick={toggleUTC}
                className="num ml-auto shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
                title="Toggle between local time and UTC"
              >
                {useUTC
                  ? `${now.toISOString().slice(11, 19)} UTC`
                  : now.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
              </button>
              <button
                onClick={openAbout}
                title="What is Opentide? Take the 60-second tour"
                aria-label="About Opentide"
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-text"
              >
                <IconHelp size={16} />
                {!aboutSeen && (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                )}
              </button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1700px] flex-1 px-4 pb-10 pt-4 lg:px-6">{children}</main>

      {mounted && <ChartModal />}
      {mounted && <AboutModal />}

      <footer className="mx-auto w-full max-w-[1700px] px-4 pb-8 text-center text-xs text-muted/60 lg:px-6">
        Data: Binance · Frankfurter (ECB) · Finnhub · CoinGecko · Yahoo · CoinDesk · Cointelegraph
        · CNBC · MarketWatch · FXStreet. Charts by TradingView. Not investment advice.
      </footer>
    </div>
  );
}
