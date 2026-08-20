/**
 * Content-shaped loading state for the Pulse page — mirrors the risk dial,
 * session-stats and heatmap cards so nothing jumps when data lands.
 */

function SectionHead({ subWidth = "w-40" }: { subWidth?: string }) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <div className="skeleton h-4 w-24 rounded" />
      <div className={`skeleton h-3 rounded ${subWidth}`} />
    </div>
  );
}

export default function PulseSkeleton() {
  return (
    <div className="mt-5 space-y-5">
      {/* Risk dial */}
      <section>
        <SectionHead subWidth="w-44" />
        <div className="module p-4">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
            {/* semicircle gauge */}
            <div className="skeleton h-[104px] w-[200px] shrink-0 rounded-t-full" />
            <div className="min-w-0 flex-1">
              <div className="skeleton h-3.5 w-full rounded" />
              <div className="skeleton mt-2 h-3.5 w-4/5 rounded" />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton h-6 w-28 rounded-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Session stats */}
      <section>
        <SectionHead subWidth="w-48" />
        <div className="module p-3">
          <div className="rounded-xl bg-surface2 p-3.5">
            <div className="flex justify-between">
              <div className="skeleton h-3.5 w-28 rounded" />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
            <div className="skeleton mt-2.5 h-3.5 w-3/4 rounded" />
            <div className="skeleton mt-3 h-2 w-full rounded-full" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg bg-surface2/50 p-2.5">
                <div className="skeleton h-3 w-14 rounded" />
                <div className="skeleton mt-1.5 h-3 w-16 rounded" />
                <div className="skeleton mt-1.5 h-3 w-12 rounded" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Heatmap */}
      <section>
        <SectionHead subWidth="w-36" />
        <div className="module p-3">
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[5/4] rounded-lg" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
