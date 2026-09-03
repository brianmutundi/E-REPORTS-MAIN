import { NextRequest } from 'next/server'
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { getConfiguredAssessmentResults } from '@/lib/results'
import { getReportTenant, normalizeReportTemplate } from '@/lib/report-template'
import { getTenantGradingScale, getTenantRemarkBanks, remarkBandForPercent, type RemarkBanks } from '@/lib/grading'
import React from 'react'

export const runtime = 'nodejs'

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica' },
  header: { textAlign: 'center', marginBottom: 14 },
  logo: { width: 54, height: 54, objectFit: 'contain', alignSelf: 'center', marginBottom: 6 },
  school: { fontSize: 16, fontWeight: 700, marginBottom: 3 },
  address: { fontSize: 8, color: '#64748b', marginBottom: 3 },
  title: { fontSize: 12, fontWeight: 700, marginTop: 4, marginBottom: 3 },
  termLine: { marginTop: 6 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', borderTop: '1 solid #d6dce5', borderBottom: '1 solid #d6dce5', paddingVertical: 8, marginBottom: 12 },
  metaItem: { width: '25%', paddingRight: 6 },
  label: { fontSize: 7, color: '#64748b', marginBottom: 2 },
  table: { borderLeft: '1 solid #aeb8c7', borderTop: '1 solid #aeb8c7' },
  tr: { flexDirection: 'row' },
  th: { backgroundColor: '#eef3f8', fontWeight: 700 },
  cell: { padding: 5, borderRight: '1 solid #aeb8c7', borderBottom: '1 solid #aeb8c7' },
  subject: { flex: 2.4 },
  assessment: { flex: 1, textAlign: 'center' },
  description: { flex: 1.7 },
  summary: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 10 },
  note: { marginTop: 12, borderTop: '1 solid #d6dce5', paddingTop: 8 },
  financial: { marginTop: 14, border: '1 solid #aeb8c7' },
  financialTitle: { backgroundColor: '#eef3f8', padding: 5, fontWeight: 700 },
  financialRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 6, borderTop: '1 solid #d6dce5' },
  financialLabel: { fontWeight: 700 },
  financialLine: { minWidth: 110, textAlign: 'right' },
  signatureBlock: { marginTop: 30 },
  signatureRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, borderTop: '1 solid #777', paddingTop: 6 },
  roleRemark: { marginTop: 6 },
  gradingKey: { marginTop: 12, border: '1 solid #333', width: '100%' },
  gradingKeyHeader: { backgroundColor: '#e6e6e6', textAlign: 'center', fontWeight: 700, paddingVertical: 3, borderBottom: '1 solid #333', fontSize: 11 },
  gradingKeyRow: { flexDirection: 'row' },
  gradingKeyHead: { backgroundColor: '#f9f9f9', borderBottom: '1 solid #333' },
  gradingKeyCell: { flex: 1, width: '12.5%', textAlign: 'center', paddingVertical: 4, paddingHorizontal: 2, borderRight: '1 solid #333', wordBreak: 'keep-all', lineHeight: 1.3 },
  gradingKeyDesc: { fontSize: 6.5, fontWeight: 700 },
})

type PdfProps = {
  tenant: { name: string; logo_url?: string | null; address?: string | null }
  examName: string
  term: string | null
  academicYear: number | null
  className: string
  template: ReturnType<typeof normalizeReportTemplate>
  result: Awaited<ReturnType<typeof getConfiguredAssessmentResults>>['rows'][number]
  openingDate?: string | null
  closingDate?: string | null
  teacherRemarks?: string[]
  principalRemarks?: string[]
  remarkBanks?: RemarkBanks
  gradingScale?: { grade: string; min: number; max: number; description: string; sort_order?: number }[]
  teacherName?: string | null
  principalName?: string | null
}

// React-PDF's text layout engine breaks long words mid-word (with a hyphen)
// when a word exceeds the cell width, and does not honor CSS hyphens/word-break.
// To keep the PERFORMANCE LEVEL KEY header labels on whole-word boundaries, pre-wrap
// each phrase into lines that fit the narrow 8-column cells using explicit newlines.
function wrapDescription(phrase: string, maxChars = 14): string {
  const words = phrase.toUpperCase().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= maxChars) cur = next
    else {
      if (cur) lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines.join('\n')
}

function ReportPage({ tenant, examName, term, academicYear, className, template, result, openingDate, closingDate, remarkBanks, gradingScale = [], teacherName, principalName }: PdfProps) {
  // Both the class teacher's and principal's remarks come from the school's
  // ACTUAL configured remark bank, matched to the learner's overall percentage
  // (spec §26) — never a hard-coded label or the achievement description.
  const overallPercent = result.total != null && result.expectedSubjects > 0 ? (result.total / (result.expectedSubjects * 100)) * 100 : null
  const teacherRemark = remarkBandForPercent(overallPercent, remarkBanks, 'class_teacher')
  const principalRemark = remarkBandForPercent(overallPercent, remarkBanks, 'principal')
  const componentCount = Number(template.assessmentComponents.midTerm) + Number(template.assessmentComponents.endTerm) + Number(template.assessmentComponents.average)
  const singleScoreColumn = componentCount === 1
  const width = Math.max(1, 2.4 + componentCount + Number(template.results.grade) + Number(template.results.gradeDescription) * 1.7)
  const subjectFlex = 2.4 / width
  const assessmentFlex = 1 / width
  const descriptionFlex = 1.7 / width
  const scoreHeader = (label: string) => (singleScoreColumn ? 'Score' : label)
  const metaItems = [
    template.student.name ? { label: 'STUDENT', value: result.fullName } : null,
    template.student.admissionNo ? { label: 'ADM. NO', value: result.admissionNo } : null,
    template.student.className ? { label: 'CLASS', value: className } : null,
    result.streamName ? { label: 'STREAM', value: result.streamName } : null,
    template.results.position ? { label: 'GRADE POSITION', value: result.complete ? `${result.position}` : '—' } : null,
    template.results.position && result.streamPosition !== null ? { label: 'STREAM POSITION', value: `${result.streamPosition}` } : null,
  ].filter(Boolean) as { label: string; value: string }[]
  const metaItemWidth = metaItems.length <= 2 ? '50%' : metaItems.length === 3 ? '33.333%' : '25%'

  return <Page size="A4" style={styles.page}>
    <View style={styles.header}>
      {template.school.logo && tenant.logo_url ? <Image src={tenant.logo_url} style={styles.logo} /> : null}
      {template.school.name ? <Text style={styles.school}>{tenant.name}</Text> : null}
      {template.school.contact && tenant.address ? <Text style={styles.address}>P.O Box: {tenant.address}</Text> : null}
      <Text style={styles.title}>Assessment Report</Text>
      <Text>{template.examination.name && (examName || '').replace(/\s+\d{4}\s*$/, '')}{template.examination.term && term ? ` · ${term}` : ''}{template.examination.academicYear && academicYear ? `, ${academicYear}` : ''}</Text>
    </View>

    <View style={styles.meta}>
      {metaItems.map(item => <View key={item.label} style={[styles.metaItem, { width: metaItemWidth }]}><Text style={styles.label}>{item.label}</Text><Text>{item.value}</Text></View>)}
    </View>

    {template.results.grade && gradingScale.length > 0 && (
      <View style={[styles.gradingKey, { fontSize: gradingScale.length > 4 ? 9 : 10 }]} wrap={false}>
        <Text style={[styles.gradingKeyHeader, { fontSize: gradingScale.length > 4 ? 10 : 11 }]}>PERFORMANCE LEVEL KEY ({gradingScale.length}-LEVEL SCALE)</Text>
        <View style={[styles.tr, styles.gradingKeyHead]}>
          {gradingScale.map(r => <Text key={r.grade} style={[styles.gradingKeyCell, { fontWeight: 700 }]}>{r.grade}</Text>)}
        </View>
        <View style={styles.tr}>
          {gradingScale.map(r => <Text key={r.grade} style={[styles.gradingKeyCell, styles.gradingKeyDesc]}>{wrapDescription(r.description)}</Text>)}
        </View>
        <View style={styles.tr}>
          {gradingScale.map(r => {
            const min = Math.ceil(r.min)
            const max = Math.floor(r.max)
            return <Text key={r.grade} style={styles.gradingKeyCell}>{min === max ? `${min}` : `${min} - ${max}`}</Text>
          })}
        </View>
      </View>
    )}

    {!result.complete && <View style={styles.note}><Text>INCOMPLETE RESULT — required assessment marks are missing. Missing marks are not treated as zero.</Text></View>}

    <View style={styles.table}>
      <View style={[styles.tr, styles.th]}>
        {template.results.learningArea && <Text style={[styles.cell, styles.subject, { flex: subjectFlex }]}>Learning Area</Text>}
        {template.assessmentComponents.midTerm && <Text style={[styles.cell, styles.assessment, { flex: assessmentFlex }]}>{scoreHeader('Mid Term')}</Text>}
        {template.assessmentComponents.endTerm && <Text style={[styles.cell, styles.assessment, { flex: assessmentFlex }]}>{scoreHeader('End Term')}</Text>}
        {template.assessmentComponents.average && <Text style={[styles.cell, styles.assessment, { flex: assessmentFlex }]}>{scoreHeader('Average')}</Text>}
        {template.results.grade && <Text style={[styles.cell, styles.assessment, { flex: assessmentFlex }]}>Level</Text>}
        {template.results.gradeDescription && <Text style={[styles.cell, styles.description, { flex: descriptionFlex }]}>Description</Text>}
      </View>
      {result.subjects.map(s => <View style={styles.tr} key={s.subjectId} wrap={false}>
        {template.results.learningArea && <Text style={[styles.cell, styles.subject, { flex: subjectFlex }]}>{s.subjectName}</Text>}
        {template.assessmentComponents.midTerm && <Text style={[styles.cell, styles.assessment, { flex: assessmentFlex }]}>{s.midTerm === null ? 'ABS' : s.midTerm.toFixed(2)}</Text>}
        {template.assessmentComponents.endTerm && <Text style={[styles.cell, styles.assessment, { flex: assessmentFlex }]}>{s.endTerm === null ? 'ABS' : s.endTerm.toFixed(2)}</Text>}
        {template.assessmentComponents.average && <Text style={[styles.cell, styles.assessment, { flex: assessmentFlex }]}>{s.average === null ? 'ABS' : s.average.toFixed(2)}</Text>}
        {template.results.grade && <Text style={[styles.cell, styles.assessment, { flex: assessmentFlex }]}>{s.grade || '—'}</Text>}
        {template.results.gradeDescription && <Text style={[styles.cell, styles.description, { flex: descriptionFlex }]}>{s.gradeDescription || '—'}</Text>}
      </View>)}
    </View>

    <View style={styles.summary}>
      {template.results.total && (template.assessmentComponents.midTerm || template.assessmentComponents.endTerm || template.assessmentComponents.average) && <Text style={{ fontWeight: 700 }}>TOTAL: {result.total === null ? '—' : `${result.total}`}</Text>}
      {template.results.average && template.assessmentComponents.average && <Text>Average: {result.average === null ? '—' : result.average.toFixed(2)}</Text>}
      {template.results.grade && result.overallLevel && <Text>Overall Performance Level: {result.overallLevel}{result.overallDescription ? ` — ${result.overallDescription}` : ''}</Text>}
      {template.results.position && result.streamPosition !== null && <Text>Stream Position: {result.streamPosition}</Text>}
      {template.results.position && <Text>Grade Position: {result.position ?? '—'}</Text>}
    </View>
    <View style={styles.financial} wrap={false}>
      <Text style={styles.financialTitle}>Financial Information</Text>
      <View style={styles.financialRow}><Text style={styles.financialLabel}>Fee Balance</Text><Text style={styles.financialLine}>________________</Text></View>
      <View style={styles.financialRow}><Text style={styles.financialLabel}>Next Term Fee</Text><Text style={styles.financialLine}>________________</Text></View>
    </View>
    {(openingDate || closingDate) && <View style={{ marginTop: 8 }}><Text style={{ fontSize: 9 }}>School Closes on <Text style={{ fontWeight: 700 }}>{closingDate ?? '_____________'}</Text> and opens on <Text style={{ fontWeight: 700 }}>{openingDate ?? '_____________'}</Text></Text></View>}
    {(template.additional.teacherComment) && (
      <View style={styles.roleRemark}>
        <View style={styles.signatureRow}><Text>Grade Class Teacher: {teacherName || 'Class Teacher&apos;s Name'}</Text><Text>Sign: _____________</Text><Text>Date: _____________</Text></View>
        <Text style={{ marginTop: 6 }}>Class Teacher&apos;s Remark:</Text>
        <Text style={{ marginTop: 3, lineHeight: 1.4, fontSize: 8 }}>{teacherRemark || '______________________________________________'}</Text>
      </View>
    )}
    {(template.additional.overallComment) && (
      <View style={styles.roleRemark}>
        <View style={[styles.signatureRow, { marginTop: 10 }]}><Text>Principal: {principalName || 'Principal&apos;s Name'}</Text><Text>Sign: _____________</Text><Text>Date: _____________</Text></View>
        <Text style={{ marginTop: 6 }}>Principal&apos;s Remark:</Text>
        <Text style={{ marginTop: 3, lineHeight: 1.4, fontSize: 8 }}>{principalRemark || '______________________________________________'}</Text>
      </View>
    )}
  </Page>
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return new Response('No school linked', { status: 403 })
  const throttled = limitAuthenticatedRoute(request.headers, user.id, 'reports-pdf', 30)
  if (throttled) return throttled
  const url = new URL(request.url)
  const examId = url.searchParams.get('exam')
  const classId = url.searchParams.get('class')
  const studentId = url.searchParams.get('student')
  const streamId = url.searchParams.get('stream')?.trim() || undefined
  if (!examId || !classId) return new Response('exam and class are required', { status: 400 })

  const clsRes = await supabase.from('classes').select('id,name,teacher_name,principal_name').eq('id', classId).eq('tenant_id', profile.tenant_id).maybeSingle()
  const cls = clsRes.error
    ? (await supabase.from('classes').select('id,name').eq('id', classId).eq('tenant_id', profile.tenant_id).maybeSingle()).data as { id: string; name: string } | null
    : clsRes.data as { id: string; name: string; teacher_name?: string | null; principal_name?: string | null } | null
  const [{ data: exam }, { data: templateRow }] = await Promise.all([
    supabase.from('exams').select('id,name,term,academic_year').eq('id', examId).eq('tenant_id', profile.tenant_id).maybeSingle(),
    supabase.from('report_templates').select('id,template_json').eq('tenant_id', profile.tenant_id).eq('is_default', true).maybeSingle(),
  ])
  const tenant = await getReportTenant(supabase, profile.tenant_id)
  if (!exam || !cls || !tenant) return new Response('Report scope not found', { status: 404 })
  const scope = {
    className: cls.name,
    teacherName: (cls as { teacher_name?: string | null }).teacher_name ?? null,
    principalName: (cls as { principal_name?: string | null }).principal_name ?? null,
  }
  const template = normalizeReportTemplate(templateRow?.template_json)
  const gradingScale = await getTenantGradingScale(profile.tenant_id)
  const configured = await getConfiguredAssessmentResults(examId, classId, template.assessmentComponents, streamId)
  if (configured.error) return new Response(configured.error, { status: 409 })
  const selected = studentId ? configured.rows.filter(r => r.studentId === studentId) : configured.rows
  if (!selected.length) return new Response('No report data found', { status: 404 })

  const [{ data: config }, remarkBanks] = templateRow?.id
    ? await Promise.all([
        supabase.from('report_template_configs').select('opening_date,closing_date,teacher_remarks_enabled,principal_remarks_enabled').eq('report_template_id', templateRow.id).maybeSingle(),
        getTenantRemarkBanks(profile.tenant_id),
      ])
    : [{ data: null }, undefined]
  const teacherRemarkEnabled = config?.teacher_remarks_enabled !== false
  const principalRemarkEnabled = config?.principal_remarks_enabled !== false
  const banks: RemarkBanks | undefined =
    teacherRemarkEnabled && principalRemarkEnabled
      ? remarkBanks
      : remarkBanks && {
          class_teacher: teacherRemarkEnabled ? remarkBanks.class_teacher : [],
          principal: principalRemarkEnabled ? remarkBanks.principal : [],
        }

  const pdf = await renderToBuffer(<Document>{selected.map(result => <ReportPage key={result.studentId} tenant={tenant} examName={exam.name} term={exam.term} academicYear={exam.academic_year} className={scope.className} template={template} result={result} openingDate={config?.opening_date} closingDate={config?.closing_date} remarkBanks={banks} gradingScale={gradingScale} teacherName={scope.teacherName} principalName={scope.principalName} />)}</Document>)
  const filename = studentId ? `report-${selected[0].admissionNo}.pdf` : `reports-${scope.className.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`
  return new Response(pdf as unknown as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } })
}
