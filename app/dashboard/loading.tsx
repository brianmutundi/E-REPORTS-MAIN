export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8" aria-busy="true" aria-label="Loading dashboard">
      {/* Page header skeleton */}
      <div className="space-y-3 border-b border-slate-200 pb-5">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-4 w-80 max-w-full" />
      </div>

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <div className="skeleton h-3.5 w-24" />
            <div className="skeleton mt-4 h-8 w-14" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm" aria-hidden="true">
        <div className="skeleton h-5 w-40" />
        <div className="mt-5 space-y-3">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-11/12" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      </div>
    </div>
  )
}