import { createClient } from '@/lib/supabase/server'
import { getReportTenant, type ReportTenant } from '@/lib/report-template'
import { computeTotal, getTotalLevel, getTotalDescription, getTenantGradingScale, getTenantTotalGradingScale, type GradeRule, type TotalGradingScale } from './grading'

export type TranscriptSubject = { subjectId: string; subjectName: string }

export type TranscriptExamRow = {
  examId: string
  examName: string
  term: string | null
  academicYear: number | null
  scores: (number | null)[]
  total: number | null
  average: number | null
  overallLevel: string
  overallDescription: string
}

export type TranscriptStudent = {
  studentId: string
  admissionNo: string
  fullName: string
  streamName: string | null
}

export type TranscriptData = {
  student: TranscriptStudent
  className: string
  tenant: ReportTenant | null
  subjects: TranscriptSubject[]
  exams: TranscriptExamRow[]
  scale: readonly GradeRule[]
  teacherName: string | null
  principalName: string | null
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export async function getTranscriptForClass(classId: string): Promise<TranscriptData[]> {
  const supabase = await createClient()
  const { data: cls } = await supabase
    .from('classes')
    .select('id,name,tenant_id,teacher_name,principal_name')
    .eq('id', classId)
    .maybeSingle()
  if (!cls) return []

  const tenantId = cls.tenant_id as string
  const [studentRes, streamRes, examsRes, examClassRes, examClassSubjectRes, scale, totalScale, tenant] = await Promise.all([
    supabase.from('students').select('id,admission_no,full_name,stream_id').eq('class_id', classId).eq('tenant_id', tenantId).order('full_name'),
    supabase.from('streams').select('id,name').eq('tenant_id', tenantId).eq('class_id', classId).order('name'),
    supabase.from('exams').select('id,name,term,academic_year,created_at').eq('tenant_id', tenantId).order('created_at'),
    supabase.from('exam_classes').select('exam_id').eq('class_id', classId),
    supabase.from('exam_class_subjects').select('exam_id,subject_id'),
    getTenantGradingScale(tenantId),
    getTenantTotalGradingScale(tenantId),
    getReportTenant(supabase, tenantId),
  ])
  const students = studentRes.data ?? []
  const streamRows = streamRes.data ?? []
  const exams = examsRes.data ?? []
  const examClassRows = examClassRes.data ?? []
  const examClassSubjectRows = examClassSubjectRes.data ?? []

  const streamNameById = new Map(streamRows.map(s => [s.id, s.name]))
  const allowedExamIds = new Set(examClassRows.map(e => e.exam_id))
  const filteredExams = exams.filter(e => allowedExamIds.has(e.id))

  const examSubjectsByExam = new Map<string, { subjectId: string }[]>()
  const allSubjectIds = new Set<string>()
  for (const row of examClassSubjectRows) {
    if (!allowedExamIds.has(row.exam_id)) continue
    const list = examSubjectsByExam.get(row.exam_id) ?? []
    list.push({ subjectId: row.subject_id })
    examSubjectsByExam.set(row.exam_id, list)
    allSubjectIds.add(row.subject_id)
  }

  const { data: subjectRows } = allSubjectIds.size
    ? await supabase.from('subjects').select('id,name').in('id', [...allSubjectIds])
    : { data: [] as { id: string; name: string }[] }
  const subjectNameById = new Map((subjectRows ?? []).map(s => [s.id, s.name]))

  const unionSubjects: TranscriptSubject[] = [...allSubjectIds]
    .map(id => ({ id, name: subjectNameById.get(id) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(s => ({ subjectId: s.id, subjectName: s.name || s.id }))

  const studentIds = students.map(s => s.id)
  const { data: markRows } = studentIds.length && filteredExams.length
    ? await supabase.from('marks').select('student_id,exam_id,subject_id,score').in('exam_id', filteredExams.map(e => e.id)).in('student_id', studentIds)
    : { data: [] as { student_id: string; exam_id: string; subject_id: string; score: number }[] }

  const marksByStudent = new Map<string, Map<string, Map<string, number>>>()
  for (const m of markRows ?? []) {
    let byExam = marksByStudent.get(m.student_id)
    if (!byExam) { byExam = new Map(); marksByStudent.set(m.student_id, byExam) }
    let bySubject = byExam.get(m.exam_id)
    if (!bySubject) { bySubject = new Map(); byExam.set(m.exam_id, bySubject) }
    bySubject.set(m.subject_id, m.score)
  }

  return students.map(student => {
    const examsResult: TranscriptExamRow[] = filteredExams
      .map(exam => {
        const scores = unionSubjects.map(sub => {
          const score = marksByStudent.get(student.id)?.get(exam.id)?.get(sub.subjectId) ?? null
          return isNum(score) ? score : null
        })
        const assessedCount = scores.filter(s => s !== null).length
        if (assessedCount === 0) return null
        const total = computeTotal(scores)
        const maxTotal = assessedCount * 100
        const average = total / assessedCount
        return {
          examId: exam.id,
          examName: exam.name,
          term: exam.term,
          academicYear: exam.academic_year,
          scores,
          total,
          average: Math.round(average * 10) / 10,
          overallLevel: getTotalLevel(total, maxTotal, totalScale, scale),
          overallDescription: getTotalDescription(total, maxTotal, totalScale, scale),
        }
      })
      .filter(Boolean) as TranscriptExamRow[]
    return {
      student: { studentId: student.id, admissionNo: student.admission_no, fullName: student.full_name, streamName: streamNameById.get(student.stream_id ?? '') ?? null },
      className: cls.name,
      tenant,
      subjects: unionSubjects,
      exams: examsResult,
      scale,
      teacherName: (cls as any).teacher_name ?? null,
      principalName: (cls as any).principal_name ?? null,
    }
  })
}