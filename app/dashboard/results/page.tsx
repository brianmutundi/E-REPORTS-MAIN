import Link from 'next/link'
import { getExamResults } from '@/lib/results'
import { getTenantGradingScale } from '@/lib/grading'
import { getDashboardSession } from '@/lib/supabase/session'
import { getScopeStreams, getScopeExams, type ScopeStream, type ScopeExam } from '@/lib/scope'
import CascadingFilterBar from '@/components/CascadingFilterBar'
import { 
  Award, 
  FileText, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft,
  GraduationCap,
  FileSpreadsheet,
  FileDown
} from 'lucide-react'

export default async function ResultsPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ exam?: string; class?: string; student?: string; stream?: string }> 
}) {
  const params = await searchParams
  const { supabase, user, tenantId } = await getDashboardSession()

  if (!user) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-600">Please sign in to view computed results.</p>
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

  const [{ data: classes }, { data: tenant }, scale, streams, exams] = await Promise.all([
    supabase
      .from('classes')
      .select('id,name')
      .eq('tenant_id', tenantId)
      .order('name'),
    supabase
      .from('tenants')
      .select('name,code,logo_url,address')
      .eq('id', tenantId)
      .maybeSingle(),
    getTenantGradingScale(tenantId),
    params.class ? getScopeStreams(supabase, tenantId, params.class) : Promise.resolve([] as ScopeStream[]),
    params.class ? getScopeExams(supabase, tenantId, params.class) : Promise.resolve([] as ScopeExam[]),
  ])

  const hasStreams = streams.length > 0
  const hasExams = exams.length > 0
  const gradeValid = Boolean(params.class && (classes ?? []).some(c => c.id === params.class))

  const exam = exams.find(e => e.id === params.exam)
  const cls = (classes ?? []).find(c => c.id === params.class)

  const { results, columns } = params.exam && params.class && gradeValid ? await getExamResults(params.exam, params.class, params.stream) : { results: [] as Awaited<ReturnType<typeof getExamResults>>['results'], columns: [] as Awaited<ReturnType<typeof getExamResults>>['columns'] }
  const hasStreamData = results.some(r => Boolean(r.streamName))
  const selected = results.find(r => r.studentId === params.student)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="eyebrow">Computed Analytics</p>
          <h1 className="title">Examination Results</h1>
          <p className="muted mt-1">
            Fully assessed students are ranked automatically. Incomplete entries remain visible without ranking.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Link 
            href="/dashboard/marks" 
            className="btn secondary"
          >
            Marks Entry
          </Link>
          <Link 
            href="/dashboard/reports" 
            className="btn"
          >
            <FileText className="h-4 w-4" />
            <span>Report Forms</span>
          </Link>
        </div>
      </div>

      {/* Filter Selection Panel — Grade → Stream → Assessment */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <CascadingFilterBar
          basePath="/dashboard/results"
          submitLabel="View Results"
          values={{ class: params.class, stream: params.stream, exam: params.exam }}
          fields={[
            {
              name: 'class',
              label: 'Grade',
              placeholder: 'Select grade',
              required: true,
              clears: ['stream', 'exam'],
              options: (classes ?? []).map(c => ({ value: c.id, label: c.name })),
            },
            {
              name: 'stream',
              label: 'Stream',
              placeholder: !params.class ? 'Select grade first' : hasStreams ? 'All streams' : 'No streams',
              disabled: !hasStreams,
              clears: ['exam'],
              options: streams.map(s => ({ value: s.id, label: s.name })),
            },
            {
              name: 'exam',
              label: 'Assessment',
              placeholder: !params.class ? 'Select grade first' : hasExams ? 'Select assessment' : 'No assessments',
              required: true,
              disabled: !hasExams || !params.class,
              clears: [],
              options: exams.map(e => ({ value: e.id, label: e.name })),
            },
          ]}
        />
      </div>

      {/* Focused Student Single Result Card */}
      {selected ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden space-y-6 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <Link
                href={`/dashboard/results?exam=${params.exam}&class=${params.class}${params.stream ? `&stream=${params.stream}` : ''}`}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-700 font-medium mb-2 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to full broadsheet
              </Link>
              <h2 className="text-xl font-bold text-slate-900">{selected.fullName}</h2>
              <p className="text-xs font-mono font-medium text-slate-500 mt-0.5">ADM: {selected.admissionNo}</p>
            </div>

            <div className="flex items-center gap-2">
                  {selected.complete && selected.streamPosition !== null && selected.streamName && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                      {selected.streamName} · {selected.streamPosition}
                    </span>
                  )}
                  {selected.complete ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                      <Award className="h-3.5 w-3.5 text-emerald-600" />
                      Complete · Position {selected.position}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      Incomplete ({selected.subjects.length}/{selected.expectedSubjects} Learning Areas)
                    </span>
                  )}
                </div>
          </div>

          <div className="border border-slate-200/80 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-3">Subject / Area</th>
                  <th className="px-5 py-3 text-right">Raw Score</th>
                  <th className="px-5 py-3 text-center">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selected.subjects.map((s) => {
                  const subjectGrade = selected.complete
                    ? (scale.find(r => s.score >= r.min && s.score <= r.max)?.grade ?? 'E')
                    : '—'

                  return (
                    <tr key={s.subjectId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-900">{s.subjectName}</td>
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-slate-700">
                        {s.score.toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold text-xs">
                          {subjectGrade}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 flex flex-wrap items-center justify-between gap-4 text-xs font-semibold">
            <div className="flex gap-6 text-slate-700">
              <span>Total: <strong className="text-slate-900 font-mono text-sm ml-1">{selected.total.toFixed(2)}</strong></span>
              <span>Average: <strong className="text-slate-900 font-mono text-sm ml-1">{selected.average.toFixed(2)}</strong></span>
            </div>
            <div>
              <span>Mean Grade: </span>
              <span className={`ml-1 text-sm font-bold ${selected.complete ? 'text-emerald-700' : 'text-amber-700'}`}>
                {selected.complete ? selected.grade : 'Incomplete'}
              </span>
            </div>
          </div>

          <div className="pt-2">
            <Link 
              href={`/dashboard/reports?exam=${params.exam}&class=${params.class}${params.stream ? `&stream=${params.stream}` : ''}&student=${selected.studentId}`}
              className="btn"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Generate Official Report Form</span>
            </Link>
          </div>
        </div>
      ) : params.exam && params.class ? (
        /* Class Broadsheet Matrix */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-6 text-center border-b border-slate-200/80 bg-slate-50/50">
            {tenant?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logo_url} alt={tenant?.name ?? 'School logo'} className="h-14 w-14 object-contain mx-auto mb-3" />
            ) : null}
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">{tenant?.name ?? 'School'}</h2>
            {tenant?.code ? <p className="text-[11px] font-semibold text-slate-500 mt-0.5">School Code: {tenant.code}</p> : null}
            {tenant?.address ? <p className="text-[11px] font-semibold text-slate-500 mt-0.5">P.O Box: {tenant.address}</p> : null}
            <p className="eyebrow mt-2">Assessment Broadsheet</p>
            <p className="text-sm font-semibold text-slate-800 mt-1.5">
              {exam?.name} · {cls?.name}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {[exam?.term, exam?.academic_year].filter(Boolean).join(' · ') || '—'}
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <a
                href={`/api/results/export/xlsx?exam=${params.exam}&class=${params.class}${params.stream ? `&stream=${params.stream}` : ''}`}
                className="btn"
                download
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Download Excel</span>
              </a>
              <a
                href={`/api/results/export/pdf?exam=${params.exam}&class=${params.class}${params.stream ? `&stream=${params.stream}` : ''}`}
                className="btn secondary"
                download
              >
                <FileDown className="h-4 w-4" />
                <span>Download PDF</span>
              </a>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">
              {columns.length} Learning Areas · {results.length} Students · Missing scores shown as —
            </p>
            {columns.some(c => c.subjectCode) && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                {columns.map(c => (
                  <span key={c.subjectId}>
                    <strong className="font-semibold text-slate-600">{c.subjectCode}</strong> = {c.subjectName}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="table-rail">
            <table className="w-full text-left text-sm text-slate-600 min-w-[46rem]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider font-semibold text-slate-500 sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 bg-slate-50 px-3 py-3.5 w-12 text-center">Pos</th>
                  <th className="sticky left-12 z-30 bg-slate-50 px-3 py-3.5 w-24">Adm No</th>
                  <th className="sticky left-36 z-30 bg-slate-50 px-4 py-3.5 min-w-[11rem]">Student Name</th>
                  {hasStreamData && (
                    <>
                      <th className="px-4 py-3.5 min-w-[110px]">Stream</th>
                      <th className="px-4 py-3.5 w-14 text-center">Str Pos</th>
                    </>
                  )}
                  {columns.map(col => (
                    <th key={col.subjectId} className="px-3 py-3.5 text-right whitespace-nowrap sticky top-0 bg-slate-50" title={col.subjectName}>
                      {col.subjectCode ?? col.subjectName}
                    </th>
                  ))}
                  <th className="px-4 py-3.5 text-right text-emerald-700">Total</th>
                  <th className="px-4 py-3.5 text-right">Average</th>
                  <th className="px-4 py-3.5 text-center">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.length ? (
                  results.map((r) => (
                    <tr key={r.studentId} className="group hover:bg-slate-50/80 transition-colors">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/80 transition-colors px-3 py-3.5 text-center">
                        {r.complete ? (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">
                            {r.position}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="sticky left-12 z-10 bg-white group-hover:bg-slate-50/80 transition-colors px-3 py-3.5 font-mono text-xs font-semibold text-slate-600">
                        {r.admissionNo}
                      </td>
                      <td className="sticky left-36 z-10 bg-white group-hover:bg-slate-50/80 transition-colors px-4 py-3.5">
                        <Link
                          href={`/dashboard/results?exam=${params.exam}&class=${params.class}${params.stream ? `&stream=${params.stream}` : ''}&student=${r.studentId}`}
                          className="font-medium text-slate-900 hover:text-emerald-700 transition-colors"
                        >
                          {r.fullName}
                        </Link>
                      </td>
                      {hasStreamData && (
                        <>
                          <td className="px-4 py-3.5 text-xs font-semibold text-slate-500">
                            {r.streamName ?? '—'}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {r.complete && r.streamPosition !== null ? (
                              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold">
                                {r.streamPosition}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </>
                      )}
                      {columns.map(col => {
                        const score = r.subjects.find(s => s.subjectId === col.subjectId)?.score
                        return (
                          <td
                            key={col.subjectId}
                            className={`px-3 py-3.5 text-right font-mono tabular-nums text-xs font-semibold ${score === undefined ? 'text-slate-300' : 'text-slate-700'}`}
                          >
                            {score === undefined ? '—' : score.toFixed(2)}
                          </td>
                        )
                      })}
                      <td className="px-4 py-3.5 text-right font-mono text-sm font-extrabold text-slate-900 bg-emerald-50/60">
                        {r.total.toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold text-slate-800">
                        {r.average.toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {r.complete ? (
                          <span className="inline-flex items-center gap-1 font-bold text-xs text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full" title={r.overallDescription}>
                            <CheckCircle2 className="h-3 w-3" /> {r.overallLevel}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200/60 px-2.5 py-0.5 rounded-full">
                            <AlertCircle className="h-3 w-3" /> Incomplete
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length + (hasStreamData ? 8 : 6)} className="px-6 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <GraduationCap className="h-8 w-8 text-slate-300" />
                        <p className="text-sm font-medium">No students or marks have been entered for this selection.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}