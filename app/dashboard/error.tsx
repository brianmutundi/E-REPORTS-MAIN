'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto my-12 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Something went wrong</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          This screen could not be loaded. Your data is safe — try again, or return to the dashboard.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={reset} className="btn">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
        <Link href="/dashboard" className="btn secondary">
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}