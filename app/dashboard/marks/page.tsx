import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/supabase/session'
import { getScopeGrades, getScopeSubjects, getScopeExams, getScopeStreams, verifyScope } from '@/lib/scope'
import Link from 'next/link'
import {
  CheckCircle,
  AlertCircle,
  Sliders,
  Users,
  UserX,
  Upload
} from 'lucide-react'
import SuccessToast from '@/components/SuccessToast'
import AssessmentFilterForm from '@/components/AssessmentFilterForm'
import ScoreCellInput from '@/components/ScoreCellInput'
import SaveMarksButton from '@/components/SaveMarksButton'

async function saveMarks(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return

  const examId = String(formData.get('exam_id') || '')
  const classId = String(formData.get('class_id') || '')
  const subjectId = String(formData.get('subject_id') || '')

  if (!tenantId || !examId || !classId || !subjectId) return

  const target = `/dashboard/marks?exam=${examId}&class=${classId}&subject=${subjectId}`
  const scopeError = `${target}&error=Assign%20this%20grade%20and%20learning%20area%20to%20the%20assessment%20first`
  const scoreError = `${target}&error=Each%20score%20must%20be%20between%200%20and%20100`
  const saveError = `${target}&error=Could%20not%20save%20marks`

  const scoped = await verifyScope(supabase, tenantId, examId, classId, subjectId)

  if (!scoped) {
    redirect(scopeError)
  }

  const { data: students } = await supabase
    .from('students')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('class_id', classId)
    .order('full_name')

  // Each changed row carries the version it was loaded with
  // (mark updated_at, or empty when the learner was absent). The atomic RPC
  // applies each row only when that version still matches, so concurrent saves
  // of the same grid never silently overwrite each other's work.
  const studentIds: string[] = []
  const scores: (number | null)[] = []
  const baseUpdatedAts: (string | null)[] = []

  for (const student of students ?? []) {
    const raw = String(formData.get(`score_${student.id}`) ?? '').trim()
    const base = String(formData.get(`prev_${student.id}`) ?? '').trim() || null
    if (raw === '') {
      // Blank = absent. When this learner had no recorded score when the grid
      // loaded there is nothing to change; clearing an existing score is a real
      // change and is sent with its loaded version.
      if (base === null) continue
      studentIds.push(student.id)
      scores.push(null)
      baseUpdatedAts.push(base)
      continue
    }
    const score = Number(raw)
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      redirect(scoreError)
    }
    studentIds.push(student.id)
    scores.push(score)
    baseUpdatedAts.push(base)
  }

  if (!studentIds.length) redirect(`${target}&saved=1`)

  const { data: applied, error } = await supabase.rpc('save_marks_grid', {
    p_exam_id: examId,
    p_subject_id: subjectId,
    p_class_id: classId,
    p_student_ids: studentIds,
    p_scores: scores,
    p_base_updated_ats: baseUpdatedAts,
  })

  if (error) {
    // Pre-migration database: save_marks_grid does not exist yet, so keep the
    // previous atomic-upsert behaviour (database unique constraint still
    // prevents duplicates).
    if (error.code === 'PGRST202' || /cannot find the function|does not exist/i.test(error.message ?? '')) {
      const rows: { tenant_id: string; exam_id: string; student_id: string; subject_id: string; score: number; updated_at: string }[] = []
      const blankStudentIds: string[] = []
      for (const student of students ?? []) {
        const raw = String(formData.get(`score_${student.id}`) ?? '').trim()
        const base = String(formData.get(`prev_${student.id}`) ?? '').trim() || null
        if (raw === '') {
          if (base !== null) blankStudentIds.push(student.id)
          continue
        }
        const score = Number(raw)
        rows.push({
          tenant_id: tenantId,
          exam_id: examId,
          student_id: student.id,
          subject_id: subjectId,
          score,
          updated_at: new Date().toISOString()
        })
      }
      if (rows.length) {
        const { error: upsertError } = await supabase.from('marks').upsert(rows, { onConflict: 'tenant_id,exam_id,student_id,subject_id' })
        if (upsertError) redirect(saveError)
      }
      if (blankStudentIds.length) {
        const { error: clearError } = await supabase
          .from('marks')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('exam_id', examId)
          .eq('subject_id', subjectId)
          .in('student_id', blankStudentIds)
        if (clearError) redirect(saveError)
      }
      redirect(`${target}&saved=1`)
    }
    redirect(saveError)
  }

  const conflicts = (applied ?? []).filter((r: { student_id: string; status: string }) => r.status === 'conflict').map((r: { student_id: string; status: string }) => r.student_id)
  if (conflicts.length) {
    redirect(`${target}&saved=1&conflicts=${conflicts.join(',')}`)
  }

  revalidatePath('/dashboard/marks')
  revalidatePath('/dashboard/marks/import')
  revalidatePath('/dashboard/results')
  revalidatePath('/dashboard/reports')
  revalidatePath('/dashboard/analysis')
  redirect(`${target}&saved=1`)
}

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

  const scoreMap = new Map(marks.map(m => [m.student_id, { score: m.score, updatedAt: m.updated_at }]))

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
        <form action={saveMarks} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <input type="hidden" name="exam_id" value={params.exam} />
          <input type="hidden" name="class_id" value={params.class} />
          <input type="hidden" name="subject_id" value={params.subject} />

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
            <div className="table-rail">
              <table className="w-full text-left text-sm text-slate-600 min-w-[44rem]">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider font-semibold text-slate-500 sticky top-0 z-20">
                  <tr>
                    <th scope="col" className="sticky left-0 z-30 bg-slate-50 px-4 py-3.5 sm:px-6 w-24">Admission No</th>
                    <th scope="col" className="sticky left-24 z-30 bg-slate-50 px-4 py-3.5 sm:px-6 min-w-56">Student Name</th>
                    <th scope="col" className="px-4 py-3.5 sm:px-6 w-52 text-right">Score (/100)</th>
                    <th scope="col" className="px-4 py-3.5 sm:px-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.length ? (
                    students.map((s, i) => {
                      const existingScore = scoreMap.get(s.id)
                      const isEntered = existingScore !== undefined
                      return (
                        <tr key={s.id} className="group hover:bg-slate-50/80 transition-colors">
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/80 transition-colors px-4 py-4 sm:px-6 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">
                            {s.admission_no}
                          </td>
                          <td className="sticky left-24 z-10 bg-white group-hover:bg-slate-50/80 transition-colors px-4 py-4 sm:px-6 font-medium text-slate-900 whitespace-nowrap">
                            {s.full_name}
                          </td>
                          <td className="px-4 py-4 sm:px-6">
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
                            />
                          </td>
                          <td className="px-4 py-4 sm:px-6">
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
            </div>
          )}

          {scopeValid && students.length > 0 && (
            <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex justify-end">
              <SaveMarksButton />
            </div>
          )}
        </form>
      )}
    </div>
  )
}