import Link from 'next/link'
import { getReportRows, reportTypeIsSnapshot, REPORT_TYPES, type ReportType } from '@/lib/results'
import { getReportTenant } from '@/lib/report-template'
import { getTenantGradingScale, getTenantRemarkBanks, remarkBandForPercent } from '@/lib/grading'
import { getDashboardSession } from '@/lib/supabase/session'
import { getScopeStreams, getScopeExams } from '@/lib/scope'
import PrintButton from '@/components/PrintButton'
import CascadingFilterBar from '@/components/CascadingFilterBar'
import ScrollToReport from '@/components/ScrollToReport'

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ class?: string; stream?: string; type?: string; exam?: string; term?: string; year?: string; student?: string }> }) {
  const params = await searchParams
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return <main className="main"><p>Please sign in.</p></main>
  if (!tenantId) return <main className="main"><p>No school is linked to this account.</p></main>

  // Validate the report type from the query string.
  const typeParam = params.type as string
  const reportType: ReportType | null = REPORT_TYPES.some(t => t.key === typeParam) ? (typeParam as ReportType) : null

  const [classesRes, gradingScale, streams, scopeExamsAny, tenant] = await Promise.all([
    supabase.from('classes').select('id,name,teacher_name,principal_name').eq('tenant_id', tenantId).order('name'),
    getTenantGradingScale(tenantId),
    params.class ? getScopeStreams(supabase, tenantId, params.class) : Promise.resolve([] as { id: string; name: string }[]),
    params.class ? getScopeExams(supabase, tenantId, params.class) : Promise.resolve([] as { id: string; name: string; term: string | null; academic_year: number | null; assessment_component: 'mid_term' | 'end_term' | null }[]),
    getReportTenant(supabase, tenantId),
  ])
  let classes = classesRes.data
  if (classes === null) { const r = await supabase.from('classes').select('id,name').eq('tenant_id', tenantId).order('name'); classes = r.data as any }
  const remarkBanks = await getTenantRemarkBanks(tenantId)

  const hasStreams = streams.length > 0
  const scopeExams = scopeExamsAny
  const gradeValid = Boolean(params.class && (classes ?? []).some(c => c.id === params.class))
  const hasType = Boolean(reportType)

  // Derived filter options for the selected grade.
  const snapshotComponent = reportTypeIsSnapshot(reportType as ReportType) ? reportType : null
  // Assessment options for snapshot types, filtered by the report type's component.
  const examComponentMap: Partial<Record<ReportType, string | null>> = { test: 'test_exam', mid_term: 'mid_term', end_term: 'end_term' }
  const assessmentOptions = snapshotComponent ? (scopeExams as any[])
    .filter(e => e.assessment_component === examComponentMap[snapshotComponent as ReportType])
    .map(e => ({ value: e.id, label: `${e.name}${e.term ? ` · ${e.term}` : ''}${e.academic_year ? ` · ${e.academic_year}` : ''}` })) : []
  // Distinct terms from exams that actually have this class linked (recorded data basis).
  const termOptions = snapshotComponent ? [] : [...new Set((scopeExams as any[])
    .map(e => e.term)
    .filter((t: unknown): t is string => Boolean(t)))]
    .sort()
    .map(t => ({ value: t, label: t }))
  const yearOptions = snapshotComponent ? [] : [...new Set((scopeExams as any[])
    .map(e => e.academic_year)
    .filter((y: unknown): y is number => y !== null && y !== undefined))]
    .sort((a, b) => b - a)
    .map(y => ({ value: String(y), label: String(y) }))

  // Whether the selection is complete enough to load results.
  const hasSelection = Boolean(params.class && gradeValid) && Boolean(reportType) && Boolean(
    snapshotComponent ? params.exam : (reportType === 'termly_average' ? params.term : (reportType === 'yearly_average' ? params.year : false))
  )

  const reportData = hasSelection
    ? await getReportRows({
        reportType: reportType as ReportType,
        classId: params.class!,
        examId: snapshotComponent ? params.exam : undefined,
        term: reportType === 'termly_average' ? params.term : undefined,
        academicYear: reportType === 'yearly_average' ? (params.year ? Number(params.year) : undefined) : (reportType === 'termly_average' && params.year ? Number(params.year) : undefined),
        streamId: params.stream,
      })
    : null

  const results = reportData?.rows ?? []
  const selected = params.student ? results.find(r => r.studentId === params.student) : undefined
  const className = classes?.find(c => c.id === params.class)?.name
  const classTeacherName = (classes?.find(c => c.id === params.class) as any)?.teacher_name ?? null
  const classPrincipalName = (classes?.find(c => c.id === params.class) as any)?.principal_name ?? null

  const qs = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams()
    if (params.class) q.set('class', params.class)
    if (params.stream) q.set('stream', params.stream)
    if (reportType) q.set('type', reportType)
    if (params.exam) q.set('exam', params.exam)
    if (params.term) q.set('term', params.term)
    if (params.year) q.set('year', params.year)
    for (const [k, v] of Object.entries(extra)) { if (v) q.set(k, v); else q.delete(k) }
    return q.toString()
  }
  const batchQ = qs({})
  const batchHref = hasSelection && results.length ? `/api/reports/pdf?${batchQ}` : '#'

  const isAggregate = reportType === 'termly_average' || reportType === 'yearly_average'
  const metaTerm = reportType === 'termly_average' ? params.term : reportData?.term ?? null
  const metaYear = reportData?.academicYear ?? (params.year ? Number(params.year) : null)
  const metaLabel = reportData?.examName ?? (reportType ? REPORT_TYPES.find(t => t.key === reportType)?.label ?? '' : '')

  // Filter bar fields are built dynamically by report type.
  const fields = [
    {
      name: 'class',
      label: 'Grade',
      placeholder: 'Select grade',
      required: true,
      clears: ['stream', 'type', 'exam', 'term', 'year'],
      options: (classes ?? []).map(c => ({ value: c.id, label: c.name })),
    },
    {
      name: 'stream',
      label: 'Stream',
      placeholder: !params.class ? 'Select grade first' : hasStreams ? 'Stream (all)' : 'No streams',
      disabled: !hasStreams,
      clears: [],
      options: streams.map(s => ({ value: s.id, label: s.name })),
    },
    {
      name: 'type',
      label: 'Report Type',
      placeholder: 'Select type',
      required: true,
      clears: ['exam', 'term', 'year'],
      options: REPORT_TYPES.map(t => ({ value: t.key, label: t.label })),
    },
    ...(snapshotComponent ? [{
      name: 'exam',
      label: 'Assessment',
      placeholder: !reportType ? 'Select report type first' : assessmentOptions.length ? 'Assessment' : 'No assessments',
      required: true,
      disabled: !reportType,
      clears: [],
      options: assessmentOptions,
    }] : []),
    ...(reportType === 'termly_average' ? [{
      name: 'term',
      label: 'Term',
      placeholder: termOptions.length ? 'Term' : 'No terms with data',
      required: true,
      clears: [],
      options: termOptions,
    }] : []),
    ...(reportType === 'yearly_average' ? [{
      name: 'year',
      label: 'Academic Year',
      placeholder: yearOptions.length ? 'Year' : 'No years with data',
      required: true,
      clears: [],
      options: yearOptions,
    }] : []),
  ]

  return <main className="main" style={{ maxWidth: 1120, margin: '0 auto' }}>
    <div className="top no-print"><div><div className="eyebrow">Report forms</div><h1 className="title">Student Report Forms</h1><p className="muted">Choose a grade and report type to generate the configured report form.</p></div><div className="actions" style={{ marginTop: 0 }}><Link className="btn secondary" href="/dashboard/grading">Grading &amp; Remarks</Link><Link className="btn secondary" href="/dashboard/results">Results</Link></div></div>

    <div className="card no-print">
      <CascadingFilterBar
        basePath="/dashboard/reports"
        submitLabel="Load Students"
        values={{ class: params.class, stream: params.stream, type: params.type, exam: params.exam, term: params.term, year: params.year }}
        fields={fields as any}
      />
    </div>

    {reportData?.error && <div className="notice error no-print" style={{ marginTop: 20 }}>{reportData.error}</div>}

    {hasSelection && !reportData?.error && (
      <section className="card no-print" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div className="eyebrow">{reportType && REPORT_TYPES.find(t => t.key === reportType)?.label}</div>
            <h2 style={{ margin: '4px 0', fontSize: 20 }}>{className ?? 'Class'} — Student Reports</h2>
            <p className="muted">{results.length} student{results.length === 1 ? '' : 's'} found{reportType === 'yearly_average' && selected ? ` — ${selected.partialTerms ?? 0} of 3 terms recorded` : ''}.</p>
          </div>
          {results.length > 0 && <a className="btn" href={batchHref} download>Generate Batch PDF</a>}
        </div>
        {results.length === 0 ? <div className="notice error">No students were found in the selected class.</div> : <div style={{ display: 'grid', gap: 10 }}>{results.map(student => <div key={student.studentId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 12, background: params.student === student.studentId ? '#f8fafc' : 'white', flexWrap: 'wrap' }}><div style={{ minWidth: 0, flex: '1 1 250px' }}><div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', fontFamily: 'monospace' }}>{student.admissionNo}</div><div style={{ fontWeight: 700, color: '#0f172a', marginTop: 3 }}>{student.fullName}</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><Link className="btn secondary" href={`/dashboard/reports?${qs({ student: student.studentId })}`}>View Report</Link></div></div>)}</div>}
      </section>
    )}

    {hasSelection && !reportData?.error && <ScrollToReport studentId={params.student ?? null} />}

    {selected && !reportData?.error && (
      <section className="report card" style={{ marginTop: 20 }}>
        <div className="report-head">
          {tenant?.logo_url && <img src={tenant.logo_url} alt="School logo" style={{ width: 56, height: 56, objectFit: 'contain', marginRight: 12 }} />}
          <div>
            <h2>{tenant?.name ?? 'School'}</h2>
            {tenant?.address ? <p className="report-address">P.O Box: {tenant.address}</p> : null}
          </div>
        </div>

        <div className="learner-bar">
          <div><span>Student</span>{selected.fullName}</div>
          <div><span>Adm. No</span>{selected.admissionNo}</div>
          <div><span>Class</span>{className ?? '—'}</div>
          <div><span>Stream</span>{selected.streamName ?? '—'}</div>
        </div>

        <div className="report-meta">
          <span>Report Type: <strong>{metaLabel}</strong></span>
          {metaYear ? <span>Academic Year: <strong>{metaYear}</strong></span> : null}
          {metaTerm && reportType !== 'termly_average' ? <span>Term: <strong>{metaTerm}</strong></span> : null}
          {reportType === 'termly_average' && params.term ? <span>Term: <strong>{params.term}</strong></span> : null}
          {reportType === 'yearly_average' && selected.partialTerms !== undefined ? <span className="partial">{selected.partialTerms} of 3 terms recorded</span> : null}
        </div>

        {!selected.complete && <div className="notice error">Incomplete result — required assessment marks are missing. Missing marks are not treated as zero.</div>}

        <table className="report-table">
          <thead>
            <tr>
              <th>Learning Area</th>
              <th>{snapshotComponent ? 'Marks' : 'Mean'}</th>
              <th>Level</th>
              <th>Description</th>
              <th>Position</th>
            </tr>
          </thead>
          <tbody>
            {selected.subjects.map(s => (
              <tr key={s.subjectId}>
                <td>{s.subjectName}</td>
                <td>{s.mark === null ? 'ABS' : s.mark.toFixed(2)}</td>
                <td>{s.grade || '—'}</td>
                <td>{s.gradeDescription || '—'}</td>
                <td>{selected.position ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="summary-strip">
          <div className="summary-item"><span>Total</span><strong>{selected.total === null ? '—' : `${Math.round(selected.total * 100) / 100}`}</strong></div>
          {isAggregate && <div className="summary-item"><span>Average / Mean</span><strong>{selected.average === null ? '—' : selected.average.toFixed(2)}</strong></div>}
          <div className="summary-item"><span>Overall Position</span><strong>{selected.complete ? selected.position : '—'}</strong></div>
          {gradingScale.length > 0 && selected.overallPercent !== null && (
            <div className="summary-item"><span>Overall</span><strong className="overall-badge" style={{ color: `var(--accent)` }}>{selected.overallLevel}{selected.overallDescription ? ` · ${selected.overallDescription}` : ''}</strong></div>
          )}
        </div>

        <div className="remarks-block">
          <div className="remark"><span className="remark-label">Class Teacher&apos;s Remark</span><p>{remarkBandForPercent(selected.overallPercent, remarkBanks, 'class_teacher')}</p></div>
          <div className="remark"><span className="remark-label">Head Teacher&apos;s Remark</span><p>{remarkBandForPercent(selected.overallPercent, remarkBanks, 'principal')}</p></div>
        </div>

        <div className="signature-block">
          <div className="signature-role">
            <div className="signature-line"><span>Class Teacher: ({classTeacherName || '________________'})</span><span>Sign: ________</span><span>Date: ______</span></div>
          </div>
          <div className="signature-role">
            <div className="signature-line"><span>Head Teacher: ({classPrincipalName || '________________'})</span><span>Sign: ________</span><span>Date: ______</span></div>
          </div>
        </div>
        <div className="report-actions no-print"><PrintButton href={`/api/reports/pdf?${qs({ student: selected.studentId })}`} /></div>
      </section>
    )}
  </main>
}
