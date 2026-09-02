import { NextRequest } from 'next/server'
import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { getAssessmentAnalysis } from '@/lib/analysis'
import { getReportTenant } from '@/lib/report-template'
import type { GradeAnalysis } from '@/lib/analysis-types'

export const runtime = 'nodejs'

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica' },
  header: { textAlign: 'center', marginBottom: 6 },
  logo: { width: 42, height: 42, objectFit: 'contain', alignSelf: 'center', marginBottom: 4 },
  school: { fontSize: 15, fontWeight: 700, marginBottom: 2 },
  title: { fontSize: 11, fontWeight: 700, letterSpacing: 1, marginTop: 4 },
  gradeHeading: { fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 4, borderBottom: '1 solid #aeb8c7', paddingBottom: 2 },
  kpiRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  kpi: { flex: 1, border: '1 solid #cbd5e1', borderRadius: 4, padding: 5 },
  kpiLabel: { fontSize: 6, color: '#64748b', marginBottom: 1 },
  kpiValue: { fontSize: 9, fontWeight: 700 },
  kpiSub: { fontSize: 6, color: '#475569', marginTop: 1 },
  table: { borderLeft: '1 solid #aeb8c7', borderTop: '1 solid #aeb8c7', marginBottom: 8 },
  tr: { flexDirection: 'row' },
  th: { backgroundColor: '#eef3f8', fontWeight: 700 },
  cell: { paddingVertical: 3, paddingHorizontal: 3, borderRight: '1 solid #aeb8c7', borderBottom: '1 solid #aeb8c7' },
  footer: { position: 'absolute', bottom: 24, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 6, color: '#94a3b8', borderTop: '1 solid #e2e8f0', paddingTop: 4 },
  chartTitle: { fontSize: 9, fontWeight: 700, marginTop: 8, marginBottom: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  barLabel: { width: 110, fontSize: 7, color: '#334155', paddingRight: 4 },
  barTrack: { flex: 1, flexDirection: 'row', alignItems: 'center' as const },
  barFill: { height: 9, borderRadius: 2 },
  barValue: { width: 40, fontSize: 7, color: '#475569', textAlign: 'right' as const, paddingLeft: 4 },
})

const BAR_COLORS = ['#122447', '#14335c', '#1d4e8f', '#2f6fbf', '#4a90d9', '#6aa8e0', '#88bbe8', '#a5ccee']

const P = {
    adm: { width: 52 },
    name: { flex: 1 } as { flex: number },
    stream: { width: 68 },
    total: { width: 42, textAlign: 'center' as const },
    percent: { width: 40, textAlign: 'center' as const },
    level: { width: 46, textAlign: 'center' as const },
  }

type AnalysisPdfProps = {
  tenant: { name: string; code: string | null; logo_url: string | null; address: string | null }
  examName: string
  term: string | null
  academicYear: number | null
  grades: GradeAnalysis[]
}

function BarChart({ data, suffix = '' }: { data: { label: string; value: number; color: string }[]; suffix?: string }) {
  const ceiling = Math.max(100, ...data.map(d => d.value))
  return (
    <View style={{ marginBottom: 6 }}>
      {data.map(d => (
        <View style={styles.barRow} key={d.label} wrap={false}>
          <Text style={styles.barLabel}>{d.label}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.max(2, (d.value / ceiling) * 100)}%`, backgroundColor: d.color }]} />
          </View>
          <Text style={styles.barValue}>{d.value}{suffix}</Text>
        </View>
      ))}
    </View>
  )
}

function AnalysisPdf({ tenant, examName, term, academicYear, grades }: AnalysisPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt prop */}
          {tenant.logo_url ? <Image src={tenant.logo_url} style={styles.logo} /> : null}
          <Text style={styles.school}>{tenant.name}</Text>
          {tenant.address ? <Text style={{ fontSize: 7, marginTop: 1 }}>P.O Box: {tenant.address}</Text> : null}
          {tenant.code ? <Text style={{ fontSize: 7, marginTop: 1 }}>School Code: {tenant.code}</Text> : null}
          <Text style={styles.title}>ASSESSMENT ANALYSIS</Text>
          <Text style={{ fontSize: 8, marginTop: 3 }}>
            {[examName, term, academicYear].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {grades.map(grade => (
          <View key={grade.classId} wrap={false}>
            <Text style={styles.gradeHeading}>{grade.className}</Text>

            <View style={styles.kpiRow}>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>LEARNERS ASSESSED</Text>
                <Text style={styles.kpiValue}>{grade.assessedCount}</Text>
                <Text style={styles.kpiSub}>of {grade.learnerCount} enrolled</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>CLASS MEAN %</Text>
                <Text style={styles.kpiValue}>{grade.averagePercent === null ? '—' : `${grade.averagePercent}%`}</Text>
                <Text style={styles.kpiSub}>Mean total {grade.averageTotal ?? '—'}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>TOP LEARNER</Text>
                <Text style={styles.kpiValue}>{grade.topLearner ?? '—'}</Text>
                <Text style={styles.kpiSub}>Total {grade.topTotal ?? '—'}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>LEARNING AREAS</Text>
                <Text style={styles.kpiValue}>{grade.learningAreas.length}</Text>
                <Text style={styles.kpiSub}></Text>
              </View>
            </View>

            {grade.levelDistribution.length > 0 && (
              <>
                <Text style={styles.chartTitle}>Performance Level Distribution</Text>
                <BarChart
                  data={grade.levelDistribution.map((l, i) => ({
                    label: `${l.grade} · ${l.description}`,
                    value: l.count,
                    color: BAR_COLORS[i % BAR_COLORS.length],
                  }))}
                  suffix=""
                />
              </>
            )}

            {grade.learningAreas.length > 0 && (
              <>
                <Text style={styles.chartTitle}>Learning Area Averages (Mean %)</Text>
                <BarChart
                  data={grade.learningAreas.map((a, i) => ({
                    label: a.subjectName,
                    value: a.average === null ? 0 : a.average,
                    color: BAR_COLORS[i % BAR_COLORS.length],
                  }))}
                  suffix="%"
                />
              </>
            )}

            {grade.streams.length > 0 && (
              <View style={styles.table}>
                <View style={[styles.tr, styles.th]}>
                  <Text style={[styles.cell, { flex: 1 }]}>Stream</Text>
                  <Text style={[styles.cell, { width: 60, textAlign: 'center' }]}>Mean Total</Text>
                  <Text style={[styles.cell, { width: 50, textAlign: 'center' }]}>Assessed</Text>
                  <Text style={[styles.cell, { flex: 1 }]}>Top Learner</Text>
                </View>
                {grade.streams.map(s => (
                  <View style={styles.tr} key={s.streamId}>
                    <Text style={[styles.cell, { flex: 1, fontWeight: 700 }]}>{s.streamName}</Text>
                    <Text style={[styles.cell, { width: 60, textAlign: 'center' }]}>{s.averageTotal ?? '—'}</Text>
                    <Text style={[styles.cell, { width: 50, textAlign: 'center' }]}>{s.assessedCount}/{s.learnerCount}</Text>
                    <Text style={[styles.cell, { flex: 1 }]}>{s.topLearner ?? '—'}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.table}>
              <View style={[styles.tr, styles.th]}>
                <Text style={[styles.cell, P.adm]}>Adm No</Text>
                <Text style={[styles.cell, P.name]}>Learner</Text>
                {grade.streams.length > 0 && <Text style={[styles.cell, P.stream]}>Stream</Text>}
                <Text style={[styles.cell, P.total]}>Total</Text>
                <Text style={[styles.cell, P.percent]}>%</Text>
                <Text style={[styles.cell, P.level]}>Level</Text>
              </View>
              {grade.learners.length === 0 && (
                <View style={styles.tr}>
                  <Text style={[styles.cell, P.name]}>No learners found for this grade.</Text>
                </View>
              )}
              {grade.learners.map(l => (
                <View style={styles.tr} wrap={false} key={l.studentId}>
                  <Text style={[styles.cell, P.adm]}>{l.admissionNo}</Text>
                  <Text style={[styles.cell, P.name]}>{l.fullName}</Text>
                  {grade.streams.length > 0 && <Text style={[styles.cell, P.stream]}>{l.streamName ?? '—'}</Text>}
                  <Text style={[styles.cell, P.total]}>{l.total ?? '—'}</Text>
                  <Text style={[styles.cell, P.percent]}>{l.percent === null ? '—' : `${l.percent.toFixed(1)}%`}</Text>
                  <Text style={[styles.cell, P.level]}>{l.overallLevel || 'Incomplete'}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <Text>Generated by E-REPORTS</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} fixed />
        </View>
      </Page>
    </Document>
  )
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return new Response('No school linked', { status: 403 })
  const throttled = limitAuthenticatedRoute(request.headers, user.id, 'export-analysis-pdf', 30)
  if (throttled) return throttled
  const tenant = await getReportTenant(supabase, profile.tenant_id)

  const url = new URL(request.url)
  const examId = url.searchParams.get('exam')?.trim()
  const classId = url.searchParams.get('class')?.trim()
  if (!examId) return new Response('exam is required', { status: 400 })

  const analysis = await getAssessmentAnalysis(examId)
  if ('error' in analysis) return new Response(analysis.error, { status: 400 })

  const grades = classId ? analysis.grades.filter(g => g.classId === classId) : analysis.grades
  if (grades.length === 0) return new Response('No grades found for this assessment selection.', { status: 404 })

  const pdf = await renderToBuffer(
    <AnalysisPdf
      tenant={tenant ?? { name: 'School', code: null, logo_url: null, address: null }}
      examName={analysis.examName}
      term={analysis.term}
      academicYear={analysis.academicYear}
      grades={grades}
    />,
  )

  const safeExam = analysis.examName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'exam'

  return new Response(pdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="analysis-${safeExam}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}