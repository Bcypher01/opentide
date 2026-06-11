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
      {/* Session clock: lanes + liquidity strip + countdown chips */}
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
