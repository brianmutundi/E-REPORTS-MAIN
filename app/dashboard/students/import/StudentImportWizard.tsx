'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { Download, Upload, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'
import type { StudentImportPreview, StudentImportCommitResult, StudentPreviewRow, StudentRowError } from '@/lib/import/students'

type Step = 'upload' | 'preview' | 'done'

export default function StudentImportWizard({ classId, className }: { classId: string; className: string }) {
  const [step, setStep] = useState<Step>('upload')
  const [preview, setPreview] = useState<StudentImportPreview | null>(null)
  const [result, setResult] = useState<StudentImportCommitResult | null>(null)
  const [filename, setFilename] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setLoading(true)
    setFilename(file.name)
    try {
      const form = new FormData()
      form.set('mode', 'preview')
      form.set('class_id', classId)
      form.set('file', file)
      const res = await fetch('/api/import/students', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not read this file.'); return }
      setPreview(data)
      setStep('preview')
    } catch {
      setError('Could not read this file.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!preview) return
    setLoading(true)
    setError('')
    try {
      const rows: StudentPreviewRow[] = preview.rows
      const form = new FormData()
      form.set('mode', 'commit')
      form.set('class_id', classId)
      form.set('rows', JSON.stringify(rows))
      form.set('filename', filename)
      const res = await fetch('/api/import/students', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Import failed.'); return }
      setResult(data)
      setStep('done')
    } catch {
      setError('Import failed.')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setStep('upload'); setPreview(null); setResult(null); setFilename(''); setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="eyebrow">Bulk import</p>
          <h1 className="mt-0.5 truncate text-2xl font-bold tracking-tight text-slate-900">Import Students — {className}</h1>
          <p className="mt-1 text-sm text-slate-500">Every valid new student will be assigned to this selected class.</p>
        </div>
        <Link href={`/dashboard/students?class_id=${encodeURIComponent(classId)}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to Students
        </Link>
      </div>

      {error && <div className="notice error"><AlertCircle className="h-5 w-5 shrink-0" /><span>{error}</span></div>}

      {step === 'upload' && (
        <div className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-bold text-slate-900">1. Download the template</h2>
            <p className="mt-1 text-sm text-slate-500">Required columns only: <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">Adm No, Name</span>. The selected class is supplied by the system.</p>
            <a href="/api/import/students/template" download className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Download CSV template</a>
          </div>
          <div className="border-t border-slate-100 pt-5">
            <h2 className="text-base font-bold text-slate-900">2. Upload your file</h2>
            <p className="mt-1 text-sm text-slate-500">Nothing is written until you review and confirm the preview.</p>
            <label className="btn mt-3 w-full cursor-pointer sm:w-auto">
              <Upload className="h-4 w-4" /><span>{loading ? 'Reading…' : 'Choose CSV file'}</span>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="sr-only cursor-pointer" onChange={handleFileChange} disabled={loading} />
            </label>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Total rows" value={preview.summary.total} />
            <SummaryTile label="New" value={preview.summary.new} tone="emerald" />
            <SummaryTile label="Existing (skipped)" value={preview.summary.existing} tone="amber" />
            <SummaryTile label="Invalid" value={preview.summary.invalid} tone="rose" />
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Selected Class</div>
            <div className="mt-1 text-base font-bold text-emerald-950">{preview.selectedClass.name}</div>
            <div className="mt-1 text-sm text-emerald-800">This class is the source of truth for every imported student.</div>
          </div>

          {preview.errors.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-rose-50/50 p-4"><h2 className="text-sm font-bold text-rose-900">Row errors ({preview.errors.length})</h2></div>
              <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
                {preview.errors.map((err: StudentRowError, i: number) => <div key={i} className="px-4 py-2.5 text-sm text-slate-700"><span className="font-mono text-xs text-slate-500">Row {err.row}</span> · <span className="font-semibold">{err.field}</span> — {err.reason}</div>)}
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/50 p-4"><h2 className="text-base font-bold text-slate-900">Preview</h2><p className="mt-0.5 text-xs text-slate-500">Existing admission numbers remain unchanged and are skipped.</p></div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-2.5">Row</th><th className="px-4 py-2.5">Adm No</th><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Selected Class</th><th className="px-4 py-2.5">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{preview.rows.map((row: StudentPreviewRow) => <tr key={row.row}><td className="px-4 py-2 font-mono text-xs">{row.row}</td><td className="px-4 py-2">{row.admissionNo}</td><td className="px-4 py-2">{row.fullName}</td><td className="px-4 py-2">{row.className}</td><td className="px-4 py-2"><StatusBadge status={row.status} /></td></tr>)}</tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col justify-end gap-3 sm:flex-row"><button onClick={reset} className="btn secondary">Start over</button><button onClick={handleConfirm} disabled={loading || preview.summary.new === 0} className="btn disabled:pointer-events-none disabled:opacity-50">{loading ? 'Importing…' : `Confirm import (${preview.summary.new} new)`}</button></div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 text-center shadow-sm">
          <CheckCircle className="mx-auto h-10 w-10 text-emerald-600" />
          <h2 className="text-lg font-bold text-slate-900">Import complete</h2>
          <p className="text-sm text-slate-500">Class: {className}</p>
          <div className="mx-auto grid max-w-sm grid-cols-3 gap-3"><SummaryTile label="Created" value={result.created} tone="emerald" /><SummaryTile label="Skipped" value={result.skipped} tone="amber" /><SummaryTile label="Failed" value={result.failed} tone="rose" /></div>
          <div className="flex justify-center gap-3 pt-2"><button onClick={reset} className="btn secondary">Import more</button><Link href={`/dashboard/students?class_id=${encodeURIComponent(classId)}`} className="btn">View students</Link></div>
        </div>
      )}
    </div>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'amber' | 'rose' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : tone === 'rose' ? 'text-rose-700' : 'text-slate-900'
  return <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div><div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div></div>
}

function StatusBadge({ status }: { status: StudentPreviewRow['status'] }) {
  if (status === 'new') return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">New</span>
  if (status === 'existing') return <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/60 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Existing · skipped</span>
  return <span className="inline-flex items-center gap-1 rounded-full border border-rose-200/60 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">Error</span>
}
