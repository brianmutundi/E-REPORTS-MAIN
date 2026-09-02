import { getDashboardSession } from '@/lib/supabase/session'
import { computePercent, computeTotal, computeTotalMaximum, getGradeRule, getTotalLevel, getTotalDescription, getTenantTotalGradingScale, rankCompetitive, type TotalGradingScale } from './grading'
import type { AssessmentAnalysis, GradeAnalysis, LearnerAnalysis, LearnerSubjectAnalysis, LearnerTrendScores, StreamAnalysis, SubjectAnalysis } from './analysis-types'

export type GradeInput = {
  classId: string
  className: string
  students: { id: string; admission_no: string | null; full_name: string | null; stream_id: string | null }[]
  streamNames: Map<string, string>
  marksByStudent: Map<string, Map<string, number>>
  expectedSubjects: { subjectId: string; subjectName: string }[]
  scale: { grade: string; min: number; max: number; description: string }[]
  totalScale: TotalGradingScale | null
}

export function computeGradeAnalysis(input: GradeInput): GradeAnalysis {
  const { classId, className, students, streamNames, marksByStudent, expectedSubjects, scale, totalScale } = input
  const expectedCount = expectedSubjects.length
  const totalMaximum = computeTotalMaximum(expectedSubjects.map(() => 100))
  const overallScale = totalScale && totalScale.rules.length ? totalScale.rules : (scale as { grade: string; min: number; max: number; description: string }[])

  const learners: LearnerAnalysis[] = students.map(student => {
    const studentMarks = marksByStudent.get(student.id) ?? new Map<string, number>()
    const subjects: LearnerSubjectAnalysis[] = expectedSubjects.map(subject => {
      const score = studentMarks.has(subject.subjectId) ? studentMarks.get(subject.subjectId)! : null
      const rule = score === null ? undefined : getGradeRule(score, scale)
      return {
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        score,
        grade: rule?.grade ?? '',
        gradeDescription: rule?.description ?? '',
      }
    })
    const scores = subjects.map(s => s.score)
    const total = computeTotal(scores)
    const percent = totalMaximum > 0 ? computePercent(total, totalMaximum) : null
    const streamId = student.stream_id ?? null
    return {
      studentId: student.id,
      admissionNo: student.admission_no ?? '',
      fullName: student.full_name ?? '',
      streamId,
      streamName: streamId ? (streamNames.get(streamId) ?? null) : null,
      assessedCount: subjects.filter(s => s.score !== null).length,
      expectedCount,
      complete: expectedCount > 0 && subjects.every(s => s.score !== null),
      total,
      percent,
      overallLevel: getTotalLevel(total, totalMaximum, totalScale, scale),
      overallDescription: getTotalDescription(total, totalMaximum, totalScale, scale),
      gradePosition: null,
      streamPosition: null,
      subjects,
    }
  })

  const complete = learners.filter(l => l.complete)
  const gradePositions = rankCompetitive(complete.map(l => ({ id: l.studentId, score: l.total ?? 0 })))
  for (const learner of learners) learner.gradePosition = gradePositions.get(learner.studentId) ?? null

  const streamGroups = new Map<string, LearnerAnalysis[]>()
  for (const learner of learners) {
    if (!learner.streamId) continue
    const list = streamGroups.get(learner.streamId) ?? []
    list.push(learner)
    streamGroups.set(learner.streamId, list)
  }
  const streams: StreamAnalysis[] = []
  for (const [streamId, group] of streamGroups) {
    const streamComplete = group.filter(l => l.complete)
    const positions = rankCompetitive(streamComplete.map(l => ({ id: l.studentId, score: l.total ?? 0 })))
    for (const learner of group) learner.streamPosition = positions.get(learner.studentId) ?? null
    const totals = streamComplete.map(l => l.total ?? 0)
    const best = streamComplete.length ? streamComplete.reduce((a, b) => (a.total ?? 0) >= (b.total ?? 0) ? a : b) : null
    const counts: Record<string, number> = {}
    for (const learner of streamComplete) {
      if (learner.overallLevel) counts[learner.overallLevel] = (counts[learner.overallLevel] ?? 0) + 1
    }
    streams.push({
      streamId,
      streamName: streamNames.get(streamId) ?? 'Stream',
      learnerCount: group.length,
      assessedCount: streamComplete.length,
      averageTotal: totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100 : null,
      topLearner: best?.fullName ?? null,
      topTotal: best?.total ?? null,
      levelCounts: counts,
    })
  }

  const learningAreas: SubjectAnalysis[] = expectedSubjects.map(subject => {
    const scores = learners.map(l => l.subjects.find(s => s.subjectId === subject.subjectId)?.score ?? null)
    const assessed = scores.filter((s): s is number => s !== null)
    const max = Math.max(1, assessed.length)
    return {
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      learnerCount: learners.length,
      assessedCount: assessed.length,
      average: assessed.length ? Math.round((assessed.reduce((a, b) => a + b, 0) / max) * 100) / 100 : null,
      highest: assessed.length ? Math.max(...assessed) : null,
      lowest: assessed.length ? Math.min(...assessed) : null,
    }
  })

  const distribution = overallScale.map(rule => ({
    grade: rule.grade,
    description: rule.description,
    count: complete.filter(l => l.overallLevel === rule.grade).length,
  }))

  const completeTotals = complete.map(l => l.total ?? 0)
  const top = complete.length ? complete.reduce((a, b) => (a.total ?? 0) >= (b.total ?? 0) ? a : b) : null

  return {
    classId,
    className,
    learnerCount: learners.length,
    assessedCount: complete.length,
    averageTotal: completeTotals.length ? Math.round((completeTotals.reduce((a, b) => a + b, 0) / completeTotals.length) * 100) / 100 : null,
    averagePercent: complete.length && totalMaximum > 0 ? Math.round((complete.reduce((a, l) => a + (l.percent ?? 0), 0) / complete.length) * 100) / 100 : null,
    topLearner: top?.fullName ?? null,
    topTotal: top?.total ?? null,
    levelDistribution: distribution,
    streams,
    learningAreas,
    learners: [...complete.sort((a, b) => a.gradePosition! - b.gradePosition!), ...learners.filter(l => !l.complete).sort((a, b) => a.fullName.localeCompare(b.fullName))],
  }
}

export async function getAssessmentAnalysis(examId: string, streamId?: string): Promise<AssessmentAnalysis | { error: string }> {
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return { error: 'Unauthorized' }
  if (!tenantId) return { error: 'No school linked to this account.' }

  const [examRes, classesRes, studentsRes, marksRes, classSubjectsRes, streamsRes, streamRes] = await Promise.all([
    supabase.from('exams').select('id,name,term,academic_year').eq('id', examId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('classes').select('id,name').eq('tenant_id', tenantId).order('name'),
    supabase.from('students').select('id,admission_no,full_name,class_id,stream_id').eq('tenant_id', tenantId),
    supabase.from('marks').select('student_id,subject_id,score').eq('tenant_id', tenantId).eq('exam_id', examId),
    supabase
      .from('exam_class_subjects')
      .select('class_id,subject_id,subjects(name)')
      .eq('exam_id', examId)
      .then((res) => res, (reason: unknown) => ({ data: null as null, error: reason })),
    supabase.from('streams').select('id,name').eq('tenant_id', tenantId),
    streamId ? supabase.from('streams').select('id,class_id,name').eq('id', streamId).eq('tenant_id', tenantId).maybeSingle() : Promise.resolve({ data: null as null, error: null }),
  ])

  if (!examRes.data) return { error: 'Examination not found.' }
  const streamNames = new Map((streamsRes.data ?? []).map(s => [s.id, s.name]))

  // Expected learning areas are scoped per grade and per assessment.
  const expectedSubjectsByClass = new Map<string, { subjectId: string; subjectName: string }[]>()
  for (const link of classSubjectsRes.data ?? []) {
    const subject = Array.isArray(link.subjects) ? link.subjects[0] : link.subjects
    const list = expectedSubjectsByClass.get(link.class_id) ?? []
    list.push({ subjectId: link.subject_id, subjectName: subject?.name ?? 'Learning Area' })
    expectedSubjectsByClass.set(link.class_id, list)
  }
  const { data: scaleRows } = await supabase.from('report_grading_levels').select('grade,min,max,description').eq('tenant_id', tenantId).order('sort_order')
  const scale = scaleRows && scaleRows.length ? scaleRows : [{ grade: 'EE', min: 80, max: 100, description: 'Exceeding Expectations' }, { grade: 'ME', min: 65, max: 79.99, description: 'Meeting Expectations' }, { grade: 'AE', min: 50, max: 64.99, description: 'Approaching Expectations' }, { grade: 'BE', min: 0, max: 49.99, description: 'Below Expectations' }]
  const totalScale = await getTenantTotalGradingScale(tenantId)

  const marksByStudent = new Map<string, Map<string, number>>()
  for (const mark of marksRes.data ?? []) {
    const map = marksByStudent.get(mark.student_id) ?? new Map()
    map.set(mark.subject_id, Number(mark.score))
    marksByStudent.set(mark.student_id, map)
  }

  const streamClassId = streamRes.data?.class_id ?? null
  const selectedStreamId = streamId && streamClassId ? streamId : null

  const studentsByClass = new Map<string, typeof studentsRes.data>()
  for (const student of studentsRes.data ?? []) {
    // When a stream is selected, only learners in that stream and its grade count.
    if (selectedStreamId && student.stream_id !== selectedStreamId) continue
    if (selectedStreamId && student.class_id !== streamClassId) continue
    const list = studentsByClass.get(student.class_id) ?? []
    list.push(student)
    studentsByClass.set(student.class_id, list)
  }

  const grades: GradeAnalysis[] = (classesRes.data ?? [])
    .filter(cls => !selectedStreamId || cls.id === streamClassId)
    .map(cls => {
      const students = studentsByClass.get(cls.id) ?? []
      return computeGradeAnalysis({ classId: cls.id, className: cls.name, students, streamNames, marksByStudent, expectedSubjects: expectedSubjectsByClass.get(cls.id) ?? [], scale, totalScale })
    })

  return {
    examId: examRes.data.id,
    examName: examRes.data.name,
    term: examRes.data.term,
    academicYear: examRes.data.academic_year,
    grades,
  }
}

export async function getLearnerTrend(tenantId: string, studentId: string): Promise<LearnerTrendScores[]> {
  const { supabase } = await getDashboardSession()
  const [{ data: student }, { data: exams }, { data: scaleRows }] = await Promise.all([
    supabase.from('students').select('id,class_id').eq('id', studentId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('exams').select('id,name,term,academic_year').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabase.from('report_grading_levels').select('grade,min,max,description').eq('tenant_id', tenantId).order('sort_order'),
  ])
  const scale = scaleRows && scaleRows.length ? scaleRows : [{ grade: 'EE', min: 80, max: 100, description: 'Exceeding Expectations' }, { grade: 'ME', min: 65, max: 79.99, description: 'Meeting Expectations' }, { grade: 'AE', min: 50, max: 64.99, description: 'Approaching Expectations' }, { grade: 'BE', min: 0, max: 49.99, description: 'Below Expectations' }]
  const totalScale = await getTenantTotalGradingScale(tenantId)

  const classId = student?.class_id ?? null
  if (!classId) return []
  const { data: classStudents } = await supabase.from('students').select('id').eq('tenant_id', tenantId).eq('class_id', classId)
  const classStudentIds = (classStudents ?? []).map(s => s.id)
  const examIds = (exams ?? []).map(e => e.id)
  if (examIds.length === 0) return []

  const [{ data: subjectLinks }, { data: marksRows }] = await Promise.all([
    supabase
      .from('exam_class_subjects')
      .select('exam_id,subject_id')
      .eq('class_id', classId)
      .in('exam_id', examIds)
      .then((res) => res, (reason: unknown) => ({ data: null as null, error: reason })),
    supabase.from('marks').select('student_id,subject_id,score,exam_id').eq('tenant_id', tenantId).in('exam_id', examIds).in('student_id', classStudentIds),
  ])

  const subjectsByExam = new Map<string, Set<string>>()
  for (const link of subjectLinks ?? []) {
    const set = subjectsByExam.get(link.exam_id) ?? new Set<string>()
    set.add(link.subject_id)
    subjectsByExam.set(link.exam_id, set)
  }
  const marksByExam = new Map<string, { studentId: string; subjectId: string; score: number }[]>()
  for (const mark of marksRows ?? []) {
    const list = marksByExam.get(mark.exam_id) ?? []
    list.push({ studentId: mark.student_id, subjectId: mark.subject_id, score: Number(mark.score) })
    marksByExam.set(mark.exam_id, list)
  }

  const trend: LearnerTrendScores[] = []
  for (const exam of exams ?? []) {
    const subjectIds = subjectsByExam.get(exam.id)
    if (!subjectIds || subjectIds.size === 0) continue
    const marksByStudent = new Map<string, Map<string, number>>()
    for (const mark of marksByExam.get(exam.id) ?? []) {
      if (!subjectIds.has(mark.subjectId)) continue
      const map = marksByStudent.get(mark.studentId) ?? new Map()
      map.set(mark.subjectId, mark.score)
      marksByStudent.set(mark.studentId, map)
    }
    const totalMaximum = computeTotalMaximum(Array.from(subjectIds).map(() => 100))
    const learnerMarks = marksByStudent.get(studentId) ?? new Map<string, number>()
    if (learnerMarks.size === 0) continue
    const learnerTotal = computeTotal(Array.from(learnerMarks.values()))
    const learnerPercent = totalMaximum > 0 ? computePercent(learnerTotal, totalMaximum) : null

    const totals = Array.from(marksByStudent.entries())
      .filter(([, m]) => m.size >= subjectIds.size)
      .map(([id, m]) => ({ id, score: computeTotal(Array.from(m.values())) }))
    const positions = rankCompetitive(totals)

    trend.push({
      examId: exam.id,
      examName: exam.name,
      term: exam.term,
      academicYear: exam.academic_year,
      total: learnerMarks.size < subjectIds.size ? null : learnerTotal,
      percent: learnerPercent,
      overallLevel: getTotalLevel(learnerTotal, totalMaximum, totalScale, scale),
      overallDescription: getTotalDescription(learnerTotal, totalMaximum, totalScale, scale),
      position: positions.get(studentId) ?? null,
      positions: [{ classId: classId ?? '', className: '', position: positions.get(studentId) ?? 0 }],
    })
  }
  return trend
}