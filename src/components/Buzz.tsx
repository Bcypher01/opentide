"use client";

import { usePolling } from "@/lib/hooks";
import { formatCalendarDate, formatChangePct } from "@/lib/format";
import type { BuzzCoin, BuzzIpo } from "@/app/api/buzz/route";
import { IconBell, IconFlame, IconTrendingUp } from "./Icons";

interface BuzzPayload {
  coins: BuzzCoin[];
  stocks: string[];
  ipos: BuzzIpo[];
  iposNeedKey: boolean;
}

interface Props {
  /** open a chart for a custom TradingView symbol: "custom|TV:SYMBOL|Label" */
  onSelect: (id: string) => void;
}

function Panel({
  icon,
  title,
  sub,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="text-accent">{icon}</span>
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted/60">{sub}</span>
      </div>
      <div className="mt-3 min-h-0 flex-1">{children}</div>
    </div>
  );
}

function Skeletons({ n = 5 }: { n?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton h-7" />
      ))}
    </div>
  );
}

export function TrendingCoinsPanel({ onSelect }: Props) {
  const { data } = usePolling<BuzzPayload>("/api/buzz", 600_000);
  return (
    <Panel icon={<IconFlame size={15} />} title="Trending coins" sub="most searched · CoinGecko">
      {!data ? (
        <Skeletons />
      ) : data.coins.length === 0 ? (
        <p className="text-xs text-muted">Trend data unreachable — retries automatically.</p>
      ) : (
        <ul className="space-y-1">
          {data.coins.map((c, i) => {
            const up = (c.pct24h ?? 0) >= 0;
            return (
              <li key={c.symbol + i}>
                <button
                  onClick={() => onSelect(`custom|CRYPTO:${c.symbol}USD|${c.name} (${c.symbol})`)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface2"
                  title={`View ${c.name} chart`}
                >
                  <span className="num w-5 shrink-0 text-center text-[11px] text-muted/60">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium">{c.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">{c.name}</span>
                  {c.rank !== null && (
                    <span className="num hidden rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-muted sm:inline">
                      #{c.rank}
                    </span>
                  )}
                  <span
                    className={`num text-xs ${c.pct24h === null ? "text-muted" : up ? "text-bull" : "text-bear"}`}
                  >
                    {c.pct24h !== null && (up ? "▲ " : "▼ ")}
                    {formatChangePct(c.pct24h)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function HotStocksPanel({ onSelect }: Props) {
  const { data } = usePolling<BuzzPayload>("/api/buzz", 600_000);
  return (
    <Panel icon={<IconTrendingUp size={15} />} title="Hot stocks" sub="most searched · Yahoo">
      {!data ? (
        <Skeletons />
      ) : data.stocks.length === 0 ? (
        <p className="text-xs text-muted">
          Trend feed unreachable right now — the Movers strip on the dashboard still shows the
          biggest actual movers.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {data.stocks.map((s) => (
            <button
              key={s}
              onClick={() => onSelect(`custom|${s}|${s}`)}
              className="rounded-full border border-border bg-surface2 px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent/50 hover:text-accent"
              title={`View ${s} chart`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function IpoPanel() {
  const { data } = usePolling<BuzzPayload>("/api/buzz", 600_000);
  return (
    <Panel icon={<IconBell size={15} />} title="Upcoming IPOs" sub="next 45 days · Finnhub">
      {!data ? (
        <Skeletons />
      ) : data.iposNeedKey ? (
        <p className="text-xs text-muted">
          Add your free <code className="num">FINNHUB_API_KEY</code> to unlock the IPO calendar
          (same key as stocks).
        </p>
      ) : data.ipos.length === 0 ? (
        <p className="text-xs text-muted">No IPOs scheduled in the next 45 days.</p>
      ) : (
        <ul className="space-y-1">
          {data.ipos.map((ipo, i) => (
            <li key={ipo.symbol + i} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <span className="num shrink-0 rounded-md bg-surface2 px-1.5 py-0.5 text-[10px] text-accent">
                {formatCalendarDate(ipo.date)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">{ipo.name}</span>
              <span className="num hidden text-[10px] text-muted/70 sm:inline">{ipo.exchange}</span>
              <span className="num text-[11px] text-muted">{ipo.price}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
