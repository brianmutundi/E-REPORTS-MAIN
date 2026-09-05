'use client'

import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">E-REPORTS is temporarily unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">The application hit an unexpected error.</p>
            <button type="button" onClick={reset} className="btn mt-6"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</button>
          </div>
        </main>
      </body>
    </html>
  )
}
