import Link from 'next/link'
import { getConfiguredAssessmentResults } from '@/lib/results'
import { getReportTenant, normalizeReportTemplate } from '@/lib/report-template'
import { getTenantGradingScale, remarkForLevel } from '@/lib/grading'
import { getDashboardSession } from '@/lib/supabase/session'
import { getScopeStreams, getScopeExams, type ScopeExam } from '@/lib/scope'
import PrintButton from '@/components/PrintButton'
import CascadingFilterBar from '@/components/CascadingFilterBar'
import ScrollToReport from '@/components/ScrollToReport'
import SuccessToast from '@/components/SuccessToast'
import SubmitButton from '@/components/SubmitButton'
import { saveReportPeriod } from './actions'

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ exam?: string; class?: string; student?: string; stream?: string; saved?: string; error?: string }> }) {
  const params = await searchParams
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return <main className="main"><p>Please sign in.</p></main>
  if (!tenantId) return <main className="main"><p>No school is linked to this account.</p></main>
  // Round 1 — independent lookups in parallel (each Supabase round-trip is ~300ms
  // of remote latency, so batching these avoids a serial waterfall that added up).
  const [classesRes, templateRes, gradingScale, streams, exams, tenant] = await Promise.all([
    supabase.from('classes').select('id,name,teacher_name,principal_name').eq('tenant_id', tenantId).order('name'),
    supabase.from('report_templates').select('id,name,template_json').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle(),
    getTenantGradingScale(tenantId),
    params.class ? getScopeStreams(supabase, tenantId, params.class) : Promise.resolve([] as { id: string; name: string }[]),
    params.class ? getScopeExams(supabase, tenantId, params.class) : Promise.resolve([] as ScopeExam[]),
    getReportTenant(supabase, tenantId),
  ])
  let classes = classesRes.data
  if (classes === null) { const r = await supabase.from('classes').select('id,name').eq('tenant_id', tenantId).order('name'); classes = r.data as any }
  const templateRow = templateRes.data
  const template = normalizeReportTemplate(templateRow?.template_json)
  const hasStreams = streams.length > 0
  const hasExams = exams.length > 0
  const gradeValid = Boolean(params.class && (classes ?? []).some(c => c.id === params.class))
  const hasSelection = Boolean(params.exam && params.class && gradeValid)
  // Round 2 — the configured report detail (needs templateRow) and the heavy
  // computed results (needs template + class) are independent of each other.
  const reportConfigPromise = templateRow?.id
    ? supabase.from('report_template_configs').select('opening_date,closing_date').eq('report_template_id', templateRow.id).maybeSingle()
    : Promise.resolve<{ data: { opening_date: string | null; closing_date: string | null } | null }>({ data: null })
  const [{ data: reportConfig }, configured, remarkBanks] = hasSelection
    ? await Promise.all([
        reportConfigPromise,
        getConfiguredAssessmentResults(params.exam!, params.class!, template.assessmentComponents, params.stream),
        templateRow?.id
          ? Promise.all([
              supabase.from('report_teacher_remarks').select('remark,sort_order').eq('report_template_id', templateRow.id).order('sort_order'),
              supabase.from('report_principal_remarks').select('remark,sort_order').eq('report_template_id', templateRow.id).order('sort_order'),
            ]).then(([teacher, principal]) => ({ teacher: teacher.data?.map(r => r.remark) ?? [], principal: principal.data?.map(r => r.remark) ?? [] }))
          : Promise.resolve({ teacher: [], principal: [] }),
      ])
    : [{ data: (await reportConfigPromise).data }, null, { teacher: [], principal: [] }]
  const results = configured?.rows ?? []
  const teacherRemarks = remarkBanks?.teacher ?? []
  const principalRemarks = remarkBanks?.principal ?? []
  const selected = params.student ? results.find(r => r.studentId === params.student) : undefined
  const exam = exams?.find(e => e.id === params.exam)
  const className = classes?.find(c => c.id === params.class)?.name
  const classTeacherName = (classes?.find(c => c.id === params.class) as any)?.teacher_name ?? null
  const classPrincipalName = (classes?.find(c => c.id === params.class) as any)?.principal_name ?? null
  const batchHref = hasSelection ? `/api/reports/pdf?exam=${params.exam}&class=${params.class}${params.stream ? `&stream=${params.stream}` : ''}` : '#'
  const openingDate = reportConfig?.opening_date ?? null
  const closingDate = reportConfig?.closing_date ?? null

  const scoreLabels = [
    { active: template.assessmentComponents.midTerm, label: 'Mid Term' },
    { active: template.assessmentComponents.endTerm, label: 'End Term' },
    { active: template.assessmentComponents.average, label: 'Score' },
  ].filter(c => c.active).map(c => c.label)
  const singleScoreColumn = scoreLabels.length === 1
  const scoreHeader = (label: string) => (singleScoreColumn ? 'Score' : label)

  return <main className="main" style={{ maxWidth: 1120, margin: '0 auto' }}>
    <div className="top no-print"><div><div className="eyebrow">Assessment reports</div><h1 className="title">Student Assessment Reports</h1><p className="muted">Set the term dates for this school and select an examination and grade to view the report form.</p></div></div>

    {params.error && (() => { const idx = params.error.indexOf('|'); return idx > -1 ? <div className="notice error no-print" style={{ marginTop: 16 }}><span className="font-semibold">{params.error.slice(0, idx)}</span><span className="block text-xs opacity-80 mt-0.5">{params.error.slice(idx + 1)}</span></div> : <div className="notice error no-print" style={{ marginTop: 16 }}>{params.error}</div> })()}
    {params.saved && <SuccessToast message="Report period saved" />}

    <section className="card no-print" style={{ marginTop: 20 }}>
      <div className="section-heading">
        <div>
          <h2 className="section-title">Report period</h2>
          <p className="muted">These opening and closing dates are stored with the report template and appear on generated reports.</p>
        </div>
      </div>
      <form action={saveReportPeriod}>
        <input type="hidden" name="exam" value={params.exam ?? ''} />
        <input type="hidden" name="class" value={params.class ?? ''} />
        <input type="hidden" name="stream" value={params.stream ?? ''} />
        <div className="form-grid">
          <label className="field-label">Opening date<input type="date" name="opening_date" defaultValue={openingDate ?? ''} /></label>
          <label className="field-label">Closing date<input type="date" name="closing_date" defaultValue={closingDate ?? ''} /></label>
        </div>
        <div className="actions-inline" style={{ marginTop: 14 }}>
          <SubmitButton>Save report period</SubmitButton>
        </div>
      </form>
    </section>

    <div className="card no-print">
      <CascadingFilterBar
        basePath="/dashboard/reports"
        submitLabel="Load Students"
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
            placeholder: !params.class ? 'Select grade first' : hasStreams ? 'Stream (all)' : 'No streams',
            disabled: !hasStreams,
            clears: ['exam'],
            options: streams.map(s => ({ value: s.id, label: s.name })),
          },
          {
            name: 'exam',
            label: 'Assessment',
            placeholder: !params.class ? 'Select grade first' : hasExams ? 'Examination' : 'No assessments',
            required: true,
            disabled: !hasExams || !params.class,
            clears: [],
            options: exams.map(e => ({ value: e.id, label: e.name })),
          },
        ]}
      />
    </div>

    {configured?.error && <div className="notice error no-print" style={{ marginTop: 20 }}>{configured.error}</div>}

    {hasSelection && !configured?.error && (
      <section className="card no-print" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div><div className="eyebrow">{exam?.name ?? 'Examination'}</div><h2 style={{ margin: '4px 0', fontSize: 20 }}>{className ?? 'Grade'} — Student Reports</h2><p className="muted">{results.length} student{results.length === 1 ? '' : 's'} found. Configured: {template.assessmentComponents.midTerm ? 'Mid Term ' : ''}{template.assessmentComponents.endTerm ? 'End Term ' : ''}{template.assessmentComponents.average ? 'Score' : ''}</p></div>
          {results.length > 0 && <a className="btn" href={batchHref} download>{hasStreams ? 'Generate Batch PDF' : 'Generate Grade PDF'}</a>}
        </div>
                    {results.length === 0 ? <div className="notice error">No students were found in the selected grade.</div> : <div style={{ display: 'grid', gap: 10 }}>{results.map(student => <div key={student.studentId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 12, background: params.student === student.studentId ? '#f8fafc' : 'white', flexWrap: 'wrap' }}><div style={{ minWidth: 0, flex: '1 1 250px' }}><div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', fontFamily: 'monospace' }}>{student.admissionNo}</div><div style={{ fontWeight: 700, color: '#0f172a', marginTop: 3 }}>{student.fullName}</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: student.complete ? '#ecfdf5' : '#fff7ed', color: student.complete ? '#047857' : '#c2410c' }}>{student.complete ? 'Complete' : 'Incomplete'}</span><Link className="btn secondary" href={`/dashboard/reports?exam=${params.exam}&class=${params.class}${params.stream ? `&stream=${params.stream}` : ''}&student=${student.studentId}`}>View Report</Link></div></div>)}</div>}
      </section>
    )}

    {hasSelection && !configured?.error && <ScrollToReport studentId={params.student ?? null} />}

    {selected && !configured?.error && (
      <section className="report card" style={{ marginTop: 20 }}>
        <div className="report-head">
          {template.school.logo && tenant?.logo_url && <img src={tenant.logo_url} alt="School logo" style={{ width: 64, height: 64, objectFit: 'contain', margin: '0 auto 8px' }} />}
          {template.school.name && <h2>{tenant?.name ?? 'School'}</h2>}
          {template.school.contact && tenant?.address ? <p className="report-address">P.O Box: {tenant.address}</p> : null}
          <p className="report-title">Assessment Report</p>
          {template.examination.name && <strong>{exam?.name}</strong>}
          {template.examination.term && exam?.term ? ` · ${exam.term}` : ''}
          {template.examination.academicYear && exam?.academic_year ? ` · ${exam.academic_year}` : ''}
        </div>

        <div className="student-meta">
          {template.student.name && <div><strong>Student</strong><br />{selected.fullName}</div>}
          {template.student.admissionNo && <div><strong>Admission No.</strong><br />{selected.admissionNo}</div>}
          {template.student.className && <div><strong>Grade</strong><br />{className ?? '—'}</div>}
          {selected.streamName ? <div><strong>Stream</strong><br />{selected.streamName}</div> : null}
        </div>

        {template.results.grade && gradingScale.length > 0 && (
          <div className="grading-key" style={{ width: '100%', margin: '12px 0', border: '1px solid #333', fontFamily: 'Arial, sans-serif', fontSize: gradingScale.length > 4 ? 9 : 10 }}>
            <div style={{ backgroundColor: '#e6e6e6', textAlign: 'center', fontWeight: 'bold', padding: 3, borderBottom: '1px solid #333', fontSize: gradingScale.length > 4 ? 10 : 11 }}>
              PERFORMANCE LEVEL KEY ({gradingScale.length}-LEVEL SCALE)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #333' }}>
                  {gradingScale.map(r => <th key={r.grade} style={{ borderRight: '1px solid #333', padding: 4, fontWeight: 'bold' }}>{r.grade}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #333' }}>
                  {gradingScale.map(r => <td key={r.grade} style={{ borderRight: '1px solid #333', padding: 4, fontSize: gradingScale.length > 4 ? 8 : 9, fontWeight: 'bold' }}>{r.description.toUpperCase()}</td>)}
                </tr>
                <tr>
                  {gradingScale.map(r => {
                    const min = Math.ceil(r.min)
                    const max = Math.floor(r.max)
                    const range = min === max ? `${min}` : `${min} - ${max}`
                    return <td key={r.grade} style={{ borderRight: '1px solid #333', padding: 4, fontSize: gradingScale.length > 4 ? 8 : undefined }}>{range}</td>
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {!selected.complete && <div className="notice error">Incomplete result — required assessment marks are missing. Missing marks are not treated as zero.</div>}

        <table className="report-table">
          <thead>
            <tr>
              {template.results.learningArea && <th>Learning Area</th>}
              {template.assessmentComponents.midTerm && <th>{scoreHeader('Mid Term')}</th>}
              {template.assessmentComponents.endTerm && <th>{scoreHeader('End Term')}</th>}
              {template.assessmentComponents.average && <th>{scoreHeader('Score')}</th>}
              {template.results.grade && <th>Level</th>}
              {template.results.gradeDescription && <th>Description</th>}
            </tr>
          </thead>
          <tbody>
            {selected.subjects.map(s => (
              <tr key={s.subjectId}>
                {template.results.learningArea && <td>{s.subjectName}</td>}
                {template.assessmentComponents.midTerm && <td>{s.midTerm === null ? 'ABS' : s.midTerm.toFixed(2)}</td>}
                {template.assessmentComponents.endTerm && <td>{s.endTerm === null ? 'ABS' : s.endTerm.toFixed(2)}</td>}
                {template.assessmentComponents.average && <td>{s.average === null ? 'ABS' : s.average.toFixed(2)}</td>}
                {template.results.grade && <td>{s.grade || '—'}</td>}
                {template.results.gradeDescription && <td>{s.gradeDescription || '—'}</td>}
              </tr>
            ))}
          </tbody>
          {(template.results.total || template.results.average || template.results.grade) && (() => {
            const span = Math.max(1, (template.assessmentComponents.midTerm ? 1 : 0) + (template.assessmentComponents.endTerm ? 1 : 0) + (template.assessmentComponents.average ? 1 : 0) + (template.results.grade ? 1 : 0) + (template.results.gradeDescription ? 1 : 0))
            return (
              <tfoot>
                {template.results.total && (template.assessmentComponents.midTerm || template.assessmentComponents.endTerm || template.assessmentComponents.average) && <tr><th>Total</th><th colSpan={span}>{selected.total === null ? '—' : `${selected.total}`}</th></tr>}
                {template.results.average && template.assessmentComponents.average && <tr><th>Average</th><th colSpan={span}>{selected.average === null ? '—' : selected.average.toFixed(2)}</th></tr>}
                {template.results.grade && selected.overallLevel && <tr><th>Overall Performance Level</th><th colSpan={span}>{selected.overallLevel}{selected.overallDescription ? ` — ${selected.overallDescription}` : ''}</th></tr>}
              </tfoot>
            )
          })()}
        </table>

        <div className="financial-information" aria-label="Financial Information">
          <div className="financial-information-title">Financial Information</div>
          <div className="financial-information-row"><span>Fee Balance</span><span className="financial-line">________________</span></div>
          <div className="financial-information-row"><span>Next Term Fee</span><span className="financial-line">________________</span></div>
        </div>

        {(closingDate || openingDate) ? (
          <div className="report-term-line">
            School Closes on <strong>{closingDate ?? '____________'}</strong> and opens on <strong>{openingDate ?? '____________'}</strong>
          </div>
        ) : null}

        {template.additional.teacherComment && (
          <div className="preview-note report-remark">
            <b>Remark (Grade Class Teacher)</b>
            <p className="remark-text">{remarkForLevel(selected.overallLevel, gradingScale, teacherRemarks) || '____________________________'}</p>
          </div>
        )}
        {template.additional.overallComment && (
          <div className="preview-note report-remark">
            <b>Remark (Principal)</b>
            <p className="remark-text">{remarkForLevel(selected.overallLevel, gradingScale, principalRemarks) || '____________________________'}</p>
          </div>
        )}
        {template.additional.signatureArea && (
          <div className="signature-block">
            <div className="signature-row"><span>Grade Class Teacher&apos;s Name: {classTeacherName || '________________'}</span><span>Sign: ____________</span><span>Date: ____________</span></div>
            <div className="signature-row"><span>Principal&apos;s Name: {classPrincipalName || '________________'}</span><span>Sign: ____________</span><span>Date: ____________</span></div>
          </div>
        )}
        <div className="report-actions no-print"><PrintButton href={`/api/reports/pdf?exam=${params.exam}&class=${params.class}${params.stream ? `&stream=${params.stream}` : ''}&student=${selected.studentId}`} /></div>
      </section>
    )}
  </main>
}