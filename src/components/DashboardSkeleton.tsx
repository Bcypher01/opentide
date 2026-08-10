/**
 * Content-shaped loading state for the dashboard. Mirrors the real layout —
 * session clock, movers grid, watchlist/markets | chart | newswire — so
 * nothing jumps when data lands.
 */

export function PriceRowSkeleton() {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-3 py-2">
      <div className="skeleton h-5 w-5 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <div className="skeleton h-3.5 w-16 rounded" />
        <div className="skeleton mt-1.5 h-3 w-24 rounded" />
      </div>
      <div className="flex flex-col items-end">
        <div className="skeleton h-4 w-20 rounded" />
        <div className="skeleton mt-1.5 h-3 w-12 rounded" />
      </div>
    </div>
  );
}

export function MoverCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-1">
        <div className="skeleton h-3 w-10 rounded" />
        <div className="skeleton h-3 w-14 rounded" />
      </div>
      <div className="skeleton mt-2 h-4 w-20 rounded" />
      <div className="skeleton mt-1.5 h-3 w-full rounded" />
    </div>
  );
}

export function NewsItemSkeleton({ titleWidth = "w-2/3" }: { titleWidth?: string }) {
  return (
    <div className="px-2 py-2.5">
      <div className="skeleton h-3.5 w-full rounded" />
      <div className={`skeleton mt-1.5 h-3.5 rounded ${titleWidth}`} />
      <div className="mt-2 flex items-center gap-2">
        <div className="skeleton h-1.5 w-1.5 rounded-full" />
        <div className="skeleton h-3 w-14 rounded" />
        <div className="skeleton h-3 w-8 rounded" />
        <div className="skeleton h-4 w-12 rounded-full" />
      </div>
    </div>
  );
}

const NEWS_WIDTHS = ["w-2/3", "w-5/6", "w-1/2", "w-3/4"];

export default function DashboardSkeleton() {
  return (
    <div>
      {/* Session clock: first section users should see, even during hydration. */}
      <div className="mt-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="space-y-1.5 py-1">
          <div className="skeleton ml-0 h-7 w-[55%] rounded-md" />
          <div className="skeleton ml-[28%] h-7 w-[42%] rounded-md" />
          <div className="skeleton ml-[54%] h-7 w-[40%] rounded-md" />
          <div className="skeleton h-7 w-full rounded-md" />
        </div>
        <div className="skeleton mt-1 h-1.5 w-full rounded" />
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-[34px] w-44 rounded-full" />
          ))}
        </div>
      </div>

      {/* Hero — first-visit intro card (mirrors Hero.tsx). Sized to the real
          card so the new-visitor cold load — the case Lighthouse measures —
          doesn't shift when the skeleton swaps for the real dashboard.
          Returning visitors (heroDismissed) briefly see this collapse away. */}
      <div className="mt-4 rounded-2xl border border-border bg-surface px-5 py-6 sm:px-8 sm:py-8">
        <div className="skeleton h-3 w-56 rounded" />
        <div className="skeleton mt-3 h-7 w-full max-w-2xl rounded-md sm:h-8" />
        <div className="skeleton mt-2 h-7 w-3/4 max-w-xl rounded-md sm:h-8" />
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-bg/40 p-4">
              <div className="skeleton h-[18px] w-[18px] rounded" />
              <div className="skeleton mt-2 h-3.5 w-28 rounded" />
              <div className="skeleton mt-2 h-3 w-full rounded" />
              <div className="skeleton mt-1.5 h-3 w-5/6 rounded" />
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="skeleton h-[42px] w-48 rounded-lg" />
          <div className="skeleton h-[42px] w-44 rounded-lg" />
        </div>
      </div>

      {/* Daily briefing — reserve the *expanded* card. On a first visit of the
          day the real briefing is expanded, so holding that space stops the
          mount swap from pushing everything below it down. */}
      <div className="mt-4 rounded-2xl border border-accent/25 bg-surface p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <div className="skeleton h-8 w-8 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <div className="skeleton h-4 w-44 rounded" />
            <div className="skeleton mt-1.5 h-3 w-28 rounded" />
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            <div className="skeleton h-[32px] w-20 rounded-full" />
          </div>
        </div>
        <div className="mt-4 grid gap-x-8 gap-y-1 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-2 py-2">
              <div className="skeleton h-6 w-6 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="skeleton h-3.5 w-full rounded" />
                <div className="skeleton mt-1.5 h-3.5 w-2/3 rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-border/60 px-2 pt-2.5">
          <div className="skeleton h-2.5 w-3/4 rounded" />
        </div>
      </div>

      {/* Market pulse strip — label + chip row (matches PulseStripSkeleton) */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center gap-2 px-0.5">
          <div className="skeleton h-2.5 w-20 rounded" />
        </div>
        <div className="scrollbar-none flex items-center gap-2 overflow-x-auto">
          {[36, 28, 32, 40, 30].map((w, i) => (
            <div key={i} className="skeleton h-[34px] rounded-full" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
      </div>

      {/* Movers */}
      <div className="mt-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="skeleton h-4 w-20 rounded" />
          <div className="skeleton h-3 w-48 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <MoverCardSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Derivatives pulse — label + pill row (matches DerivsPanelSkeleton).
          Reserved so the strip doesn't inject height between movers and the
          main grid on the mount swap. */}
      <div className="mt-5">
        <div className="mb-2 flex items-baseline gap-3">
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton h-3 w-48 rounded" />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {[112, 120, 104, 132, 128, 120].map((w, i) => (
            <div key={i} className="skeleton h-[34px] shrink-0 rounded-full" style={{ width: `${w}px` }} />
          ))}
        </div>
      </div>

      {/* Main 3-column shell */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* LEFT — watchlist + markets */}
        <div className="space-y-5 lg:col-span-4 xl:col-span-3">
          <section className="rounded-2xl border border-border bg-surface p-2">
            <div className="skeleton mx-3 mb-2 mt-2 h-3 w-20 rounded" />
            <PriceRowSkeleton />
            <PriceRowSkeleton />
          </section>

          <section className="rounded-2xl border border-border bg-surface">
            <div className="flex flex-wrap gap-2 border-b border-border p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-[32px] w-16 rounded-full" />
              ))}
            </div>
            <div className="p-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <PriceRowSkeleton key={i} />
              ))}
            </div>
          </section>
        </div>

        {/* CENTER — chart panel */}
        <div className="lg:col-span-8 xl:col-span-6">
          <section className="rounded-2xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <div className="skeleton h-4 w-24 rounded" />
                <div className="skeleton mt-1.5 h-3 w-32 rounded" />
              </div>
              <div className="flex flex-col items-end">
                <div className="skeleton h-5 w-24 rounded" />
                <div className="skeleton mt-1.5 h-3 w-14 rounded" />
              </div>
            </div>
            <div className="skeleton m-3 h-[420px] rounded-xl" />
          </section>
        </div>

        {/* RIGHT — newswire */}
        <div className="lg:col-span-12 xl:col-span-3">
          <section className="rounded-2xl border border-border bg-surface xl:h-[604px] xl:overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-[28px] w-40 rounded-lg" />
            </div>
            <div className="p-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <NewsItemSkeleton key={i} titleWidth={NEWS_WIDTHS[i % NEWS_WIDTHS.length]} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
