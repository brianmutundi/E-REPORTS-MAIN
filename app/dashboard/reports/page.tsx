import Link from 'next/link'
import { getConfiguredAssessmentResults } from '@/lib/results'
import { getReportTenant, normalizeReportTemplate, validTemplateKey, REPORT_TEMPLATE_KEYS, REPORT_TEMPLATE_LABELS } from '@/lib/report-template'
import { getTenantGradingScale, remarkForLevel } from '@/lib/grading'
import { getDashboardSession } from '@/lib/supabase/session'
import { getScopeStreams, getScopeExams, type ScopeExam } from '@/lib/scope'
import PrintButton from '@/components/PrintButton'
import CascadingFilterBar from '@/components/CascadingFilterBar'
import ScrollToReport from '@/components/ScrollToReport'
import SuccessToast from '@/components/SuccessToast'
import SubmitButton from '@/components/SubmitButton'
import SmsSendQueue from '@/components/reports/SmsSendQueue'
import { saveReportSettings } from './actions'
import { parseTermReference, getTermRowDates, getEffectiveTermDates, NEXT_TERM_OPENING_PLACEHOLDER } from '@/lib/terms'

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ exam?: string; class?: string; student?: string; stream?: string; saved?: string; error?: string }> }) {
  const params = await searchParams
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return <main className="main"><p>Please sign in.</p></main>
  if (!tenantId) return <main className="main"><p>No school is linked to this account.</p></main>
  // Round 1 — independent lookups in parallel (each Supabase round-trip is ~300ms of remote latency, so batching these avoids a serial waterfall that added up).
  const [classesRes, templateRes, gradingScale, streams, exams, tenant] = await Promise.all([
    supabase.from('classes').select('id,name,teacher_name,principal_name').eq('tenant_id', tenantId).order('name'),
    supabase.from('report_templates').select('id,name,template_json,template_key').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle(),
    getTenantGradingScale(tenantId),
    params.class ? getScopeStreams(supabase, tenantId, params.class) : Promise.resolve([] as { id: string; name: string }[]),
    params.class ? getScopeExams(supabase, tenantId, params.class) : Promise.resolve([] as ScopeExam[]),
    getReportTenant(supabase, tenantId),
  ])
  let classes = classesRes.data
  if (classes === null) { const r = await supabase.from('classes').select('id,name').eq('tenant_id', tenantId).order('name'); classes = r.data as any }
  let templateRow: { id: string | null; name: string | null; template_json: unknown; template_key?: string | null } | null = templateRes.data
  if (!templateRow && templateRes.error) {
    const retry = await supabase.from('report_templates').select('id,name,template_json').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
    if (!retry.error) templateRow = retry.data as { id: string | null; name: string | null; template_json: unknown }
  }
  const rowKey = templateRow?.template_key
  const templateKey = validTemplateKey(rowKey) ? rowKey : 'standard'
  const template = normalizeReportTemplate(templateRow?.template_json)
  const hasStreams = streams.length > 0
  const hasExams = exams.length > 0
  const gradeValid = Boolean(params.class && (classes ?? []).some(c => c.id === params.class))
  const hasSelection = Boolean(params.exam && params.class && gradeValid)
  // Term calendar context: the settings form edits dates for the term of the currently selected examination (falling back to the school's latest examination), while the report preview shows the CURRENT term's closing and the NEXT term's opening ("To be announced" when not yet configured).
  const termFallbackExam = hasSelection ? (exams?.find(e => e.id === params.exam) ?? null) ?? (exams?.at(-1) ?? null) : (exams?.at(-1) ?? null)
  const currentTermRef = parseTermReference({ term: termFallbackExam?.term ?? null, academicYear: termFallbackExam?.academic_year ?? null })
  const [termRowDates, effectiveDates] = await Promise.all([
    currentTermRef ? getTermRowDates(supabase, tenantId, currentTermRef) : Promise.resolve({ opening_date: null, closing_date: null }),
    getEffectiveTermDates(supabase, tenantId, currentTermRef),
  ])
  const openingDate = termRowDates.opening_date
  const closingDate = termRowDates.closing_date
  const storedDatesValid = !openingDate || !closingDate || openingDate < closingDate
  // Never pre-fill a tenant's settings form with an already-invalid legacy pair.
  // This is deliberately local to the authenticated tenant; another school's
  // settings cannot influence these values.
  const formOpeningDate = storedDatesValid ? openingDate : null
  const formClosingDate = storedDatesValid ? closingDate : null
  const currentClosingDate = effectiveDates.closingDate
  const nextOpeningDate = effectiveDates.openingDate ?? NEXT_TERM_OPENING_PLACEHOLDER
  // Round 2 — the configured report detail and the heavy computed results (needs template + class) are independent of each other.
  const [configured, remarkBanks] = hasSelection
    ? await Promise.all([
        getConfiguredAssessmentResults(params.exam!, params.class!, template.assessmentComponents, params.stream),
        templateRow?.id
          ? Promise.all([
              supabase.from('report_teacher_remarks').select('remark,sort_order').eq('report_template_id', templateRow.id).order('sort_order'),
              supabase.from('report_principal_remarks').select('remark,sort_order').eq('report_template_id', templateRow.id).order('sort_order'),
            ]).then(([teacher, principal]) => ({ teacher: teacher.data?.map(r => r.remark) ?? [], principal: principal.data?.map(r => r.remark) ?? [] }))
          : Promise.resolve({ teacher: [], principal: [] }),
      ])
    : [null, { teacher: [], principal: [] }]
  const results = configured?.rows ?? []
  const teacherRemarks = remarkBanks?.teacher ?? []
  const principalRemarks = remarkBanks?.principal ?? []
  const selected = params.student ? results.find(r => r.studentId === params.student) : undefined
  const exam = exams?.find(e => e.id === params.exam)
  const className = classes?.find(c => c.id === params.class)?.name
  const classTeacherName = (classes?.find(c => c.id === params.class) as any)?.teacher_name ?? null
  const classPrincipalName = (classes?.find(c => c.id === params.class) as any)?.principal_name ?? null
  const batchHref = hasSelection ? `/api/reports/pdf?exam=${params.exam}&class=${params.class}${params.stream ? `&stream=${params.stream}` : ''}` : '#'
  const transcriptBatchHref = hasSelection ? `/api/transcript/pdf?class=${params.class}${params.stream ? `&stream=${params.stream}` : ''}` : '#'

  const scoreLabels = [
    { active: template.assessmentComponents.midTerm, label: 'Mid Term' },
    { active: template.assessmentComponents.endTerm, label: 'End Term' },
    { active: template.assessmentComponents.average, label: 'Score' },
  ].filter(c => c.active).map(c => c.label)
  const singleScoreColumn = scoreLabels.length === 1
  const scoreHeader = (label: string) => (singleScoreColumn ? 'Score' : label)

  const smsItems: { studentId: string; admissionNo: string; fullName: string; phone: string; message: string; href: string }[] = []
  if (hasSelection && results.length) {
    const { data: phoneRows } = await supabase.from('students').select('id,guardian_phone').in('id', results.map(r => r.studentId))
    const phoneMap = new Map((phoneRows ?? []).map(r => [r.id, (r as any).guardian_phone ?? '']))
    for (const r of results) {
      const phone = (phoneMap.get(r.studentId) ?? '').toString().trim()
      const normalizedPhone = phone.replace(/[^0-9+]/g, '')
      const subjectLines = r.subjects.map(s => {
        const score = s.average ?? s.endTerm ?? s.midTerm
        const grade = s.grade ?? ''
        return `${s.subjectName}: ${score != null ? score.toFixed(1) : 'ABS'} (${grade})`
      })
      const header = [tenant?.name, exam?.name, exam?.term, exam?.academic_year].filter(Boolean).join(' · ')
      const overall = r.overallLevel ? `Overall: ${r.overallLevel}${r.overallDescription ? ' - ' + r.overallDescription : ''}` : ''
      const message = [header, ...subjectLines, overall].filter(Boolean).join('\n')
      const href = normalizedPhone ? `sms:${normalizedPhone}?body=${encodeURIComponent(message)}` : '#'
      smsItems.push({ studentId: r.studentId, admissionNo: r.admissionNo, fullName: r.fullName, phone, message, href })
    }
  }

  return <main className="main" style={{ maxWidth: 1120, margin: '0 auto' }}>
    <div className="top no-print"><div><div className="eyebrow">Assessment reports</div><h1 className="title">Student Assessment Reports</h1></div></div>

    {params.error && (() => { const idx = params.error.indexOf('|'); return idx > -1 ? <div className="notice error no-print" style={{ marginTop: 16 }}><span className="font-semibold">{params.error.slice(0, idx)}</span><span className="block text-xs opacity-80 mt-0.5">{params.error.slice(idx + 1)}</span></div> : <div className="notice error no-print" style={{ marginTop: 16 }}>{params.error}</div> })()}
    {params.saved && <SuccessToast message="Report settings saved" />}

    <section className="card no-print" style={{ marginTop: 20 }}>
      <div className="section-heading">
        <div>
          <h2 className="section-title">Report settings</h2>
        </div>
      </div>
      <form action={saveReportSettings}>
        <input type="hidden" name="exam" value={params.exam ?? ''} />
        <input type="hidden" name="class" value={params.class ?? ''} />
        <input type="hidden" name="stream" value={params.stream ?? ''} />
        <div className="form-grid">
          <label className="field-label">Report template<select name="template_key" defaultValue={templateKey}>{REPORT_TEMPLATE_KEYS.map(key => <option key={key} value={key}>{REPORT_TEMPLATE_LABELS[key]}</option>)}</select></label>
          <label className="field-label">Opening date<input type="date" name="opening_date" defaultValue={formOpeningDate ?? ''} /></label>
          <label className="field-label">Closing date<input type="date" name="closing_date" defaultValue={formClosingDate ?? ''} /></label>
        </div>
        <div className="actions-inline" style={{ marginTop: 14 }}>
          <SubmitButton>Save report settings</SubmitButton>
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
          {results.length > 0 && <a className="btn secondary" href={transcriptBatchHref} download>Transcript PDF</a>}
        </div>
                    {results.length === 0 ? <div className="notice error">No students were found in the selected grade.</div> : <div style={{ display: 'grid', gap: 10 }}>{results.map(student => <div key={student.studentId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 12, background: params.student === student.studentId ? '#f8fafc' : 'white', flexWrap: 'wrap' }}><div style={{ minWidth: 0, flex: '1 1 250px' }}><div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', fontFamily: 'monospace' }}>{student.admissionNo}</div><div style={{ fontWeight: 700, color: '#0f172a', marginTop: 3 }}>{student.fullName}</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: student.complete ? '#ecfdf5' : '#fff7ed', color: student.complete ? '#047857' : '#c2410c' }}>{student.complete ? 'Complete' : 'Incomplete'}</span><Link className="btn secondary" href={`/dashboard/reports?exam=${params.exam}&class=${params.class}${params.stream ? `&stream=${params.stream}` : ''}&student=${student.studentId}`}>View Report</Link><Link className="btn secondary" href={`/api/transcript/pdf?class=${params.class}&student=${student.studentId}`} target="_blank">Transcript</Link></div></div>)}</div>}
        <SmsSendQueue items={smsItems} />
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
          {template.examination.academicYear && exam?.academic_year ? ` · ${exam?.academic_year}` : ''}
        </div>

        <div className="student-meta">
          {template.student.name && <div><strong>Student</strong><br />{selected.fullName}</div>}
          {template.student.admissionNo && <div><strong>Admission No.</strong><br />{selected.admissionNo}</div>}
          {template.student.className && <div><strong>Grade</strong><br />{className ?? '—'}</div>}
          {template.student.stream && <div><strong>Stream</strong><br />{selected.streamName ?? '—'}</div>}
        </div>

        <table className="report-table">
          <thead><tr><th>Learning Area</th>{scoreLabels.map(label => <th key={label}>{scoreHeader(label)}</th>)}<th>Grade</th></tr></thead>
          <tbody>{selected.subjects.map(s => <tr key={s.subjectId}><td>{s.subjectName}</td>{template.assessmentComponents.midTerm && <td>{s.midTerm == null ? 'ABS' : s.midTerm.toFixed(1)}</td>}{template.assessmentComponents.endTerm && <td>{s.endTerm == null ? 'ABS' : s.endTerm.toFixed(1)}</td>}{template.assessmentComponents.average && <td>{s.average == null ? 'ABS' : s.average.toFixed(1)}</td>}<td>{s.grade ?? '—'}</td></tr>)}<tr><td><strong>Total</strong></td>{template.assessmentComponents.midTerm && <td><strong>{selected.midTermTotal == null ? 'ABS' : selected.midTermTotal.toFixed(1)}</strong></td>}{template.assessmentComponents.endTerm && <td><strong>{selected.endTermTotal == null ? 'ABS' : selected.endTermTotal.toFixed(1)}</strong></td>}{template.assessmentComponents.average && <td><strong>{selected.averageTotal == null ? 'ABS' : selected.averageTotal.toFixed(1)}</strong></td>}<td><strong>{selected.overallLevel ?? '—'}</strong></td></tr></tbody>
        </table>

        <div className="report-footer-grid">
          <div><strong>Grade Class Teacher</strong><br />{classTeacherName ?? '—'}</div>
          <div><strong>Class Teacher's Remark</strong><br />{selected.teacherRemark || remarkForLevel(teacherRemarks, selected.overallLevel) || '—'}</div>
          <div><strong>Principal's Remark</strong><br />{selected.principalRemark || remarkForLevel(principalRemarks, selected.overallLevel) || '—'}</div>
          <div><strong>Closing date</strong><br />{currentClosingDate ?? '—'}</div>
          <div><strong>Next term opening</strong><br />{nextOpeningDate}</div>
          <div><strong>Principal</strong><br />{classPrincipalName ?? '—'}</div>
        </div>

        <div className="no-print" style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}><PrintButton /></div>
      </section>
    )}
  </main>
}
