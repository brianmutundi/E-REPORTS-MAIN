'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadSchoolLogo } from './actions'

export default function SchoolLogoUploader({ logoUrl, tenantId }: { logoUrl: string | null; tenantId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError('')
    setMessage('')
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (PNG, JPG, SVG, WebP).')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be 2 MB or smaller.')
      return
    }
    setBusy(true)
    setPreview(URL.createObjectURL(file))
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${tenantId}/logo-${Date.now()}.${ext}`
      const { data, error: upErr } = await supabase.storage.from('school-logos').upload(path, file, { upsert: true })
      if (upErr || !data) throw new Error(upErr?.message || 'Upload failed')
      const { data: meta } = supabase.storage.from('school-logos').getPublicUrl(data.path)
      const result = await uploadSchoolLogo(meta.publicUrl)
      if (!result.ok) throw new Error(result.error)
      setMessage('Logo uploaded and saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field-group" style={{ display: 'grid', gap: 8 }}>
      <span className="field-label">School logo</span>
      {preview || logoUrl ? (
        <img
          src={preview ?? logoUrl!}
          alt="School logo preview"
          style={{ width: 72, height: 72, objectFit: 'contain', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}
        />
      ) : null}
      <label className="btn secondary" style={{ display: 'inline-flex', width: 'max-content', cursor: 'pointer' }}>
        {busy ? 'Uploading…' : 'Upload logo'}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
      </label>
      <span className="muted" style={{ fontSize: 12 }}>PNG, JPG, SVG or WebP, up to 2 MB.</span>
      {error && <span style={{ color: '#c2410c', fontSize: 13 }}>{error}</span>}
      {message && <span style={{ color: '#047857', fontSize: 13 }}>{message}</span>}
    </div>
  )
}
