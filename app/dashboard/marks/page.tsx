import { getDashboardSession } from '@/lib/supabase/session'
import { getScopeGrades, getScopeSubjects, getScopeExams, getScopeStreams, verifyScope } from '@/lib/scope'
import Link from 'next/link'
import { AlertCircle, Sliders, Users, Upload } from 'lucide-react'
import SuccessToast from '@/components/SuccessToast'
import AssessmentFilterForm from '@/components/AssessmentFilterForm'
import MarksEntryGrid from '@/components/MarksEntryGrid'

export default async function MarksPage({ searchParams }: { searchParams: Promise<{ exam?: string; class?: string; subject?: string; stream?: string; error?: string; saved?: string; conflicts?: string }> }) {
  const params = await searchParams
  const { supabase, user, tenantId } = await getDashboardSession()

  if (!user) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-600">Please sign in to access assessment entry.</p>
      </div>
    )
  }

  if (!tenantId) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-600">No school is linked to this account.</p>
      </div>
    )
  }

  // Cascade level 1 — all grades (classes) for the tenant, always available.
  const { data: allClasses } = await supabase
    .from('classes')
    .select('id,name')
    .eq('tenant_id', tenantId)
    .order('name')
  const grades = allClasses ?? []

  // Cascade levels 2-5. Every lookup below depends only on the URL parameters
  // (class/exam/subject already selected), never on another lookup's result, so
  // they are fired in one parallel batch instead of a serial waterfall. Each
  // Supabase round-trip costs ~300ms of remote network latency, so parallelising
  // turns the previous ~5 sequential rounds into ~2 (this batch + learners).
  const gradeValid = Boolean(params.class && grades.some(g => g.id === params.class))
  const scopeReady = Boolean(params.class && params.exam && params.subject && gradeValid)

  let streams: Awaited<ReturnType<typeof getScopeStreams>> = []
  let exams: Awaited<ReturnType<typeof getScopeExams>> = []
  let subjects: Awaited<ReturnType<typeof getScopeSubjects>> = []
  let scopeValid = false

  ;[streams, exams, subjects, scopeValid] = await Promise.all([
    params.class ? getScopeStreams(supabase, tenantId, params.class) : Promise.resolve([]),
    params.class ? getScopeExams(supabase, tenantId, params.class) : Promise.resolve([]),
    params.class && params.exam ? getScopeSubjects(supabase, tenantId, params.exam, params.class) : Promise.resolve([]),
    scopeReady ? verifyScope(supabase, tenantId, params.exam!, params.class!, params.subject!) : Promise.resolve(false),
  ])

  const hasStreams = params.class ? streams.length > 0 : false
  const hasExams = params.class ? exams.length > 0 : false
  const hasSubjects = params.class && params.exam ? subjects.length > 0 : false

  // Cascade level 5 — learners + scores, only when a valid scope is selected.
  let students: { id: string; admission_no: string; full_name: string }[] = []
  let marks: { student_id: string; score: number; updated_at: string }[] = []

  if (scopeValid) {
    const studentQuery = supabase
      .from('students')
      .select('id,admission_no,full_name')
      .eq('tenant_id', tenantId)
      .eq('class_id', params.class!)
    if (params.stream) studentQuery.eq('stream_id', params.stream)
    const [{ data: s }, { data: m }] = await Promise.all([
      studentQuery.order('full_name'),
      supabase.from('marks').select('student_id,score,updated_at').eq('tenant_id', tenantId).eq('exam_id', params.exam!).eq('subject_id', params.subject!),
    ])
    students = s ?? []
    marks = m ?? []
  }

  const scoreRecord: Record<string, { score: number; updatedAt: string } | undefined> = {}
  for (const m of marks) {
    scoreRecord[m.student_id] = { score: m.score, updatedAt: m.updated_at }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="eyebrow">Assessment Entry</p>
          <h1 className="title">Marks Entry Matrix</h1>
        </div>

        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Link
            href="/dashboard/marks/import"
            className="btn secondary"
          >
            <Upload className="h-4 w-4" />
            <span>Bulk Import Results</span>
          </Link>
          <Link
            href="/dashboard/examinations/assign"
            className="btn secondary"
          >
            <Sliders className="h-4 w-4" />
            <span>Configure Exam Scope</span>
          </Link>
        </div>
      </div>

      {/* Alert Banners */}
      {params.error && (
        <div className="notice error">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="font-medium">{params.error}</span>
        </div>
      )}

      {params.saved && (
        <SuccessToast message="Marks saved successfully" />
      )}

      {params.conflicts && (() => {
        const conflictIds = new Set(params.conflicts!.split(','))
        const conflictNames = (students ?? []).filter(s => conflictIds.has(s.id)).map(s => s.full_name).filter(Boolean)
        return (
          <div className="notice warning">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <span className="font-medium">Some scores were changed by another user at the same time and were NOT overwritten.</span>
              {conflictNames.length > 0 && (
                <div className="mt-1 text-sm text-amber-800/90">
                  Reload the grid to see the latest values for: {conflictNames.join(', ')}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Filter Selection Panel */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm sm:p-5">
        <AssessmentFilterForm
          grades={grades}
          streams={streams}
          exams={exams}
          subjects={subjects}
          defaults={{ class: params.class, stream: params.stream, exam: params.exam, subject: params.subject }}
          hasStreams={hasStreams}
          hasExams={hasExams}
          hasSubjects={hasSubjects}
        />
      </div>

      {/* Scope empty states */}
      {params.class && !hasExams && (
        <div className="notice warning">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <span className="font-medium">No assessments are configured for this grade.</span>
            <p className="mt-0.5 text-sm font-normal">Assign assessments to this grade before recording scores.</p>
            <p className="pt-2">
              <Link
                href="/dashboard/examinations/assign"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-4"
              >
                Configure assessment scope →
              </Link>
            </p>
          </div>
        </div>
      )}

      {params.class && params.exam && !hasSubjects && (
        <div className="notice warning">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <span className="font-medium">No learning areas are configured for this grade and assessment.</span>
            <p className="mt-0.5 text-sm font-normal">Add learning areas for this grade under assessment scope before recording scores.</p>
            <p className="pt-2">
              <Link
                href="/dashboard/examinations/assign"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-4"
              >
                Configure assessment scope →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Marks Entry Card */}
      {params.exam && params.class && params.subject && gradeValid && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50">
            <div>
              <h2 className="text-base font-bold text-slate-900">Scores Entry Matrix</h2>
              <p className="text-xs text-slate-500 mt-0.5">Enter numerical scores between 0 and 100. Leave a cell blank to mark a learner absent (no score recorded).</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/60 text-slate-700 text-xs font-medium self-start sm:self-auto">
              <Users className="h-3.5 w-3.5 text-slate-500" />
              <span>{students.length} Enrolled</span>
            </span>
          </div>

          {!scopeValid && (
            <div className="p-5 bg-amber-50 border-b border-amber-200/80 flex items-center gap-3 text-sm text-amber-900">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <span className="font-medium">This grade and learning area are not configured for the selected assessment.</span>
            </div>
          )}

          {scopeValid && (
            <MarksEntryGrid
              examId={params.exam}
              classId={params.class}
              subjectId={params.subject}
              streamParam={params.stream}
              students={students}
              scoreMap={scoreRecord}
            />
          )}
        </div>
      )}
    </div>
  )
}