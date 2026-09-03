import { NextRequest } from 'next/server'
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { getConfiguredAssessmentResults } from '@/lib/results'
import { getReportTenant, normalizeReportTemplate, DEFAULT_TEACHER_REMARKS, DEFAULT_PRINCIPAL_REMARKS } from '@/lib/report-template'
import { getTenantGradingScale, remarkForLevel } from '@/lib/grading'
import React from 'react'

export const runtime = 'nodejs'

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: 'Helvetica' },
  header: { textAlign: 'center', marginBottom: 8 },
  logo: { width: 44, height: 44, objectFit: 'contain', alignSelf: 'center', marginBottom: 4 },
  school: { fontSize: 14, fontWeight: 700, marginBottom: 2 },
  address: { fontSize: 8, color: '#64748b', marginBottom: 2 },
  title: { fontSize: 11, fontWeight: 700, marginTop: 2, marginBottom: 2 },
  termLine: { marginTop: 6 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', borderTop: '1 solid #d6dce5', borderBottom: '1 solid #d6dce5', paddingVertical: 6, marginBottom: 8 },
  metaItem: { width: '25%', paddingRight: 6 },
  label: { fontSize: 7, color: '#64748b', marginBottom: 2 },
  table: { borderLeft: '1 solid #aeb8c7', borderTop: '1 solid #aeb8c7' },
  tr: { flexDirection: 'row' },
  th: { backgroundColor: '#eef3f8', fontWeight: 700 },
  cell: { padding: 4, borderRight: '1 solid #aeb8c7', borderBottom: '1 solid #aeb8c7' },
  subject: { flex: 2.4 },
  assessment: { flex: 1, textAlign: 'center' },
  description: { flex: 1.7 },
  summary: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 6 },
  note: { marginTop: 8, borderTop: '1 solid #d6dce5', paddingTop: 6 },
  financial: { marginTop: 8, border: '1 solid #aeb8c7' },
  financialTitle: { backgroundColor: '#eef3f8', padding: 4, fontWeight: 700 },
  financialRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 5, borderTop: '1 solid #d6dce5' },
  financialLabel: { fontWeight: 700 },
  financialLine: { minWidth: 110, textAlign: 'right' },
  signatureBlock: { marginTop: 16 },
  signatureRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, borderTop: '1 solid #777', paddingTop: 6 },
  signatureRole: { marginTop: 10, borderTop: '1 solid #777', paddingTop: 6 },
  signatureLine: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  signatureRemark: { flexDirection: 'row', gap: 4, marginTop: 4 },
  signatureRemarkLabel: { fontWeight: 700 },
  gradingKey: { marginTop: 8, border: '1 solid #333', width: '100%' },
  gradingKeyHeader: { backgroundColor: '#e6e6e6', textAlign: 'center', fontWeight: 700, paddingVertical: 3, borderBottom: '1 solid #333', fontSize: 11 },
  gradingKeyRow: { flexDirection: 'row' },
  gradingKeyHead: { backgroundColor: '#f9f9f9', borderBottom: '1 solid #333' },
  gradingKeyCell: { flex: 1, textAlign: 'center', paddingVertical: 4, paddingHorizontal: 2, borderRight: '1 solid #333' },
  gradingKeyDesc: { fontSize: 8, fontWeight: 700 },
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
  gradingScale?: { grade: string; min: number; max: number; description: string; sort_order?: number }[]
  teacherName?: string | null
  principalName?: string | null
}

function ReportPage({ tenant, examName, term, academicYear, className, template, result, openingDate, closingDate, teacherRemarks, principalRemarks, gradingScale = [], teacherName, principalName }: PdfProps) {
  const teacherRemark = remarkForLevel(result.overallLevel, gradingScale, teacherRemarks)
  const principalRemark = remarkForLevel(result.overallLevel, gradingScale, principalRemarks)
  const metaItems = [
    { label: 'STUDENT', value: result.fullName },
    { label: 'ADM. NO', value: result.admissionNo },
    { label: 'CLASS', value: className },
    result.streamName ? { label: 'STREAM', value: result.streamName } : null,
    { label: 'GRADE POSITION', value: result.complete ? `${result.position}` : '—' },
    result.streamPosition !== null ? { label: 'STREAM POSITION', value: `${result.streamPosition}` } : null,
  ].filter(Boolean) as { label: string; value: string }[]
  const metaItemWidth = metaItems.length <= 2 ? '50%' : metaItems.length === 3 ? '33.333%' : '25%'

  return <Page size="A4" style={styles.page}>
    <View style={styles.header}>
      {tenant.logo_url ? <Image src={tenant.logo_url} style={styles.logo} /> : null}
      <Text style={styles.school}>{tenant.name}</Text>
      {tenant.address ? <Text style={styles.address}>P.O Box: {tenant.address}</Text> : null}
      <Text style={styles.title}>Assessment Report</Text>
      <Text>{examName}{term ? ` · ${term}` : ''}{academicYear ? ` · ${academicYear}` : ''}</Text>
    </View>

    <View style={styles.meta}>
      {metaItems.map(item => <View key={item.label} style={[styles.metaItem, { width: metaItemWidth }]}><Text style={styles.label}>{item.label}</Text><Text>{item.value}</Text></View>)}
    </View>

    {gradingScale.length > 0 && (
      <View style={[styles.gradingKey, { fontSize: gradingScale.length > 4 ? 9 : 10 }]} wrap={false}>
        <Text style={[styles.gradingKeyHeader, { fontSize: gradingScale.length > 4 ? 10 : 11 }]}>PERFORMANCE LEVEL KEY ({gradingScale.length}-LEVEL SCALE)</Text>
        <View style={[styles.tr, styles.gradingKeyHead]}>
          {gradingScale.map(r => <Text key={r.grade} style={[styles.gradingKeyCell, { fontWeight: 700 }]}>{r.grade}</Text>)}
        </View>
        <View style={styles.tr}>
          {gradingScale.map(r => <Text key={r.grade} style={[styles.gradingKeyCell, styles.gradingKeyDesc]}>{r.description.toUpperCase()}</Text>)}
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
        <Text style={[styles.cell, styles.subject, { flex: 0.3 }]}>Learning Area</Text>
        <Text style={[styles.cell, styles.assessment, { flex: 0.22 }]}>Mid Term</Text>
        <Text style={[styles.cell, styles.assessment, { flex: 0.22 }]}>End Term</Text>
        <Text style={[styles.cell, styles.assessment, { flex: 0.22 }]}>Average</Text>
        <Text style={[styles.cell, styles.assessment, { flex: 0.12 }]}>Level</Text>
        <Text style={[styles.cell, styles.description, { flex: 0.22 }]}>Description</Text>
      </View>
      {result.subjects.map(s => <View style={styles.tr} key={s.subjectId} wrap={false}>
        <Text style={[styles.cell, styles.subject, { flex: 0.3 }]}>{s.subjectName}</Text>
        <Text style={[styles.cell, styles.assessment, { flex: 0.22 }]}>{s.midTerm === null ? 'ABS' : s.midTerm.toFixed(2)}</Text>
        <Text style={[styles.cell, styles.assessment, { flex: 0.22 }]}>{s.endTerm === null ? 'ABS' : s.endTerm.toFixed(2)}</Text>
        <Text style={[styles.cell, styles.assessment, { flex: 0.22 }]}>{s.average === null ? 'ABS' : s.average.toFixed(2)}</Text>
        <Text style={[styles.cell, styles.assessment, { flex: 0.12 }]}>{s.grade || '—'}</Text>
        <Text style={[styles.cell, styles.description, { flex: 0.22 }]}>{s.gradeDescription || '—'}</Text>
      </View>)}
    </View>

    <View style={styles.summary}>
      <Text style={{ fontWeight: 700 }}>TOTAL: {result.total === null ? '—' : `${result.total}`}</Text>
      <Text>Average: {result.average === null ? '—' : result.average.toFixed(2)}</Text>
      {result.overallLevel && <Text>Overall Performance Level: {result.overallLevel}{result.overallDescription ? ` — ${result.overallDescription}` : ''}</Text>}
      {result.streamPosition !== null && <Text>Stream Position: {result.streamPosition}</Text>}
      <Text>Grade Position: {result.position ?? '—'}</Text>
    </View>

    <View style={styles.financial} wrap={false}>
      <Text style={styles.financialTitle}>Financial Information</Text>
      <View style={styles.financialRow}><Text style={styles.financialLabel}>Fee Balance</Text><Text style={styles.financialLine}>________________</Text></View>
      <View style={styles.financialRow}><Text style={styles.financialLabel}>Next Term Fee</Text><Text style={styles.financialLine}>________________</Text></View>
    </View>

    {(openingDate || closingDate) && <View style={{ marginTop: 6 }}><Text style={{ fontSize: 9 }}>School Closes on <Text style={{ fontWeight: 700 }}>{closingDate ?? '_____________'}</Text> and opens on <Text style={{ fontWeight: 700 }}>{openingDate ?? '_____________'}</Text></Text></View>}

    <View style={styles.signatureBlock}>
      <View style={styles.signatureRole}>
        <View style={styles.signatureLine}>
          <Text>Class Teacher: ({teacherName || '________________'})</Text>
          <Text>Sign: ________</Text>
          <Text>Date: ______</Text>
        </View>
        <View style={styles.signatureRemark}>
          <Text style={styles.signatureRemarkLabel}>Remark: </Text>
          <Text>{teacherRemark || '____________________________'}</Text>
        </View>
      </View>
      <View style={[styles.signatureRole, { marginTop: 12 }]}>
        <View style={styles.signatureLine}>
          <Text>Principal: ({principalName || '________________'})</Text>
          <Text>Sign: ________</Text>
          <Text>Date: ______</Text>
        </View>
        <View style={styles.signatureRemark}>
          <Text style={styles.signatureRemarkLabel}>Remark: </Text>
          <Text>{principalRemark || '____________________________'}</Text>
        </View>
      </View>
    </View>
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

  const [{ data: config }, { data: teacherRows }, { data: principalRows }] = templateRow?.id ? await Promise.all([
    supabase.from('report_template_configs').select('opening_date,closing_date,teacher_remarks_enabled,principal_remarks_enabled').eq('report_template_id', templateRow.id).maybeSingle(),
    supabase.from('report_teacher_remarks').select('remark,sort_order').eq('report_template_id', templateRow.id).order('sort_order'),
    supabase.from('report_principal_remarks').select('remark,sort_order').eq('report_template_id', templateRow.id).order('sort_order'),
  ]) : [{ data: null }, { data: null }, { data: null }]
  const teacherRemarks = teacherRows?.map(r => r.remark).length ? teacherRows.map(r => r.remark) : DEFAULT_TEACHER_REMARKS
  const principalRemarks = principalRows?.map(r => r.remark).length ? principalRows.map(r => r.remark) : DEFAULT_PRINCIPAL_REMARKS

  const pdf = await renderToBuffer(<Document>{selected.map(result => <ReportPage key={result.studentId} tenant={tenant} examName={exam.name} term={exam.term} academicYear={exam.academic_year} className={scope.className} template={template} result={result} openingDate={config?.opening_date} closingDate={config?.closing_date} teacherRemarks={teacherRemarks} principalRemarks={principalRemarks} gradingScale={gradingScale} teacherName={scope.teacherName} principalName={scope.principalName} />)}</Document>)
  const filename = studentId ? `report-${selected[0].admissionNo}.pdf` : `reports-${scope.className.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`
  return new Response(pdf as unknown as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } })
}
