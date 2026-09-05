'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, CheckCircle, Clock, Loader2, Save, UserX } from 'lucide-react'
import { saveMarksGrid, type SaveMarksGridResult } from '@/app/dashboard/marks/actions'
import ScoreCellInput from '@/components/ScoreCellInput'

interface MarksEntryGridProps {
  examId: string
  classId: string
  subjectId: string
  streamParam?: string
  students: { id: string; admission_no: string; full_name: string }[]
  scoreMap: Record<string, { score: number; updatedAt: string } | undefined>
}

type SaveStatus = 'idle' | 'saving' | 'error' | 'session'

/**
 * Client-side marks grid. Saves through saveMarksGrid (which returns a result
 * instead of redirecting), so a failing save NEVER clears the entered scores:
 * validation, scope, session and network problems all surface as a banner here
 * with every cell still intact.
 */
export default function MarksEntryGrid({ examId, classId, subjectId, streamParam, students, scoreMap }: MarksEntryGridProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [message, setMessage] = useState('')
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)

  const markDirty = () => {
    dirtyRef.current = true
    setDirty(true)
  }

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setStatus('saving')
    setMessage('')

    const form = event.currentTarget
    const entries = students.map((s) => ({
      studentId: s.id,
      raw: String((form.elements.namedItem(`score_${s.id}`) as HTMLInputElement | null)?.value ?? ''),
      prev: String((form.elements.namedItem(`prev_${s.id}`) as HTMLInputElement | null)?.value ?? ''),
    }))

    let result: SaveMarksGridResult
    try {
      result = await saveMarksGrid(examId, classId, subjectId, entries)
    } catch {
      savingRef.current = false
      setStatus('error')
      setMessage('Could not reach the server. Check your connection and try again — your entries are still here.')
      return
    }
    savingRef.current = false

    if (!result.ok) {
      setStatus(result.kind === 'session' ? 'session' : 'error')
      setMessage(result.message)
      return
    }

    dirtyRef.current = false
    setDirty(false)
    setStatus('idle')

    const params = new URLSearchParams({ exam: examId, class: classId, subject: subjectId })
    if (streamParam) params.set('stream', streamParam)
    if (result.conflicts.length) params.set('conflicts', result.conflicts.join(','))
    params.set('saved', Date.now().toString())
    router.replace(`/dashboard/marks?${params.toString()}`)
  }

  return (
    <>
      <div className="table-rail">
        <form ref={formRef} onSubmit={handleSubmit} autoComplete="off">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider font-semibold text-slate-500 sticky top-0 z-20">
              <tr>
                <th scope="col" className="md:sticky md:left-0 z-30 bg-slate-50 px-3 py-3 sm:px-4 sm:py-3.5 lg:px-6 w-14 sm:w-24">Admission No</th>
                <th scope="col" className="md:sticky md:left-14 sm:md:left-24 z-30 bg-slate-50 px-3 py-3 sm:px-4 sm:py-3.5 lg:px-6 min-w-0 sm:min-w-56">Student Name</th>
                <th scope="col" className="px-3 py-3 sm:px-4 sm:py-3.5 lg:px-6 min-w-28 sm:w-52 text-right">Score (/100)</th>
                <th scope="col" className="px-3 py-3 sm:px-4 sm:py-3.5 lg:px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.length ? (
                students.map((s, i) => {
                  const existingScore = scoreMap[s.id]
                  const isEntered = existingScore !== undefined
                  return (
                    <tr key={s.id} className="group hover:bg-slate-50/80 transition-colors">
                      <td className="md:sticky md:left-0 z-10 bg-white group-hover:bg-slate-50/80 transition-colors px-3 py-3 sm:px-4 sm:py-4 lg:px-6 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap w-14 sm:w-24">
                        {s.admission_no}
                      </td>
                      <td className="md:sticky md:left-14 sm:md:left-24 z-10 bg-white group-hover:bg-slate-50/80 transition-colors px-3 py-3 sm:px-4 sm:py-4 lg:px-6 font-medium text-slate-900 whitespace-nowrap min-w-0 sm:min-w-56">
                        {s.full_name}
                      </td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 min-w-28 sm:min-w-0">
                        <input
                          type="hidden"
                          name={`prev_${s.id}`}
                          value={existingScore ? existingScore.updatedAt : ''}
                        />
                        <ScoreCellInput
                          name={`score_${s.id}`}
                          defaultValue={existingScore ? existingScore.score : ''}
                          index={i}
                          ariaLabel={`Score for ${s.full_name}`}
                          onChange={markDirty}
                        />
                      </td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6">
                        {isEntered ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
                            <CheckCircle className="h-3 w-3" /> Recorded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-full">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UserX className="h-8 w-8 text-slate-300" />
                      <p className="text-sm font-medium">No learners are available for this grade.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {students.length > 0 && (
            <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                {status === 'saving' && (
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving marks…
                  </p>
                )}
                {status === 'error' && (
                  <div className="notice error" role="alert">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span className="font-medium">{message}</span>
                  </div>
                )}
                {status === 'session' && (
                  <div className="notice warning" role="alert">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <div>
                      <span className="font-medium">{message}</span>
                      <p className="pt-1">
                        <Link href="/login" className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 underline underline-offset-4 hover:text-amber-950">
                          Sign in again →
                        </Link>
                      </p>
                    </div>
                  </div>
                )}
                {status === 'idle' && dirty && (
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-amber-700">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    Unsaved changes
                  </p>
                )}
                {status === 'idle' && !dirty && (
                  <p className="text-xs text-slate-400">Blank cells are treated as absent. Enter moves to the next cell.</p>
                )}
              </div>

              <button
                type="submit"
                className="btn shrink-0"
                disabled={status === 'saving'}
                aria-busy={status === 'saving'}
              >
                {status === 'saving' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {status === 'saving' ? 'Saving…' : 'Save marks'}
              </button>
            </div>
          )}
        </form>
      </div>
    </>
  )
}