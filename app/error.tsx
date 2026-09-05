'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-10 w-10 text-rose-600" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">We could not load this page. Your saved data is not changed by this error.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={reset} className="btn"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</button>
          <Link href="/login" className="btn secondary">Sign in</Link>
        </div>
      </div>
    </main>
  )
}
