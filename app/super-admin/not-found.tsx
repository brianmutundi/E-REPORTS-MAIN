import Link from 'next/link'

export default function SuperAdminNotFound() {
  return (
    <div className="mx-auto my-12 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-emerald-600">404</p>
      <h1 className="mt-2 text-lg font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">The requested Super Admin page does not exist.</p>
      <Link href="/super-admin/dashboard" className="btn secondary mt-6">Back to dashboard</Link>
    </div>
  )
}
