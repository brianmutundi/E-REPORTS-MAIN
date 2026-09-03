import { NextRequest } from 'next/server'
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { getReportRows, reportTypeIsSnapshot, type ReportType } from '@/lib/results'
import { getReportTenant } from '@/lib/report-template'
import { getTenantGradingScale, getTenantRemarkBanks, remarkBandForPercent, type RemarkBanks } from '@/lib/grading'
import React from 'react'

export const runtime = 'nodejs'

const ACCENT = '#1e6fd9'

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: 'Helvetica' },
  headerBand: { flexDirection: 'row', alignItems: 'center', backgroundColor: ACCENT, padding: 12, marginBottom: 10 },
  headerText: { flex: 1 },
  logo: { width: 40, height: 40, objectFit: 'contain', marginRight: 10, backgroundColor: '#ffffff' },
  school: { fontSize: 15, fontWeight: 700, color: '#ffffff', marginBottom: 2 },
  address: { fontSize: 8, color: '#e6eefb', marginBottom: 1 },
  reportType: { fontSize: 8, color: '#dbe7f8', fontWeight: 700 },
  learnerBar: { flexDirection: 'row', flexWrap: 'wrap', border: '1 solid #d6dce5', borderRadius: 4, marginBottom: 8 },
  learnerItem: { width: '25%', padding: 6 },
  learnerKey: { fontSize: 6.5, color: '#64748b', marginBottom: 1, textTransform: 'uppercase' },
  metaLine: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8, fontSize: 8, color: '#334155' },
  metaItem: { marginRight: 14, marginBottom: 2 },
  table: { borderLeft: '1 solid #c3cdd9', borderTop: '1 solid #c3cdd9', marginBottom: 8 },
  tr: { flexDirection: 'row' },
  th: { backgroundColor: '#eef4fb', fontWeight: 700 },
  cell: { padding: 5, borderRight: '1 solid #c3cdd9', borderBottom: '1 solid #c3cdd9' },
  colSubject: { flex: 2.2 },
  colMark: { flex: 1, textAlign: 'center' },
  colLevel: { flex: 0.9, textAlign: 'center' },
  colDesc: { flex: 1.6 },
  colPos: { flex: 0.9, textAlign: 'center' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', border: '1 solid #c3cdd9', borderRadius: 4, padding: 8, marginBottom: 10 },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 16, marginBottom: 2 },
  summaryKey: { fontSize: 8, color: '#64748b' },
  remarks: { marginBottom: 12 },
  remark: { marginBottom: 8 },
  remarkLabel: { fontSize: 8, fontWeight: 700, color: '#334155', marginBottom: 2 },
  remarkText: { fontSize: 8, color: '#0f172a', lineHeight: 1.4 },
  signatureBlock: { borderTop: '1 solid #777', paddingTop: 6 },
  signatureRole: { marginTop: 10 },
  signatureLine: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, fontSize: 8 },
  gradingKey: { marginTop: 10, border: '1 solid #1e293b', width: '100%' },
  gradingKeyHeader: { backgroundColor: '#e6e6e6', textAlign: 'center', fontWeight: 700, paddingVertical: 3, borderBottom: '1 solid #1e293b', fontSize: 10 },
  gradingKeyRow: { flexDirection: 'row' },
  gradingKeyHead: { backgroundColor: '#f9f9f9', borderBottom: '1 solid #1e293b' },
  gradingKeyCell: { flex: 1, textAlign: 'center', paddingVertical: 3, paddingHorizontal: 2, borderRight: '1 solid #1e293b' },
  gradingKeyDesc: { fontSize: 7, fontWeight: 700 },
})

type PdfProps = {
  tenant: { name: string; logo_url?: string | null; address?: string | null }
  reportType: ReportType
  className: string
  reportLabel: string
  term: string | null
  academicYear: number | null
  result: Awaited<ReturnType<typeof getReportRows>>['rows'][number]
  gradingScale?: { grade: string; min: number; max: number; description: string; sort_order?: number }[]
  remarkBanks: RemarkBanks
  teacherName?: string | null
  principalName?: string | null
}

function ReportPage({ tenant, reportType, className, reportLabel, term, academicYear, result, gradingScale = [], remarkBanks, teacherName, principalName }: PdfProps) {
  const isSnapshot = reportTypeIsSnapshot(reportType)
  const isAggregate = reportType === 'termly_average' || reportType === 'yearly_average'
  const teacherRemark = remarkBandForPercent(result.overallPercent, remarkBanks, 'class_teacher')
  const principalRemark = remarkBandForPercent(result.overallPercent, remarkBanks, 'principal')
  const markHeader = isSnapshot ? 'Marks' : 'Mean'

  return <Page size="A4" style={styles.page}>
    <View style={styles.headerBand}>
      {tenant.logo_url ? <Image src={tenant.logo_url} style={styles.logo} /> : null}
      <View style={styles.headerText}>
        <Text style={styles.school}>{tenant.name}</Text>
        {tenant.address ? <Text style={styles.address}>P.O Box: {tenant.address}</Text> : null}
        <Text style={styles.reportType}>Assessment Report — {reportLabel}</Text>
      </View>
    </View>

    <View style={styles.learnerBar}>
      <View style={styles.learnerItem}><Text style={styles.learnerKey}>Student</Text><Text>{result.fullName}</Text></View>
      <View style={styles.learnerItem}><Text style={styles.learnerKey}>Adm. No</Text><Text>{result.admissionNo}</Text></View>
      <View style={styles.learnerItem}><Text style={styles.learnerKey}>Class</Text><Text>{className}</Text></View>
      <View style={styles.learnerItem}><Text style={styles.learnerKey}>Stream</Text><Text>{result.streamName ?? '—'}</Text></View>
    </View>

    <View style={styles.metaLine}>
      <Text style={styles.metaItem}>Report Type: <Text style={{ fontWeight: 700 }}>{reportLabel}</Text></Text>
      {academicYear ? <Text style={styles.metaItem}>Academic Year: <Text style={{ fontWeight: 700 }}>{academicYear}</Text></Text> : null}
      {term ? <Text style={styles.metaItem}>Term: <Text style={{ fontWeight: 700 }}>{term}</Text></Text> : null}
      {reportType === 'yearly_average' && result.partialTerms !== undefined ? <Text style={styles.metaItem}>{result.partialTerms} of 3 terms recorded</Text> : null}
    </View>

    <View style={styles.table}>
      <View style={[styles.tr, styles.th]}>
        <Text style={[styles.cell, styles.colSubject]}>Learning Area</Text>
        <Text style={[styles.cell, styles.colMark]}>{markHeader}</Text>
        <Text style={[styles.cell, styles.colLevel]}>Level</Text>
        <Text style={[styles.cell, styles.colDesc]}>Description</Text>
        <Text style={[styles.cell, styles.colPos]}>Position</Text>
      </View>
      {result.subjects.map(s => <View style={styles.tr} key={s.subjectId} wrap={false}>
        <Text style={[styles.cell, styles.colSubject]}>{s.subjectName}</Text>
        <Text style={[styles.cell, styles.colMark]}>{s.mark === null ? 'ABS' : s.mark.toFixed(2)}</Text>
        <Text style={[styles.cell, styles.colLevel]}>{s.grade || '—'}</Text>
        <Text style={[styles.cell, styles.colDesc]}>{s.gradeDescription || '—'}</Text>
        <Text style={[styles.cell, styles.colPos]}>{result.position ?? '—'}</Text>
      </View>)}
    </View>

    <View style={styles.summary}>
      <View style={styles.summaryItem}><Text style={styles.summaryKey}>Total</Text><Text style={{ fontWeight: 700 }}>{result.total === null ? '—' : `${Math.round(result.total * 100) / 100}`}</Text></View>
      {isAggregate && <View style={styles.summaryItem}><Text style={styles.summaryKey}>Average / Mean</Text><Text style={{ fontWeight: 700 }}>{result.average === null ? '—' : result.average.toFixed(2)}</Text></View>}
      <View style={styles.summaryItem}><Text style={styles.summaryKey}>Overall Position</Text><Text style={{ fontWeight: 700 }}>{result.complete ? result.position : '—'}</Text></View>
      {result.overallPercent !== null && <View style={styles.summaryItem}><Text style={styles.summaryKey}>Overall</Text><Text style={{ fontWeight: 700, color: ACCENT }}>{result.overallLevel}{result.overallDescription ? ` · ${result.overallDescription}` : ''}</Text></View>}
    </View>

    {gradingScale.length > 0 && (
      <View style={styles.gradingKey} wrap={false}>
        <Text style={styles.gradingKeyHeader}>PERFORMANCE LEVEL KEY ({gradingScale.length}-LEVEL SCALE)</Text>
        <View style={[styles.gradingKeyRow, styles.gradingKeyHead]}>
          {gradingScale.map((r, i) => <Text key={i} style={[styles.gradingKeyCell, { fontWeight: 700 }]}>{r.grade}</Text>)}
        </View>
        <View style={styles.gradingKeyRow}>
          {gradingScale.map((r, i) => <Text key={i} style={[styles.gradingKeyCell, styles.gradingKeyDesc]}>{r.description.toUpperCase()}</Text>)}
        </View>
        <View style={styles.gradingKeyRow}>
          {gradingScale.map((r, i) => {
            const min = Math.ceil(r.min)
            const max = Math.floor(r.max)
            return <Text key={i} style={styles.gradingKeyCell}>{min === max ? `${min}` : `${min} - ${max}`}</Text>
          })}
        </View>
      </View>
    )}

    <View style={styles.remarks}>
      <View style={styles.remark}><Text style={styles.remarkLabel}>Class Teacher&apos;s Remark</Text><Text style={styles.remarkText}>{teacherRemark || '—'}</Text></View>
      <View style={styles.remark}><Text style={styles.remarkLabel}>Head Teacher&apos;s Remark</Text><Text style={styles.remarkText}>{principalRemark || '—'}</Text></View>
    </View>

    <View style={styles.signatureBlock}>
      <View style={styles.signatureRole}>
        <View style={styles.signatureLine}><Text>Class Teacher: ({teacherName || '________________'})</Text><Text>Sign: ________</Text><Text>Date: ______</Text></View>
      </View>
      <View style={styles.signatureRole}>
        <View style={styles.signatureLine}><Text>Head Teacher: ({principalName || '________________'})</Text><Text>Sign: ________</Text><Text>Date: ______</Text></View>
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
  const classId = url.searchParams.get('class')
  const typeParam = url.searchParams.get('type')
  const studentId = url.searchParams.get('student')
  const streamId = url.searchParams.get('stream')?.trim() || undefined
  if (!classId || !typeParam) return new Response('class and type are required', { status: 400 })
  const REPORT_TYPES = ['test', 'mid_term', 'end_term', 'termly_average', 'yearly_average'] as const
  if (!(REPORT_TYPES as readonly string[]).includes(typeParam)) return new Response('Invalid report type', { status: 400 })
  const reportType = typeParam as ReportType

  const clsRes = await supabase.from('classes').select('id,name,teacher_name,principal_name').eq('id', classId).eq('tenant_id', profile.tenant_id).maybeSingle()
  const cls = clsRes.error ? null : clsRes.data
  if (!cls) return new Response('Class not found', { status: 404 })
  const tenant = await getReportTenant(supabase, profile.tenant_id)
  if (!tenant) return new Response('Report scope not found', { status: 404 })

  const reportData = await getReportRows({
    reportType,
    classId,
    examId: reportTypeIsSnapshot(reportType) ? (url.searchParams.get('exam') ?? undefined) : undefined,
    term: reportType === 'termly_average' ? (url.searchParams.get('term') ?? undefined) : undefined,
    academicYear: (reportType === 'yearly_average' || reportType === 'termly_average') ? (url.searchParams.get('year') ? Number(url.searchParams.get('year')) : undefined) : undefined,
    streamId,
  })
  if (reportData.error) return new Response(reportData.error, { status: 409 })
  const selected = studentId ? reportData.rows.filter(r => r.studentId === studentId) : reportData.rows
  if (!selected.length) return new Response('No report data found', { status: 404 })

  const gradingScale = await getTenantGradingScale(profile.tenant_id)
  const remarkBanks = await getTenantRemarkBanks(profile.tenant_id)

  const pdf = await renderToBuffer(<Document>{selected.map(result => <ReportPage key={result.studentId} tenant={tenant} reportType={reportType} className={cls.name!} reportLabel={reportData.examName} term={reportData.term} academicYear={reportData.academicYear} result={result} gradingScale={gradingScale} remarkBanks={remarkBanks} teacherName={cls.teacher_name} principalName={cls.principal_name} />)}</Document>)
  const filename = studentId ? `report-${selected[0].admissionNo}.pdf` : `reports-${cls.name!.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`
  return new Response(pdf as unknown as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } })
}
