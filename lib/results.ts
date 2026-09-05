import { getDashboardSession } from '@/lib/supabase/session'
import { computeTotal, computeTotalMaximum, getGrade, getTotalLevel, getTotalDescription, getTenantGradingScale, getTenantTotalGradingScale, calculateAchievement, type GradeRule } from './grading'
import { getScopeSubjects } from './scope'
import { parseTermReference } from './terms'
import type { AssessmentComponents } from './report-template'

export type ResultColumn = { subjectId: string; subjectName: string; subjectCode: string | null }

export type ResultRow = {
  studentId: string
  admissionNo: string
  fullName: string
  total: number
  average: number
  grade: string
  streamId: string | null
  streamName: string | null
  complete: boolean
  expectedSubjects: number
  overallLevel: string
  overallDescription: string
  subjects: { subjectId: string; subjectName: string; score: number }[]
}

export type AssessmentResultSubject = {
  subjectId: string
  subjectName: string
  midTerm: number | null
  endTerm: number | null
  average: number | null
  grade: string
  gradeDescription: string
}

export type AssessmentReportRow = {
  studentId: string
  admissionNo: string
  fullName: string
  subjects: AssessmentResultSubject[]
  total: number | null
  average: number | null
  streamId: string | null
  streamName: string | null
  complete: boolean
  expectedSubjects: number
  overallLevel: string
  overallDescription: string
}

export async function getExamResults(examId: string, classId: string, streamId?: string): Promise<{ results: ResultRow[]; columns: ResultColumn[] }> {
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return { results: [], columns: [] }
  if (!tenantId) return { results: [], columns: [] }
  const studentQuery = supabase
    .from('students')
    .select('id,admission_no,full_name,stream_id')
    .eq('tenant_id', tenantId)
    .eq('class_id', classId)
  if (streamId) studentQuery.eq('stream_id', streamId)
  const [
    { data: students },
    { data: marks },
    scopeSubjects,
    { data: streams },
  ] = await Promise.all([
    studentQuery.order('full_name'),
    supabase.from('marks').select('student_id,subject_id,score,subjects(name)').eq('tenant_id', tenantId).eq('exam_id', examId),
    getScopeSubjects(supabase, tenantId, examId, classId),
    supabase.from('streams').select('id,name').eq('tenant_id', tenantId),
  ])
  const streamNames = new Map((streams ?? []).map(s => [s.id, s.name]))
  const columns: ResultColumn[] = scopeSubjects.map(s => ({ subjectId: s.subjectId, subjectName: s.subjectName, subjectCode: s.code ?? null }))
  const expectedSubjects = columns.length
  const scale: GradeRule[] = await getTenantGradingScale(tenantId)
  const totalScale = await getTenantTotalGradingScale(tenantId)
  const byStudent = new Map<string, { subjectId: string; subjectName: string; score: number }[]>()
  for (const mark of marks ?? []) {
    const subject = Array.isArray(mark.subjects) ? mark.subjects[0] : mark.subjects
    const arr = byStudent.get(mark.student_id) ?? []
    arr.push({ subjectId: mark.subject_id, subjectName: subject?.name ?? 'Subject', score: Number(mark.score) })
    byStudent.set(mark.student_id, arr)
  }
  const rows = (students ?? []).map(student => {
    const subjectMap = new Map((byStudent.get(student.id) ?? []).map(s => [s.subjectId, s]))
    const subjects = columns
      .map(col => subjectMap.get(col.subjectId))
      .filter((s): s is { subjectId: string; subjectName: string; score: number } => Boolean(s))
    const total = computeTotal(subjects.map(s => s.score))
    const average = subjects.length ? total / subjects.length : 0
    const complete = expectedSubjects > 0 && subjects.length >= expectedSubjects
    const rowTotalMaximum = subjects.length * 100
    return { studentId: student.id, admissionNo: student.admission_no, fullName: student.full_name, streamId: student.stream_id ?? null, streamName: student.stream_id ? (streamNames.get(student.stream_id) ?? null) : null, total, average, grade: complete ? getGrade(average, scale) : '', overallLevel: getTotalLevel(total, rowTotalMaximum, totalScale, scale), overallDescription: getTotalDescription(total, rowTotalMaximum, totalScale, scale), complete, expectedSubjects, subjects }
  })
  return { results: rows.sort((a, b) => a.fullName.localeCompare(b.fullName)), columns }
}

export type BroadsheetExportData = {
  tenant: { name: string; code: string | null; logo_url: string | null; address: string | null }
  exam: { name: string; term: string | null; academic_year: number | null }
  className: string
  results: ResultRow[]
  columns: ResultColumn[]
}

export async function getBroadsheetExportData(examId: string, classId: string, streamId?: string): Promise<BroadsheetExportData | null> {
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return null
  if (!tenantId) return null
  const [{ data: exam }, { data: cls }, { data: tenant }] = await Promise.all([
    supabase.from('exams').select('name,term,academic_year').eq('id', examId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('classes').select('name').eq('id', classId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('tenants').select('name,code,logo_url,address').eq('id', tenantId).maybeSingle(),
  ])
  if (!exam || !cls || !tenant) return null
  const { results, columns } = await getExamResults(examId, classId, streamId)
  return { tenant, exam, className: cls.name, results, columns }
}

type ExamContext = { id: string; name: string; term: string | null; academic_year: number | null; assessment_component: 'mid_term' | 'end_term' | null }

async function getExamContext(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>, tenantId: string, examId: string, classId: string): Promise<ExamContext | null> {
  const [{ data: exam }, { data: classScope }] = await Promise.all([
    supabase.from('exams').select('id,name,term,academic_year,assessment_component,created_at').eq('id', examId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('exam_classes').select('exam_id').eq('exam_id', examId).eq('class_id', classId).maybeSingle(),
  ])
  if (!exam || !classScope) return null
  return { id: exam.id, name: exam.name, term: exam.term, academic_year: exam.academic_year, assessment_component: exam.assessment_component as ExamContext['assessment_component'] }
}

/**
 * Resolve the assessment component from the database value and examination
 * name. If legacy/corrupted metadata disagrees with an explicit End Term/Mid
 * Term name, the human-readable exam name wins so existing examinations do
 * not disappear from report configuration.
 */
function inferAssessmentComponent(name: string, component: string | null): 'mid_term' | 'end_term' | null {
  const normalized = name.trim().toLowerCase().replace(/[-_]+/g, ' ')
  const namedComponent = /\bend(?:\s+term)?\b|\bendterm\b/.test(normalized)
    ? 'end_term'
    : /\bmid(?:\s+term)?\b|\bmidterm\b/.test(normalized)
      ? 'mid_term'
      : null
  if (namedComponent) return namedComponent
  if (component === 'mid_term' || component === 'end_term') return component
  return null
}

function sameAcademicTerm(
  a: { term: string | null; academic_year: number | null },
  b: { term: string | null; academic_year: number | null },
): boolean {
  if (a.academic_year !== b.academic_year) return false
  const parsedA = parseTermReference({ term: a.term, academicYear: a.academic_year })
  const parsedB = parseTermReference({ term: b.term, academicYear: b.academic_year })
  if (parsedA && parsedB) return parsedA.year === parsedB.year && parsedA.termNumber === parsedB.termNumber
  return (a.term ?? '').trim().toLowerCase().replace(/\s+/g, ' ') === (b.term ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function getConfiguredAssessmentResults(
  examId: string,
  classId: string,
  components: AssessmentComponents,
  streamId?: string,
): Promise<{ rows: AssessmentReportRow[]; selectedExam: { id: string; name: string; term: string | null; academic_year: number | null; assessment_component: 'mid_term' | 'end_term' | null } | null; midExamId: string | null; endExamId: string | null; error: string | null }> {
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return { rows: [], selectedExam: null, midExamId: null, endExamId: null, error: 'Please sign in.' }
  if (!tenantId) return { rows: [], selectedExam: null, midExamId: null, endExamId: null, error: 'No school is linked to this account.' }
  const selectedExam = await getExamContext(supabase, tenantId, examId, classId)
  if (!selectedExam) return { rows: [], selectedExam: null, midExamId: null, endExamId: null, error: 'The selected examination or class is not available.' }

  const effectiveSelectedComponent = inferAssessmentComponent(selectedExam.name, selectedExam.assessment_component)
  let midExamId: string | null = components.midTerm && effectiveSelectedComponent === 'mid_term' ? selectedExam.id : null
  let endExamId: string | null = components.endTerm && effectiveSelectedComponent === 'end_term' ? selectedExam.id : null

  const needsMid = components.midTerm && !midExamId
  const needsEnd = components.endTerm && !endExamId
  if (needsMid || needsEnd) {
    const { data: allCandidates } = await supabase.from('exams')
      .select('id,name,term,academic_year,assessment_component,created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    const candidates = (allCandidates ?? []).filter(e => sameAcademicTerm(e, selectedExam))
    const ids = candidates.map(e => e.id)
    if (ids.length) {
      const { data: classLinks } = await supabase.from('exam_classes').select('exam_id').eq('class_id', classId).in('exam_id', ids)
      const allowed = new Set((classLinks ?? []).map(x => x.exam_id))
      if (needsMid) midExamId = candidates.find(e => inferAssessmentComponent(e.name, e.assessment_component) === 'mid_term' && allowed.has(e.id))?.id ?? null
      if (needsEnd) endExamId = candidates.find(e => inferAssessmentComponent(e.name, e.assessment_component) === 'end_term' && allowed.has(e.id))?.id ?? null
    }
  }

  if (components.midTerm && !midExamId) return { rows: [], selectedExam, midExamId, endExamId, error: 'A Mid Term examination assigned to this grade could not be found for the selected term and academic year.' }
  if (components.endTerm && !endExamId) return { rows: [], selectedExam, midExamId, endExamId, error: 'An End Term examination assigned to this grade could not be found for the selected term and academic year.' }

  const averageSourceExamId = components.average && !components.midTerm && !components.endTerm ? selectedExam.id : null
  const examIds = [midExamId, endExamId, averageSourceExamId].filter((id): id is string => Boolean(id))
  const studentQuery = supabase
    .from('students')
    .select('id,admission_no,full_name,stream_id')
    .eq('tenant_id', tenantId)
    .eq('class_id', classId)
  if (streamId) studentQuery.eq('stream_id', streamId)
  const [{ data: students }, { data: marks }, { data: classSubjectLinks }, { data: streams }] = await Promise.all([
    studentQuery.order('full_name'),
    supabase.from('marks').select('student_id,subject_id,score,exam_id,subjects(name)').eq('tenant_id', tenantId).in('exam_id', examIds),
    supabase
      .from('exam_class_subjects')
      .select('subject_id,subjects(name)')
      .eq('class_id', classId)
      .in('exam_id', examIds)
      .then((res) => res, (reason: unknown) => ({ data: null as null, error: reason })),
    supabase.from('streams').select('id,name').eq('tenant_id', tenantId),
  ])
  const streamNames = new Map((streams ?? []).map(s => [s.id, s.name]))
  const expectedSubjectIds = new Set((classSubjectLinks ?? []).map(x => x.subject_id))
  const subjectNames = new Map((classSubjectLinks ?? []).map(x => {
    const subject = Array.isArray(x.subjects) ? x.subjects[0] : x.subjects
    return [x.subject_id, subject?.name ?? 'Subject']
  }))
  const expectedSubjects = expectedSubjectIds.size
  const totalMaximum = computeTotalMaximum(Array.from(expectedSubjectIds).map(() => 100))
  const scale = await getTenantGradingScale(tenantId)
  const totalScale = await getTenantTotalGradingScale(tenantId)
  const byStudent = new Map<string, Map<string, { name: string; midTerm: number | null; endTerm: number | null }>>()
  for (const mark of marks ?? []) {
    const subject = Array.isArray(mark.subjects) ? mark.subjects[0] : mark.subjects
    const studentMap = byStudent.get(mark.student_id) ?? new Map()
    const current = studentMap.get(mark.subject_id) ?? { name: subject?.name ?? 'Subject', midTerm: null, endTerm: null }
    if (mark.exam_id === midExamId) current.midTerm = Number(mark.score)
    if (mark.exam_id === endExamId) current.endTerm = Number(mark.score)
    if (mark.exam_id === averageSourceExamId) current.endTerm = Number(mark.score)
    studentMap.set(mark.subject_id, current)
    byStudent.set(mark.student_id, studentMap)
  }

  const rows: AssessmentReportRow[] = (students ?? []).map(student => {
    const subjectMap = byStudent.get(student.id) ?? new Map()
    const subjects = [...expectedSubjectIds].map(subjectId => {
      const item = subjectMap.get(subjectId) ?? { name: subjectNames.get(subjectId) ?? 'Subject', midTerm: null, endTerm: null }
      const averageValues = [
        components.midTerm ? item.midTerm : null,
        components.endTerm ? item.endTerm : null,
      ].filter((v): v is number => v !== null)
      const average = components.average
        ? averageSourceExamId
          ? item.endTerm
          : averageValues.length ? averageValues.reduce((a, b) => (a + b), 0) / averageValues.length : null
        : null
      const gradeScore = average ?? (components.endTerm ? item.endTerm : null) ?? (components.midTerm ? item.midTerm : null)
      const grade = gradeScore === null ? '' : getGrade(gradeScore, scale)
      const rule = gradeScore === null ? undefined : calculateAchievement(gradeScore, scale)
      return { subjectId, subjectName: item.name, midTerm: components.midTerm ? item.midTerm : null, endTerm: components.endTerm ? item.endTerm : null, average, grade, gradeDescription: rule?.description ?? '' }
    }).sort((a, b) => a.subjectName.localeCompare(b.subjectName))
    const complete = subjects.length > 0 && subjects.every(s => (!components.midTerm || s.midTerm !== null) && (!components.endTerm || s.endTerm !== null) && (!averageSourceExamId || s.average !== null))
    const averageValues = subjects.map(s => s.average).filter((v): v is number => v !== null)
    const overallAverage = averageValues.length === subjects.length && subjects.length ? averageValues.reduce((a, b) => a + b, 0) / averageValues.length : null
    const total = components.endTerm && subjects.every(s => s.endTerm !== null) ? computeTotal(subjects.map(s => s.endTerm)) : components.midTerm && subjects.every(s => s.midTerm !== null) ? computeTotal(subjects.map(s => s.midTerm)) : components.average ? (overallAverage !== null && subjects.length ? overallAverage * subjects.length : null) : null
    const streamId = student.stream_id ?? null
    return { studentId: student.id, admissionNo: student.admission_no, fullName: student.full_name, streamId, streamName: streamId ? (streamNames.get(streamId) ?? null) : null, subjects, total, average: overallAverage, complete, expectedSubjects, overallLevel: getTotalLevel(total, totalMaximum, totalScale, scale), overallDescription: getTotalDescription(total, totalMaximum, totalScale, scale) }
  })

  return { rows: rows.sort((a, b) => a.fullName.localeCompare(b.fullName)), selectedExam, midExamId, endExamId, error: null }
}
