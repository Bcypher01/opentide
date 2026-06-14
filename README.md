# Opentide

> Every market, every session. A free, real-time market companion that knows what time it is — in every market.

Forex, crypto and US stocks on one full-width surface, organized around the thing no other free tool gets right: **market sessions**. A live session clock shows which markets are awake and where the high-liquidity overlaps are; a free multi-source newswire is tagged to the exact assets it affects; and every asset, mover, ticker entry or headline tag opens a full TradingView chart in one tap.

**The surface:** ticker tape → session clock → top movers → three columns: markets & watchlist | chart (with "In the news" suggestions) | newswire.

## Quick start

```bash
npm install
cp .env.example .env.local   # then add your Finnhub key (see below)
npm run dev                  # http://localhost:3000
```

The app works immediately with **zero keys** — crypto (Binance) and forex (Frankfurter/ECB) need no credentials. Stocks need one free key:

1. Register at [finnhub.io/register](https://finnhub.io/register) (free, 60 calls/min)
2. Copy your API key into `.env.local`:
   ```
   FINNHUB_API_KEY=your_key_here
   ```
3. Restart `npm run dev`

## Deploy (free, ~3 minutes)

1. Push this folder to a GitHub repo
2. Import the repo at [vercel.com/new](https://vercel.com/new) (free Hobby plan)
3. Add the `FINNHUB_API_KEY` environment variable in the Vercel project settings
4. Deploy — done. The PWA manifest makes it installable from the browser on mobile.

## Data sources (all $0)

| Market | Source | Freshness |
|---|---|---|
| Crypto | Binance REST (server, cached 30s, shared by all users) + Binance WebSocket (browser-direct live ticks) | Real-time |
| Forex | Frankfurter (ECB reference rates, no key) | Daily — the UI labels this honestly |
| Stocks | Finnhub free tier | ~Real-time US quotes, cached 60s |
| News | RSS: CoinDesk, Cointelegraph, CNBC Markets, MarketWatch, FXStreet (no keys, parsed dependency-free, cached 10 min) | ~Real-time |
| Economic calendar | ForexFactory widget feed (unofficial, no key, cached 1h) + static FOMC/CPI/NFP/PPI anchors from federalreserve.gov & bls.gov (regenerated yearly) | 2-week window + year-ahead anchors |
| Charts | TradingView free embed widget | Real-time |

API keys live server-side only (route handlers). Next.js fetch caching deduplicates upstream calls, so 1,000 visitors cost the same upstream quota as one.

## Architecture

```
src/
├── app/
│   ├── api/{crypto,forex,stocks}/route.ts   # cached proxy routes
│   ├── layout.tsx · page.tsx · globals.css  # shell + design tokens
├── components/
│   ├── Dashboard.tsx     # orchestration: polling, filters, watchlist
│   ├── SessionClock.tsx  # the signature element
│   └── PriceRow.tsx      # tick-flash price rows
└── lib/
    ├── sessions.ts       # DST-aware session math (no deps)
    ├── assets.ts         # asset universe + session tags
    ├── hooks.ts          # polling + Binance WS + clock
    ├── store.ts          # zustand watchlist (localStorage)
    └── format.ts
```

## Design principles

Calm intensity: dark-first (`#0A0B0D`), the teal accent `#00D4AA` is reserved for "live/now", price ticks flash a soft decaying wash (never blinking text), all numbers use tabular figures so nothing jitters, skeletons instead of spinners, honest "updated Xs ago" timestamps, and `prefers-reduced-motion` is respected throughout.

## Roadmap

- **Done** — news engine (RSS, tagged by asset), top movers, TradingView charts, news-driven chart suggestions, ticker tape, market pulse strip (crypto + stocks Fear & Greed, BTC dominance, DXY, US yields), derivatives pulse (funding extremes, open interest), "while you were away" return-visit diff, economic calendar on the session clock (timeline markers, countdown chips, beginner explainers), daily briefing ("your day in 60 seconds"), watchlist daily digest, session alerts/push (PWA), cross-market risk dial (risk-on/risk-off composite), market heatmaps (crypto + stocks 24h grids, forex currency-strength meter), session statistics engine (typical range/move per session vs today, crypto)
- **Next** — Marketaux as a second news source, accounts + sync, and the remaining "moat" ideas (trader-profile presets, post-close journal)

---

Not investment advice. Forex rates are ECB daily reference rates, not tradeable quotes.
