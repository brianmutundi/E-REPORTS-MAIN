import Link from 'next/link'

export default function DashboardNotFound() {
  return (
    <div className="mx-auto my-12 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-emerald-600">404</p>
      <h1 className="mt-2 text-lg font-bold text-slate-900">Dashboard page not found</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">The requested dashboard page is unavailable.</p>
      <Link href="/dashboard" className="btn secondary mt-6">Back to dashboard</Link>
    </div>
  )
}
