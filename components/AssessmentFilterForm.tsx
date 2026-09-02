'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { Filter } from 'lucide-react'

interface AssessmentFilterFormProps {
  grades: { id: string; name: string }[]
  streams: { id: string; name: string }[]
  exams: { id: string; name: string }[]
  subjects: { subjectId: string; subjectName: string; code: string | null }[]
  defaults: { class?: string; stream?: string; exam?: string; subject?: string }
  hasStreams: boolean
  hasExams: boolean
  hasSubjects: boolean
}

/**
 * Marks entry filter with proper cascading:
 *   Grade → Stream → Assessment → Learning Area
 *
 * Each select auto-submits and clears every downstream selection that is no
 * longer valid. The server re-renders the page with only the valid options
 * for the current parent context, so the client never sees stale options.
 */
export default function AssessmentFilterForm({
  grades,
  streams,
  exams,
  subjects,
  defaults,
  hasStreams,
  hasExams,
  hasSubjects,
}: AssessmentFilterFormProps) {
  const router = useRouter()

  /** Build a new URL, clearing every child of the changed parent. */
  const cascade = useCallback(
    (updated: Record<string, string>) => {
      const next = new URLSearchParams()
      if (updated.class) next.set('class', updated.class)
      if (updated.stream) next.set('stream', updated.stream)
      if (updated.exam) next.set('exam', updated.exam)
      if (updated.subject) next.set('subject', updated.subject)
      router.push(`/dashboard/marks?${next.toString()}`)
    },
    [router],
  )

  return (
    <form method="get" className="grid grid-cols-1 gap-4 md:grid-cols-5 md:items-end">
      {/* 1. Grade — first in the cascade */}
      <div>
        <label htmlFor="filter-grade" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
          Grade
        </label>
        <select
          id="filter-grade"
          name="class"
          defaultValue={defaults.class ?? ''}
          required
          onChange={(e) => {
            const classId = e.target.value
            cascade({ class: classId })
          }}
          className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Select grade</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      {/* 2. Stream — depends on Grade */}
      <div>
        <label htmlFor="filter-stream" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
          Stream
        </label>
        <select
          id="filter-stream"
          name="stream"
          defaultValue={defaults.stream ?? ''}
          disabled={!defaults.class || !hasStreams}
          onChange={(e) => {
            const streamId = e.target.value
            cascade({ class: defaults.class ?? '', stream: streamId, exam: defaults.exam ?? '', subject: '' })
          }}
          className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">
            {!defaults.class ? 'Select grade first' : hasStreams ? 'All streams' : 'No streams'}
          </option>
          {hasStreams && streams.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* 3. Assessment — depends on Grade */}
      <div>
        <label htmlFor="filter-exam" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
          Assessment
        </label>
        <select
          id="filter-exam"
          name="exam"
          defaultValue={defaults.exam ?? ''}
          required
          disabled={!defaults.class}
          onChange={(e) => {
            const examId = e.target.value
            cascade({ class: defaults.class ?? '', stream: defaults.stream ?? '', exam: examId, subject: '' })
          }}
          className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">
            {!defaults.class ? 'Select grade first' : hasExams ? 'Select assessment' : 'No assessments'}
          </option>
          {hasExams && exams.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {/* 4. Learning Area — depends on Grade + Assessment */}
      <div>
        <label htmlFor="filter-subject" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
          Learning Area
        </label>
        <select
          id="filter-subject"
          name="subject"
          defaultValue={defaults.subject ?? ''}
          required={hasSubjects}
          disabled={!defaults.class || !defaults.exam}
          onChange={(e) => {
            const subjectId = e.target.value
            cascade({ class: defaults.class ?? '', stream: defaults.stream ?? '', exam: defaults.exam ?? '', subject: subjectId })
          }}
          className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">
            {!defaults.class || !defaults.exam ? 'Select grade and assessment' : hasSubjects ? 'Select learning area' : 'No learning areas'}
          </option>
          {hasSubjects && subjects.map((s) => (
            <option key={s.subjectId} value={s.subjectId}>{s.subjectName}{s.code ? ` (${s.code})` : ''}</option>
          ))}
        </select>
      </div>

      <div>
        <button type="submit" className="btn w-full md:w-auto">
          <Filter className="h-4 w-4" aria-hidden="true" />
          <span>Load students</span>
        </button>
      </div>
    </form>
  )
}
