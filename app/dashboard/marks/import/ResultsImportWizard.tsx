'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Download, Upload, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'
import type { ResultsImportPreview, ResultsImportCommitResult, ResultsPreviewRow } from '@/lib/import/results'

type Step = 'context' | 'upload' | 'preview' | 'done'
type Exam = { id: string; name: string; term: string | null; academic_year: number | null }
type Klass = { id: string; name: string }

export default function ResultsImportWizard({ exams, classes, classIdsByExam }: { exams: Exam[]; classes: Klass[]; classIdsByExam: Map<string, string[]> }) {
  const [step, setStep] = useState<Step>('context')
  const [examId, setExamId] = useState('')
  const [classId, setClassId] = useState('')
  const [preview, setPreview] = useState<ResultsImportPreview | null>(null)
  const [result, setResult] = useState<ResultsImportCommitResult | null>(null)
  const [filename, setFilename] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function proceedToUpload() {
    if (!examId || !classId) { setError('Choose an examination and grade first.'); return }
    setError('')
    setStep('upload')
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setLoading(true)
    setFilename(file.name)
    try {
      const form = new FormData()
      form.set('mode', 'preview')
      form.set('exam_id', examId)
      form.set('class_id', classId)
      form.set('file', file)
      const res = await fetch('/api/import/results', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not read this file.'); setLoading(false); return }
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
      const rows: ResultsPreviewRow[] = preview.rows.filter(r => r.status === 'ok')
      const form = new FormData()
      form.set('mode', 'commit')
      form.set('exam_id', examId)
      form.set('class_id', classId)
      form.set('rows', JSON.stringify(rows))
      form.set('filename', filename)
      const res = await fetch('/api/import/results', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Import failed.'); setLoading(false); return }
      setResult(data)
      setStep('done')
    } catch {
      setError('Import failed.')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setStep('context'); setPreview(null); setResult(null); setFilename(''); setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const scopedClasses = examId ? classes.filter(c => (classIdsByExam.get(examId) ?? []).includes(c.id)) : []
  const templateHref = examId && classId ? `/api/import/results/template?exam=${examId}&class=${classId}` : '#'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="eyebrow">Bulk import</p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">Import Scores</h1>
        </div>
        <Link href="/dashboard/marks" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to Assessment Scores
        </Link>
      </div>

      {error && (
        <div className="notice error">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {step === 'context' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">1. Choose the academic context</h2>
          <p className="text-sm text-slate-500">Scores are imported for one assessment and one grade at a time. The grade must already be assigned to the examination.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Examination</label>
              <select value={examId} onChange={e => { setExamId(e.target.value); setClassId('') }} className="w-full min-h-11 text-sm border-slate-300 rounded-xl p-2.5 bg-slate-50 border focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none">
                <option value="">Select exam</option>
                {exams.map(e => <option key={e.id} value={e.id}>{e.name}{e.term ? ` · ${e.term}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Grade</label>
              <select value={classId} onChange={e => setClassId(e.target.value)} disabled={!examId} className="w-full min-h-11 text-sm border-slate-300 rounded-xl p-2.5 bg-slate-50 border focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                <option value="">{!examId ? 'Select an exam first' : scopedClasses.length ? 'Select grade' : 'No grades assigned to this assessment'}</option>
                {scopedClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={proceedToUpload} className="btn">Continue</button>
        </div>
      )}

      {step === 'upload' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">2. Download the template</h2>
            <p className="text-sm text-slate-500 mt-1">Generated for the selected exam and grade — includes each enrolled student and the learning areas assigned to this examination.</p>
            <a href={templateHref} download className="mt-3 inline-flex items-center gap-2 min-h-11 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Download CSV template
            </a>
          </div>
          <div className="border-t border-slate-100 pt-5">
            <h2 className="text-base font-bold text-slate-900">3. Upload your file</h2>
            <p className="text-sm text-slate-500 mt-1">Learning-area columns can be in any order — they are matched by header, not position.</p>
            <label className="btn mt-3 w-full sm:w-auto cursor-pointer">
              <Upload className="h-4 w-4" />
              <span>{loading ? 'Reading…' : 'Choose CSV file'}</span>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="sr-only cursor-pointer" onChange={handleFileChange} disabled={loading} />
            </label>
          </div>
          <button onClick={() => setStep('context')} className="text-sm font-semibold text-slate-500 hover:text-slate-700">← Change examination or grade</button>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-4">
          {preview.unmatchedHeaders.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
              <strong>Unrecognized or duplicate columns:</strong> {preview.unmatchedHeaders.join(', ')}. These will be ignored — fix the header names to include them.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryTile label="Total rows" value={preview.summary.total} />
            <SummaryTile label="Ready to import" value={preview.summary.ok} tone="emerald" />
            <SummaryTile label="Invalid" value={preview.summary.invalid} tone="rose" />
          </div>

          {preview.errors.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-rose-50/50">
                <h2 className="text-sm font-bold text-rose-900">Row errors ({preview.errors.length})</h2>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                {preview.errors.map((err, i) => (
                  <div key={i} className="px-4 py-2.5 text-sm text-slate-700">
                    <span className="font-mono text-xs text-slate-500">Row {err.row}</span> · <span className="font-semibold">{err.field}</span> — {err.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-base font-bold text-slate-900">Preview</h2>
              <p className="text-xs text-slate-500 mt-0.5">Scores with an existing record for this exam are flagged and skipped — they are never overwritten.</p>
            </div>
            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider font-semibold text-slate-500 sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5">Row</th>
                    <th className="px-4 py-2.5">Adm No</th>
                    <th className="px-4 py-2.5">Name</th>
                    {preview.columnMapping.map(col => <th key={col.subjectId} className="px-4 py-2.5">{col.subjectName}</th>)}
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map(row => (
                    <tr key={row.row}>
                      <td className="px-4 py-2 font-mono text-xs">{row.row}</td>
                      <td className="px-4 py-2">{row.admissionNo}</td>
                      <td className="px-4 py-2">{row.nameInFile}{row.nameMismatch && <span className="ml-1 text-xs text-amber-600">(mismatch)</span>}</td>
                      {row.cells.map(cell => (
                        <td key={cell.subjectId} className={`px-4 py-2 ${cell.error ? 'text-amber-600' : ''}`}>
                          {cell.score === null ? '—' : cell.score}
                          {cell.error && <div className="text-[11px]">{cell.error}</div>}
                        </td>
                      ))}
                      <td className="px-4 py-2">{row.status === 'ok' ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">Ready</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200/60 px-2.5 py-0.5 rounded-full">Error</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <button onClick={reset} className="btn secondary">Start over</button>
            <button onClick={handleConfirm} disabled={loading || preview.summary.ok === 0} className="btn disabled:opacity-50 disabled:pointer-events-none">
              {loading ? 'Importing…' : `Confirm import (${preview.summary.ok} rows)`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4 text-center">
          <CheckCircle className="h-10 w-10 text-emerald-600 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Import complete</h2>
          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
            <SummaryTile label="Created" value={result.created} tone="emerald" />
            <SummaryTile label="Skipped" value={result.skipped} tone="amber" />
            <SummaryTile label="Failed" value={result.failed} tone="rose" />
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <button onClick={reset} className="btn secondary">Import more</button>
            <Link href="/dashboard/broadsheets" className="btn">View Broadsheet</Link>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'amber' | 'rose' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : tone === 'rose' ? 'text-rose-700' : 'text-slate-900'
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</div>
    </div>
  )
}
