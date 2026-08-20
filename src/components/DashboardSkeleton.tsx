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
    <div className="bg-surface p-3.5">
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
      {/* Hero — permanent session header, full bleed with the tide gauge down
          the left edge. Sized to the real block so the cold load Lighthouse
          measures doesn't shift when the skeleton swaps for the dashboard. */}
      <div className="hero-block relative -mx-4 mt-2 overflow-hidden lg:-mx-6">
        <div className="tide-gauge" aria-hidden="true">
          <div className="tide-gauge-fill" style={{ height: "40%" }} />
        </div>
        <div className="pr-5 pt-7 sm:pt-8 lg:pr-10">
          <div className="skeleton h-2.5 w-40 rounded" />
          <div className="skeleton mt-3.5 h-8 w-full max-w-[20ch] rounded-md sm:h-9" />
          <div className="skeleton mt-2 h-8 w-full max-w-[12ch] rounded-md sm:h-9" />
          <div className="skeleton mt-3.5 h-3.5 w-full max-w-[52ch] rounded" />
          <div className="mt-5 flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-[30px] w-36 rounded-full" />
            ))}
          </div>
          <div className="skeleton mt-5 h-3.5 w-44 rounded" />
        </div>
        <div className="skeleton ml-[calc(var(--hero-gutter)*-1)] mt-4 h-[104px] rounded-none sm:h-[124px]" />
      </div>

      {/* Shelf — one tab row, so the panel below it doesn't jump on mount. */}
      <div className="shelf mt-7">
        {["w-16", "w-24", "w-24", "w-24", "w-20"].map((w, i) => (
          <div key={i} className={`skeleton mb-3 h-3.5 rounded ${w}`} />
        ))}
      </div>

      {/* Daily briefing — reserve the *expanded* card. On a first visit of the
          day the real briefing is expanded, so holding that space stops the
          mount swap from pushing everything below it down. */}
      <div className="module mt-5 p-4 sm:p-5">
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
          <section className="module p-2">
            <div className="skeleton mx-3 mb-2 mt-2 h-3 w-20 rounded" />
            <PriceRowSkeleton />
            <PriceRowSkeleton />
          </section>

          <section className="module">
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
          <section className="module">
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
          <section className="module xl:h-[604px] xl:overflow-hidden">
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
