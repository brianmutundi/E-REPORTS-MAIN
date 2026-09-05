'use client'

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import type { TranscriptData } from '@/lib/transcript'

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#0f172a' },
  header: { marginBottom: 8, textAlign: 'center' },
  schoolName: { fontSize: 16, fontWeight: 800, color: '#0f172a', textAlign: 'center' },
  title: { fontSize: 20, fontWeight: 900, color: '#0f172a', textAlign: 'center', marginTop: 6 },
  meta: { display: 'flex', flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12, fontSize: 10, color: '#334155', columnGap: 14 },
  bold: { fontWeight: 700 },
  tableOuter: { marginTop: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 4, overflow: 'hidden' },
  headRow: { display: 'flex', flexDirection: 'row', backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  th: { flexGrow: 1, flexShrink: 0, flexBasis: 0, paddingVertical: 5, paddingHorizontal: 4, fontSize: 8, fontWeight: 700, color: '#334155', borderRightWidth: 1, borderRightColor: '#cbd5e1', textAlign: 'center' },
  thLabel: { flexGrow: 2, flexShrink: 0, flexBasis: 0, paddingVertical: 5, paddingHorizontal: 4, fontSize: 8, fontWeight: 700, color: '#334155', borderRightWidth: 1, borderRightColor: '#cbd5e1', textAlign: 'left' },
  tr: { display: 'flex', flexDirection: 'row' },
  td: { flexGrow: 1, flexShrink: 0, flexBasis: 0, paddingVertical: 4, paddingHorizontal: 4, fontSize: 9, color: '#0f172a', borderRightWidth: 1, borderRightColor: '#e2e8f0', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', textAlign: 'center' },
  tdLabel: { flexGrow: 2, flexShrink: 0, flexBasis: 0, paddingVertical: 4, paddingHorizontal: 4, fontSize: 9, color: '#0f172a', borderRightWidth: 1, borderRightColor: '#e2e8f0', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', textAlign: 'left', lineHeight: 1.3 },
  sigOuter: { marginTop: 40, borderTopWidth: 1, borderTopColor: '#cbd5e1', paddingTop: 12, display: 'flex', flexDirection: 'row', justifyContent: 'space-between' },
  sigText: { fontSize: 10, color: '#475569' },
  footer: { marginTop: 24, fontSize: 8, color: '#94a3b8', textAlign: 'center' },
})

export default function TranscriptPage({ data }: { data: TranscriptData }) {
  const { student, className, tenant, subjects, exams } = data
  const generatedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <Page size="A4" style={s.page}>
      {tenant?.logo_url ? (
        <View style={s.header}>
          <Image src={tenant.logo_url} style={{ width: 56, height: 56, objectFit: 'contain', margin: '0 auto' }} />
          <Text style={s.schoolName}>{tenant.name}</Text>
        </View>
      ) : (
        <Text style={{ ...s.schoolName, marginBottom: 8, textAlign: 'center' }}>{tenant?.name}</Text>
      )}

      <Text style={{ ...s.title, textAlign: 'center', marginBottom: 14 }}>ACADEMIC TRANSCRIPT</Text>

      <View style={s.meta}>
        <Text><Text style={s.bold}>Name: </Text>{student.fullName}</Text>
        <Text><Text style={s.bold}>Adm No: </Text>{student.admissionNo}</Text>
        <Text><Text style={s.bold}>Grade: </Text>{className}</Text>
        <Text><Text style={s.bold}>Stream: </Text>{student.streamName ?? '—'}</Text>
      </View>

      {exams.length > 0 ? (
        <View style={s.tableOuter}>
          <View style={s.headRow}>
            <Text style={s.thLabel}>Exam</Text>
            {subjects.map(sub => <Text key={sub.subjectId} style={s.th}>{sub.subjectName}</Text>)}
            <Text style={s.th}>Total</Text>
            <Text style={s.th}>Average</Text>
            <Text style={s.th}>Level</Text>
          </View>
          {exams.map((exam, idx) => (
            <View key={exam.examId} style={{ ...s.tr, borderBottomWidth: idx === exams.length - 1 ? 0 : 1, borderBottomColor: '#e2e8f0' }}>
              <Text style={s.tdLabel}>
                {exam.term ? `${exam.term} ` : ''}{exam.academicYear ? String(exam.academicYear) : ''}
                {'\n'}{exam.examName}
              </Text>
              {subjects.map((sub, subIdx) => (
                <Text key={sub.subjectId} style={s.td}>{exam.scores[subIdx] != null ? exam.scores[subIdx] : ''}</Text>
              ))}
              <Text style={s.td}>{exam.total != null ? exam.total : ''}</Text>
              <Text style={s.td}>{exam.average != null ? exam.average.toFixed(1) : ''}</Text>
              <Text style={s.td}>{exam.overallLevel || '—'}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 10, color: '#64748b', textAlign: 'center', marginTop: 20 }}>No assessment data available for this grade.</Text>
      )}

      <View style={s.sigOuter}>
        <Text style={s.sigText}>Class Teacher: ___________________________ Sign: ____________ Date: ____________</Text>
        <Text style={s.sigText}>Principal: ___________________________ Sign: ____________ Date: ____________</Text>
      </View>

      <Text style={s.footer}>Generated on {generatedOn}</Text>
    </Page>
  )
}