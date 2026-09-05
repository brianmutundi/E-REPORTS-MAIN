'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function SuperAdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="mx-auto my-12 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <AlertTriangle className="h-8 w-8 text-rose-600" aria-hidden="true" />
      <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
      <p className="text-sm leading-6 text-slate-500">This Super Admin screen could not be loaded.</p>
      <div className="flex gap-2">
        <button type="button" onClick={reset} className="btn"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</button>
        <Link href="/super-admin/dashboard" className="btn secondary">Dashboard</Link>
      </div>
    </div>
  )
}
