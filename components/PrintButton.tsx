'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

function getFilename(contentDisposition: string | null) {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i)
  return match?.[1]?.trim() || 'assessment-report.pdf'
}

export default function PrintButton({ href, label = 'Generate PDF' }: { href: string; label?: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function downloadPdf() {
    if (loading || href === '#') return
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(href, { credentials: 'include', cache: 'no-store' })
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

      if (!response.ok || !contentType.includes('application/pdf')) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error || 'Unable to generate the assessment report PDF.')
      }

      const blob = await response.blob()
      const signatureBytes = new Uint8Array(await blob.slice(0, 5).arrayBuffer())
      const signature = new TextDecoder().decode(signatureBytes)
      if (signature !== '%PDF-') throw new Error('The server returned an invalid PDF.')

      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = getFilename(response.headers.get('content-disposition'))
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to generate the assessment report PDF.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <button className="btn" type="button" onClick={downloadPdf} disabled={loading} aria-busy={loading}>
        <Download size={17} />{loading ? 'Generating PDF…' : label}
      </button>
      {error && <span role="alert" className="notice error" style={{ margin: 0, maxWidth: 420 }}>{error}</span>}
    </div>
  )
}
