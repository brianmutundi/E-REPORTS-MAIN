import { getDashboardSession } from '@/lib/supabase/session'
import { computeTotal, computeTotalMaximum, getGrade, getGradeDescription, getTotalLevel, getTotalDescription, rankCompetitive, getTenantGradingScale, getTenantTotalGradingScale, computePercent, type GradeRule } from './grading'
import { getScopeSubjects } from './scope'
import type { AssessmentComponents } from './report-template'

export type ReportType = 'test' | 'mid_term' | 'end_term' | 'termly_average' | 'yearly_average'

export const REPORT_TYPES: { key: ReportType; label: string }[] = [
  { key: 'test', label: 'Test' },
  { key: 'mid_term', label: 'Mid Term' },
  { key: 'end_term', label: 'End Term' },
  { key: 'termly_average', label: 'Termly Average' },
  { key: 'yearly_average', label: 'Yearly Average' },
]

export function reportTypeIsSnapshot(t: ReportType): boolean {
  return t === 'test' || t === 'mid_term' || t === 'end_term'
}

/** Maps a Report Type to its exams.assessment_component filter (snapshots only). */
export function reportTypeComponent(t: ReportType): 'test_exam' | 'mid_term' | 'end_term' | null {
  if (t === 'test') return 'test_exam'
  if (t === 'mid_term') return 'mid_term'
  if (t === 'end_term') return 'end_term'
  return null
}

export type ResultColumn = { subjectId: string; subjectName: string; subjectCode: string | null }

export type ResultRow = {
  studentId: string
  admissionNo: string
  fullName: string
  total: number
  average: number
  grade: string
  position: number
  streamPosition: number | null
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
  position: number | null
  streamPosition: number | null
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
  const totalMaximum = expectedSubjects * 100
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
    return { studentId: student.id, admissionNo: student.admission_no, fullName: student.full_name, streamId: student.stream_id ?? null, streamName: student.stream_id ? (streamNames.get(student.stream_id) ?? null) : null, total, average, grade: complete ? getGrade(average, scale) : '', overallLevel: getTotalLevel(total, totalMaximum, totalScale, scale), overallDescription: getTotalDescription(total, totalMaximum, totalScale, scale), position: 0, streamPosition: null, complete, expectedSubjects, subjects }
  })
  assignStreamPositions(rows.filter(r => r.streamId))
  const ranked = rows.filter(row => row.complete).sort((a, b) => b.total - a.total || b.average - a.average || a.fullName.localeCompare(b.fullName))
  assignCompetitivePositions(ranked, 'total')
  return { results: [...ranked, ...rows.filter(row => !row.complete).sort((a, b) => a.fullName.localeCompare(b.fullName))], columns }
}

export type BroadsheetExportData = {
  tenant: { name: string; code: string | null; logo_url: string | null; address: string | null }
  exam: { name: string; term: string | null; academic_year: number | null }
  className: string
  results: ResultRow[]
  columns: ResultColumn[]
}

/**
 * Competitive (standard competition) grade position over complete rows only.
 * Tied totals share a position; the next position skips the tied count.
 */
function assignCompetitivePositions(rows: ResultRow[], scoreKey: 'total') {
  const positions = rankCompetitive(rows.filter(r => r.complete).map(r => ({ id: r.studentId, score: r[scoreKey] })))
  rows.forEach(row => { row.position = positions.get(row.studentId) ?? 0 })
}

/** Stream Position ranks complete learners within their own stream using TOTAL. */
function assignStreamPositions(rows: ResultRow[]) {
  const groups = new Map<string, ResultRow[]>()
  for (const row of rows) {
    if (!row.streamId) continue
    const list = groups.get(row.streamId) ?? []
    list.push(row)
    groups.set(row.streamId, list)
  }
  for (const [streamId, group] of groups) {
    const positions = rankCompetitive(group.filter(r => r.complete).map(r => ({ id: r.studentId, score: r.total })))
    for (const row of group) row.streamPosition = positions.get(row.studentId) ?? null
  }
}

/** Report-row variant of stream ranking using the row's sorted total. */
function assignStreamPositionsByTotal(rows: AssessmentReportRow[]) {
  const groups = new Map<string, AssessmentReportRow[]>()
  for (const row of rows) {
    if (!row.streamId) continue
    const list = groups.get(row.streamId) ?? []
    list.push(row)
    groups.set(row.streamId, list)
  }
  for (const [, group] of groups) {
    const positions = rankCompetitive(group.filter(r => r.complete && r.total !== null).map(r => ({ id: r.studentId, score: r.total ?? 0 })))
    for (const row of group) row.streamPosition = positions.get(row.studentId) ?? null
  }
}

/**
 * Loads everything a formal broadsheet needs — school details, the
 * examination and class context, and the scoring matrix — and verifies
 * the exam/class are linked and belong to the caller's tenant.
 */
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

  const effectiveSelectedComponent = selectedExam.assessment_component ?? 'end_term'
  let midExamId: string | null = components.midTerm && effectiveSelectedComponent === 'mid_term' ? selectedExam.id : null
  let endExamId: string | null = components.endTerm && effectiveSelectedComponent === 'end_term' ? selectedExam.id : null

  const needsMid = components.midTerm && !midExamId
  const needsEnd = components.endTerm && !endExamId
  if (needsMid || needsEnd) {
    const { data: allCandidates } = await supabase.from('exams')
      .select('id,name,term,academic_year,assessment_component,created_at')
      .eq('tenant_id', tenantId)
      .in('assessment_component', ['mid_term', 'end_term'])
      .order('created_at', { ascending: false })
    const candidates = (allCandidates ?? []).filter(e => e.term === selectedExam.term && e.academic_year === selectedExam.academic_year)
    const ids = candidates.map(e => e.id)
    if (ids.length) {
      const { data: classLinks } = await supabase.from('exam_classes').select('exam_id').eq('class_id', classId).in('exam_id', ids)
      const allowed = new Set((classLinks ?? []).map(x => x.exam_id))
      if (needsMid) midExamId = (candidates ?? []).find(e => e.assessment_component === 'mid_term' && allowed.has(e.id))?.id ?? null
      if (needsEnd) endExamId = (candidates ?? []).find(e => e.assessment_component === 'end_term' && allowed.has(e.id))?.id ?? null
    }
  }

  if (components.midTerm && !midExamId) return { rows: [], selectedExam, midExamId, endExamId, error: 'A Mid Term examination assigned to this class could not be found for the selected term and academic year.' }
  if (components.endTerm && !endExamId) return { rows: [], selectedExam, midExamId, endExamId, error: 'An End Term examination assigned to this class could not be found for the selected term and academic year.' }

  // Average-only reports preserve the application's existing behaviour: the
  // selected examination remains the source of marks and its mean is shown.
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
          : averageValues.length ? averageValues.reduce((a, b) => a + b, 0) / averageValues.length : null
        : null
      const gradeScore = average ?? (components.endTerm ? item.endTerm : null) ?? (components.midTerm ? item.midTerm : null)
      const grade = gradeScore === null ? '' : getGrade(gradeScore, scale)
      const rule = scale.find(r => gradeScore !== null && gradeScore >= r.min && gradeScore <= r.max)
      return { subjectId, subjectName: item.name, midTerm: components.midTerm ? item.midTerm : null, endTerm: components.endTerm ? item.endTerm : null, average, grade, gradeDescription: rule?.description ?? '' }
    }).sort((a, b) => a.subjectName.localeCompare(b.subjectName))
    const complete = subjects.length > 0 && subjects.every(s => (!components.midTerm || s.midTerm !== null) && (!components.endTerm || s.endTerm !== null) && (!averageSourceExamId || s.average !== null))
    const averageValues = subjects.map(s => s.average).filter((v): v is number => v !== null)
    const overallAverage = averageValues.length === subjects.length && subjects.length ? averageValues.reduce((a, b) => a + b, 0) / averageValues.length : null
    const total = components.endTerm && subjects.every(s => s.endTerm !== null) ? computeTotal(subjects.map(s => s.endTerm)) : components.midTerm && subjects.every(s => s.midTerm !== null) ? computeTotal(subjects.map(s => s.midTerm)) : components.average ? (overallAverage !== null && subjects.length ? overallAverage * subjects.length : null) : null
    const streamId = student.stream_id ?? null
    return { studentId: student.id, admissionNo: student.admission_no, fullName: student.full_name, streamId, streamName: streamId ? (streamNames.get(streamId) ?? null) : null, streamPosition: null, subjects, total, average: overallAverage, position: null, complete, expectedSubjects, overallLevel: getTotalLevel(total, totalMaximum, totalScale, scale), overallDescription: getTotalDescription(total, totalMaximum, totalScale, scale) }
  })

  assignStreamPositionsByTotal(rows)

  const ranked = rows.filter(r => r.complete && (r.total !== null || r.average !== null)).sort((a, b) => {
    const aScore = a.total ?? a.average ?? 0
    const bScore = b.total ?? b.average ?? 0
    return bScore - aScore || ((b.average ?? 0) - (a.average ?? 0)) || a.fullName.localeCompare(b.fullName)
  })

  const gradePositions = rankCompetitive(ranked.map(r => ({ id: r.studentId, score: r.total ?? r.average ?? 0 })))
  ranked.forEach(row => { row.position = gradePositions.get(row.studentId) ?? null })
  return { rows: [...ranked, ...rows.filter(r => !r.complete).sort((a, b) => a.fullName.localeCompare(b.fullName))], selectedExam, midExamId, endExamId, error: null }
}

// ─────────────────────────────────────────────────────────────
// Report Type–aware results (CBC report redesign)
// ─────────────────────────────────────────────────────────────

export type ReportSubject = {
  subjectId: string
  subjectName: string
  mark: number | null
  grade: string
  gradeDescription: string
  position: number | null
}

export type ReportStudentRow = {
  studentId: string
  admissionNo: string
  fullName: string
  streamId: string | null
  streamName: string | null
  subjects: ReportSubject[]
  total: number | null
  average: number | null
  overallPercent: number | null
  overallLevel: string
  overallDescription: string
  position: number | null
  streamPosition: number | null
  complete: boolean
  expectedSubjects: number
  /** Set for Termly/Yearly aggregates when computed from fewer terms than expected. */
  partialTerms?: number
  totalTerms?: number
}

export type ReportQuery = {
  reportType: ReportType
  classId: string
  examId?: string
  term?: string
  academicYear?: number
  streamId?: string
}

type ExamMeta = { id: string; name: string; term: string | null; academic_year: number | null; assessment_component: string | null }

async function loadScopeExams(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>, tenantId: string, classId: string): Promise<ExamMeta[]> {
  const { data: links } = await supabase.from('exam_classes').select('exam_id').eq('class_id', classId)
  if (!links?.length) return []
  const ids = [...new Set(links.map(l => l.exam_id))]
  const { data: exams } = await supabase.from('exams')
    .select('id,name,term,academic_year,assessment_component')
    .eq('tenant_id', tenantId)
    .in('id', ids)
    .order('created_at', { ascending: false })
  return (exams ?? []).map(e => ({ id: e.id, name: e.name, term: e.term, academic_year: e.academic_year, assessment_component: e.assessment_component as string | null }))
}

/**
 * Computes report results for a given report type.
 *
 *  - Snapshots (test / mid_term / end_term): a single selected exam, one "Marks"
 *    column per learning area. No Average/Mean (it does not apply to snapshots).
 *  - Termly Average: mean across every recorded assessment within the chosen term.
 *  - Yearly Average: mean of the Term averages for the academic year; flagged
 *    as partial when fewer than 3 terms have recorded data.
 *
 * Returns null on scope errors so callers can show a friendly message.
 */
export async function getReportRows(query: ReportQuery): Promise<{ rows: ReportStudentRow[]; examName: string; term: string | null; academicYear: number | null; error: string | null }> {
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return { rows: [], examName: '', term: null, academicYear: null, error: 'Please sign in.' }
  if (!tenantId) return { rows: [], examName: '', term: null, academicYear: null, error: 'No school is linked to this account.' }

  const scopeExams = await loadScopeExams(supabase, tenantId, query.classId)
  const scale = await getTenantGradingScale(tenantId)
  const totalScale = await getTenantTotalGradingScale(tenantId)

  // Resolve which exams feed the report.
  let reportExamId: string | null = null
  let reportExamName = ''
  let reportTerm: string | null = null
  let reportYear: number | null = null
  let aggregateExamIds: string[] = []
  let partialTerms = 0
  let totalTerms = 0

  if (reportTypeIsSnapshot(query.reportType)) {
    const comp = reportTypeComponent(query.reportType)
    if (!query.examId) return { rows: [], examName: '', term: null, academicYear: null, error: 'Please choose an assessment.' }
    const exam = scopeExams.find(e => e.id === query.examId)
    if (!exam) return { rows: [], examName: '', term: null, academicYear: null, error: 'The selected assessment is not available for this class.' }
    reportExamId = exam.id
    reportExamName = exam.name
    reportTerm = exam.term
    reportYear = exam.academic_year
    aggregateExamIds = [exam.id]
  } else if (query.reportType === 'termly_average') {
    if (!query.term) return { rows: [], examName: '', term: null, academicYear: null, error: 'Please choose a term.' }
    reportTerm = query.term
    reportYear = query.academicYear ?? null
    reportExamName = 'Termly Average'
    aggregateExamIds = scopeExams.filter(e => e.term === query.term && (query.academicYear ? e.academic_year === query.academicYear : true)).map(e => e.id)
    if (!aggregateExamIds.length) return { rows: [], examName: reportExamName, term: reportTerm, academicYear: reportYear, error: 'No assessment data was recorded for the selected term.' }
    totalTerms = 1
    partialTerms = 1
  } else {
    // yearly_average
    if (!query.academicYear) return { rows: [], examName: '', term: null, academicYear: null, error: 'Please choose an academic year.' }
    reportYear = query.academicYear
    reportTerm = null
    reportExamName = 'Yearly Average'
    // Term averages are grouped by the exam's term column.
    const yearExams = scopeExams.filter(e => e.academic_year === query.academicYear)
    const termsWithData = [...new Set(yearExams.map(e => e.term).filter((t): t is string => Boolean(t)))]
    totalTerms = 3
    partialTerms = termsWithData.length
    aggregateExamIds = yearExams.map(e => e.id)
    if (!aggregateExamIds.length) return { rows: [], examName: reportExamName, term: reportTerm, academicYear: reportYear, error: 'No assessment data was recorded for the selected academic year.' }
  }

  const examIds = aggregateExamIds
  const studentQuery = supabase
    .from('students')
    .select('id,admission_no,full_name,stream_id')
    .eq('tenant_id', tenantId)
    .eq('class_id', query.classId)
  if (query.streamId) studentQuery.eq('stream_id', query.streamId)

  const [{ data: students }, { data: marks }, { data: classSubjectLinks }, { data: streams }] = await Promise.all([
    studentQuery.order('full_name'),
    supabase.from('marks').select('student_id,subject_id,score,exam_id,subjects(name)').eq('tenant_id', tenantId).in('exam_id', examIds),
    supabase.from('exam_class_subjects').select('subject_id,exam_id,subjects(name)').eq('class_id', query.classId).in('exam_id', examIds).then(res => res, (reason: unknown) => ({ data: null as null, error: reason })),
    supabase.from('streams').select('id,name').eq('tenant_id', tenantId),
  ])
  const streamNames = new Map((streams ?? []).map(s => [s.id, s.name]))

  // Determine the subject set and per-subject exam mapping.
  const subjectNames = new Map<string, string>()
  for (const link of classSubjectLinks ?? []) {
    const subject = Array.isArray(link.subjects) ? link.subjects[0] : link.subjects
    if (!subjectNames.has(link.subject_id)) subjectNames.set(link.subject_id, subject?.name ?? 'Subject')
  }
  const subjectIds = [...subjectNames.keys()]
  const subjectMax = new Map(subjectIds.map(id => [id, 100] as const))

  // Group marks: student -> subject -> list of {exam, score}
  const byStudent = new Map<string, Map<string, { examId: string; term: string | null; score: number }[]>>()
  for (const mark of marks ?? []) {
    const studentMap = byStudent.get(mark.student_id) ?? new Map<string, { examId: string; term: string | null; score: number }[]>()
    const arr = studentMap.get(mark.subject_id) ?? []
    const exam = scopeExams.find(e => e.id === mark.exam_id)
    arr.push({ examId: mark.exam_id, term: exam?.term ?? null, score: Number(mark.score) })
    studentMap.set(mark.subject_id, arr)
    byStudent.set(mark.student_id, studentMap)
  }

  const rows: ReportStudentRow[] = (students ?? []).map(student => {
    const studentMap = byStudent.get(student.id) ?? new Map<string, { examId: string; term: string | null; score: number }[]>()
    const subjects: ReportSubject[] = subjectIds.map(subjectId => {
      const entries = studentMap.get(subjectId) ?? []
      let mark: number | null
      if (reportTypeIsSnapshot(query.reportType)) {
        // single selected exam mark
        const hit = entries.find(e => e.examId === reportExamId)
        mark = hit ? hit.score : null
      } else if (query.reportType === 'termly_average') {
        mark = entries.length ? averageOf(entries.map(e => e.score)) : null
      } else {
        // yearly: average of the per-term averages for this subject
        const perTerm = new Map<string, number[]>()
        for (const e of entries) {
          const t = e.term ?? 'No Term'
          if (!perTerm.has(t)) perTerm.set(t, [])
          perTerm.get(t)!.push(e.score)
        }
        const termAverages = [...perTerm.values()].map(averageOf)
        mark = termAverages.length ? averageOf(termAverages) : null
      }
      const grade = mark === null ? '' : getGrade(mark, scale)
      const rule = scale.find(r => mark !== null && mark >= r.min && mark <= r.max)
      return { subjectId, subjectName: subjectNames.get(subjectId) ?? 'Subject', mark, grade, gradeDescription: rule?.description ?? '', position: null }
    }).sort((a, b) => a.subjectName.localeCompare(b.subjectName))

    const complete = subjects.length > 0 && subjects.every(s => s.mark !== null)
    const marksList = subjects.map(s => s.mark).filter((m): m is number => m !== null)
    const totalMax = computeTotalMaximum(subjectIds.map(id => subjectMax.get(id) ?? 100))
    const total = marksList.length === subjects.length && subjects.length ? computeTotal(marksList) : null
    const average = marksList.length ? averageOf(marksList) : null
    const overallPercent = total !== null ? computePercent(total, totalMax) : (query.reportType === 'termly_average' || query.reportType === 'yearly_average' ? average : null)
    const streamId = student.stream_id ?? null
    return {
      studentId: student.id, admissionNo: student.admission_no, fullName: student.full_name,
      streamId, streamName: streamId ? (streamNames.get(streamId) ?? null) : null,
      subjects, total, average, overallPercent,
      overallLevel: overallPercent === null ? '' : getGrade(overallPercent, scale),
      overallDescription: overallPercent === null ? '' : getGradeDescription(overallPercent, scale),
      position: null, streamPosition: null, complete, expectedSubjects: subjects.length,
      partialTerms: (query.reportType === 'yearly_average') ? partialTerms : undefined,
      totalTerms: (query.reportType === 'yearly_average') ? totalTerms : undefined,
    }
  })

  assignReportStreamPositions(rows)
  const ranked = rows.filter(r => r.complete && (r.total !== null || r.average !== null)).sort((a, b) => {
    const aScore = a.total ?? a.average ?? 0
    const bScore = b.total ?? b.average ?? 0
    return bScore - aScore || ((b.average ?? 0) - (a.average ?? 0)) || a.fullName.localeCompare(b.fullName)
  })
  const positions = rankCompetitive(ranked.map(r => ({ id: r.studentId, score: r.total ?? r.average ?? 0 })))
  ranked.forEach(row => { row.position = positions.get(row.studentId) ?? null })

  const sortedRows = [...ranked, ...rows.filter(r => !r.complete).sort((a, b) => a.fullName.localeCompare(b.fullName))]
  return { rows: sortedRows, examName: reportExamName, term: reportTerm, academicYear: reportYear, error: null }
}

function averageOf(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function assignReportStreamPositions(rows: ReportStudentRow[]) {
  const groups = new Map<string, ReportStudentRow[]>()
  for (const row of rows) {
    if (!row.streamId) continue
    const list = groups.get(row.streamId) ?? []
    list.push(row)
    groups.set(row.streamId, list)
  }
  for (const [, group] of groups) {
    const positions = rankCompetitive(group.filter(r => r.complete && (r.total !== null || r.average !== null)).map(r => ({ id: r.studentId, score: r.total ?? r.average ?? 0 })))
    for (const row of group) row.streamPosition = positions.get(row.studentId) ?? null
  }
}
