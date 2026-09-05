import { Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { remarkForLevel } from '@/lib/grading'
import type { GradeRule } from '@/lib/grading'
import type { AssessmentReportRow } from '@/lib/results'
import type { ReportTemplate } from '@/lib/report-template'

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
  remarkRow: { marginTop: 6, fontSize: 9 },
  remarkBlockGap: { marginTop: 10 },
  gradingKey: { marginTop: 12, border: '1 solid #333', width: '100%' },
  gradingKeyHeader: { backgroundColor: '#e6e6e6', textAlign: 'center', fontWeight: 700, paddingVertical: 3, borderBottom: '1 solid #333', fontSize: 11 },
  gradingKeyRow: { flexDirection: 'row' },
  gradingKeyHead: { backgroundColor: '#f9f9f9', borderBottom: '1 solid #333' },
  gradingKeyCell: { flex: 1, textAlign: 'center', paddingVertical: 4, paddingHorizontal: 2, borderRight: '1 solid #333' },
  gradingKeyDesc: { fontSize: 8, fontWeight: 700 },
})

export type StandardReportProps = {
  tenant: { name: string; logo_url?: string | null; address?: string | null }
  examName: string
  term: string | null
  academicYear: number | null
  className: string
  template: ReportTemplate
  result: AssessmentReportRow
  openingDate?: string | null
  closingDate?: string | null
  teacherRemarks?: string[]
  principalRemarks?: string[]
  gradingScale?: GradeRule[]
  teacherName?: string | null
  principalName?: string | null
}

export default function StandardReportTemplate({ tenant, examName, term, academicYear, className, template, result, openingDate, closingDate, teacherRemarks, principalRemarks, gradingScale = [], teacherName, principalName }: StandardReportProps) {
  // Both the class teacher's and principal's remarks read from the school's
  // ACTUAL configured remark bank, matched to the learner's overall level
  // (spec §26) — never a hard-coded label or the achievement description.
  const teacherRemark = remarkForLevel(result.overallLevel, gradingScale, teacherRemarks)
  const principalRemark = remarkForLevel(result.overallLevel, gradingScale, principalRemarks)
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
    template.student.className ? { label: 'GRADE', value: className } : null,
    result.streamName ? { label: 'STREAM', value: result.streamName } : null,
  ].filter(Boolean) as { label: string; value: string }[]
  const metaItemWidth = metaItems.length <= 2 ? '50%' : metaItems.length === 3 ? '33.333%' : '25%'

  return <Page size="A4" style={styles.page}>
    <View style={styles.header}>
      {template.school.logo && tenant.logo_url ? <Image src={tenant.logo_url} style={styles.logo} /> : null}
      {template.school.name ? <Text style={styles.school}>{tenant.name}</Text> : null}
      {template.school.contact && tenant.address ? <Text style={styles.address}>P.O Box: {tenant.address}</Text> : null}
      <Text style={styles.title}>Assessment Report</Text>
      <Text>{template.examination.name ? examName : ''}{template.examination.term && term ? ` · ${term}` : ''}{template.examination.academicYear && academicYear ? ` · ${academicYear}` : ''}</Text>
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
    </View>
    <View style={styles.financial} wrap={false}>
      <Text style={styles.financialTitle}>Financial Information</Text>
      <View style={styles.financialRow}><Text style={styles.financialLabel}>Fee Balance</Text><Text style={styles.financialLine}>________________</Text></View>
      <View style={styles.financialRow}><Text style={styles.financialLabel}>Next Term Fee</Text><Text style={styles.financialLine}>________________</Text></View>
    </View>
    {(openingDate || closingDate) && <View style={{ marginTop: 8 }}><Text style={{ fontSize: 9 }}>School Closes on <Text style={{ fontWeight: 700 }}>{closingDate ?? '_____________'}</Text> and opens on <Text style={{ fontWeight: 700 }}>{openingDate ?? '_____________'}</Text></Text></View>}
    {(template.additional.teacherComment || template.additional.signatureArea) && (
      <View style={styles.signatureBlock}>
        <View style={styles.signatureRow}><Text>Grade Teacher: {teacherName || '____________'}</Text><Text>Date: ____________</Text><Text>Sign: ____________</Text></View>
        <Text style={styles.remarkRow}>Remarks: {teacherRemark || '______________________________________________'}</Text>
      </View>
    )}
    {(template.additional.overallComment || template.additional.signatureArea) && (
      <View style={[styles.signatureBlock, styles.remarkBlockGap]}>
        <View style={styles.signatureRow}><Text>Principal: {principalName || '____________'}</Text><Text>Date: ____________</Text><Text>Sign: ____________</Text></View>
        <Text style={styles.remarkRow}>Remarks: {principalRemark || '______________________________________________'}</Text>
      </View>
    )}
  </Page>
}