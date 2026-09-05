import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-emerald-600">404</p>
        <h1 className="mt-2 text-xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">The page you requested does not exist.</p>
        <Link href="/login" className="btn secondary mt-6">Go to sign in</Link>
      </div>
    </main>
  )
}
