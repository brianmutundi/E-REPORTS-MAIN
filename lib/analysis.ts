import { getDashboardSession } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'
import { computePercent, computeTotal, computeTotalMaximum, getTotalLevel, getTotalDescription, rankCompetitive, getTenantGradingScale, getTenantTotalGradingScale } from './grading'
import { getReportTenant } from './report-template'
import type { AssessmentAnalysisModel, AnalysisScope, AnalysisLearnerSubject, AnalysisLevel, AnalysisLearningAreaResult, AnalysisRankRow, HistogramBin, Insight, Anomaly, Recommendation, TrendPoint, LearnerTrendScores } from './analysis-types'
import { levelColor } from './analysis-types'

export type AnalysisQueryParams = {
  examId: string
  classId: string
  streamId?: string
}

type StudentRecord = {
  id: string
  admission_no: string | null
  full_name: string | null
  class_id: string | null
  stream_id: string | null
}

type LearningArea = { subjectId: string; subjectName: string }

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function meanOf(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

function medianOf(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Population standard deviation (denominator = N). */
function stdDevOf(values: number[]): number {
  if (!values.length) return 0
  const mean = meanOf(values)
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function formatCd(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2)
}

/**
 * Builds the full Assessment Analysis model for a single Grade (+ optional
 * Stream) scope from the application's real Supabase data.
 *
 * Classification (never treats a missing score as zero/failure):
 *   - Assessed   = has a valid score for EVERY expected learning area.
 *   - Partial    = has at least one valid score but not all.
 *   - Unassessed = has no valid scores.
 * Only the "assessed" cohort feeds every statistic; partial/unassessed learners
 * are surfaced separately (anomalies / appendix) and are never shown as 0% or
 * BE. All aggregate calculations use full precision and formatting is applied
 * on display.
 */
export async function buildAssessmentAnalysis(params: AnalysisQueryParams): Promise<AssessmentAnalysisModel | { error: string }> {
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return { error: 'Unauthorized' }
  if (!tenantId) return { error: 'No school is linked to this account.' }

  const { examId, classId, streamId } = params

  const [
    examRes,
    classRes,
    streamRes,
    tenantRes,
    areaLinksRes,
    studentsRes,
    marksRes,
    scale,
    totalScale,
  ] = await Promise.all([
    supabase.from('exams').select('id,name,term,academic_year,assessment_component').eq('id', examId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('classes').select('id,name,teacher_name,principal_name').eq('id', classId).eq('tenant_id', tenantId).maybeSingle(),
    streamId ? supabase.from('streams').select('id,class_id,name').eq('id', streamId).eq('tenant_id', tenantId).maybeSingle() : Promise.resolve({ data: null as null }),
    getReportTenant(supabase, tenantId),
    supabase
      .from('exam_class_subjects')
      .select('subject_id,subjects(name)')
      .eq('exam_id', examId)
      .eq('class_id', classId)
      .then((res) => res, (reason: unknown) => ({ data: null as null, error: reason })),
    supabase.from('students').select('id,admission_no,full_name,class_id,stream_id').eq('tenant_id', tenantId).eq('class_id', classId),
    supabase.from('marks').select('student_id,subject_id,score').eq('tenant_id', tenantId).eq('exam_id', examId),
    getTenantGradingScale(tenantId),
    getTenantTotalGradingScale(tenantId),
  ])

  const exam = examRes.data
  const cls = classRes.data
  if (!exam) return { error: 'Assessment not found.' }
  if (!cls) return { error: 'Grade not found.' }

  // Resolve the effective stream. When a stream is requested, it must belong to
  // the selected grade; otherwise the analysis falls back to whole-grade scope.
  let effectiveStreamId: string | null = null
  let effectiveStreamName: string | null = null
  if (streamId) {
    const stream = streamRes.data
    if (stream && stream.class_id === classId) {
      effectiveStreamId = stream.id
      effectiveStreamName = stream.name
    }
  }

  // Learning areas scoped to this assessment + grade.
  const learningAreas: LearningArea[] = []
  const areaIdSet = new Set<string>()
  for (const link of areaLinksRes.data ?? []) {
    const subject = Array.isArray(link.subjects) ? link.subjects[0] : link.subjects
    if (areaIdSet.has(link.subject_id)) continue
    areaIdSet.add(link.subject_id)
    learningAreas.push({ subjectId: link.subject_id, subjectName: subject?.name ?? 'Learning Area' })
  }

  // Each learning area is marked out of 100 (enforced by the marks check
  // constraint 0..100); the assessment total is the sum of area maxima.
  const areaMax = 100
  const maxTotal = computeTotalMaximum(learningAreas.map(() => areaMax))

  // Marks -> per student map of subjectId -> score.
  const marksByStudent = new Map<string, Map<string, number>>()
  for (const mark of marksRes.data ?? []) {
    let map = marksByStudent.get(mark.student_id)
    if (!map) { map = new Map(); marksByStudent.set(mark.student_id, map) }
    map.set(mark.subject_id, Number(mark.score))
  }

  // Scope enrolled learners to grade (+ stream).
  const enrolled: StudentRecord[] = []
  for (const s of studentsRes.data ?? []) {
    if (effectiveStreamId && s.stream_id !== effectiveStreamId) continue
    enrolled.push(s)
  }

  // Classify learners.
  const assessedLeaners: { student: StudentRecord; subjects: AnalysisLearnerSubject[]; total: number; percentage: number; overallLevel: string; overallDescription: string }[] = []
  const partialRows: { student: StudentRecord; assessedCount: number; expectedCount: number }[] = []
  const unassessedRows: StudentRecord[] = []
  const anomalies: Anomaly[] = []

  for (const student of enrolled) {
    const subjects: AnalysisLearnerSubject[] = learningAreas.map((area) => ({
      subjectId: area.subjectId,
      subjectName: area.subjectName,
      score: marksByStudent.get(student.id)?.get(area.subjectId) ?? null,
    }))
    const scores = subjects.map((s) => s.score)
    const assessedCount = scores.filter(isFiniteNum).length
    const expectedCount = learningAreas.length
    if (expectedCount === 0) {
      // No learning areas configured for this assessment/grade -> nothing assessable.
      unassessedRows.push(student)
      continue
    }
    if (assessedCount === 0) {
      unassessedRows.push(student)
      continue
    }
    if (assessedCount < expectedCount) {
      partialRows.push({ student, assessedCount, expectedCount })
      anomalies.push({
        learnerName: student.full_name ?? 'Unnamed learner',
        admissionNo: student.admission_no ?? '—',
        reason: `Partial assessment — only ${assessedCount} of ${expectedCount} learning areas recorded. Excluded from statistics.`,
      })
      continue
    }
    // Fully assessed.
    const total = computeTotal(scores)
    const percentage = maxTotal > 0 ? computePercent(total, maxTotal) : 0
    assessedLeaners.push({
      student,
      subjects,
      total,
      percentage,
      overallLevel: getTotalLevel(total, maxTotal, totalScale, scale),
      overallDescription: getTotalDescription(total, maxTotal, totalScale, scale),
    })
  }

  // Ranking over assessed learners only, competitive tie handling.
  const positions = rankCompetitive(assessedLeaners.map((l) => ({ id: l.student.id, score: l.total })))
  const ranking: AnalysisRankRow[] = assessedLeaners
    .map((l) => ({
      studentId: l.student.id,
      admissionNo: l.student.admission_no ?? '',
      fullName: l.student.full_name ?? '',
      assessedCount: learningAreas.length,
      expectedCount: learningAreas.length,
      total: l.total,
      percentage: l.percentage,
      overallLevel: l.overallLevel || '—',
      overallDescription: l.overallDescription,
      subjects: l.subjects,
      position: positions.get(l.student.id) ?? 0,
    }))
    .sort((a, b) => a.position - b.position || b.percentage - a.percentage)

  const assessedCount = assessedLeaners.length
  const enrolledCount = enrolled.length
  const unassessedCount = unassessedRows.length
  const partialCount = partialRows.length
  const coveragePercentage = enrolledCount > 0 ? (assessedCount / enrolledCount) * 100 : 0

  const percents = assessedLeaners.map((l) => l.percentage)
  const totals = assessedLeaners.map((l) => l.total)
  const classMeanPercentage = percents.length ? meanOf(percents) : null
  const medianPercentage = percents.length ? medianOf(percents) : null
  const standardDeviation = percents.length ? stdDevOf(percents) : null
  const highestPercentage = percents.length ? Math.max(...percents) : null
  const lowestPercentage = percents.length ? Math.min(...percents) : null
  const top = assessedLeaners.length
    ? assessedLeaners.reduce((a, b) => (a.total >= b.total ? a : b))
    : null

  // Performance-level distribution over assessed learners. Zero-count levels
  // are retained so the scale stays complete.
  const configuredLevels: { code: string; description: string }[] = scale
    .filter((r) => isFiniteNum(r.min) || isFiniteNum(r.max))
    .map((r) => ({ code: r.grade, description: r.description }))
  const scaleSet = configuredLevels.length ? configuredLevels : [{ code: 'EE', description: 'Exceeding Expectation' }, { code: 'ME', description: 'Meeting Expectation' }, { code: 'AE', description: 'Approaching Expectation' }, { code: 'BE', description: 'Below Expectation' }]
  // Preserve EE/ME/AE/BE order when present.
  const orderedLevels = [...scaleSet].sort((a, b) => {
    const order = ['EE', 'ME', 'AE', 'BE']
    return order.indexOf(a.code) - order.indexOf(b.code) || a.code.localeCompare(b.code)
  })
  const performanceDistribution: AnalysisLevel[] = orderedLevels.map((lv) => {
    const lvl = lv.code
    const count = assessedLeaners.filter((l) => (l.overallLevel || '—') === lvl).length
    return {
      code: lvl,
      description: lv.description,
      count,
      percentage: assessedCount ? (count / assessedCount) * 100 : null,
      color: levelColor(lvl),
    }
  })

  // Learning-area results computed from assessed learners only.
  const learningAreaResults: AnalysisLearningAreaResult[] = learningAreas.map((area) => {
    const scores: number[] = []
    for (const l of assessedLeaners) {
      const s = l.subjects.find((x) => x.subjectId === area.subjectId)?.score
      if (isFiniteNum(s)) scores.push(s!)
    }
    const insufficient = scores.length < 2
    let highestName: string | null = null
    let highestScore: number | null = null
    let lowestName: string | null = null
    let lowestScore: number | null = null
    if (scores.length >= 2) {
      const maxIdx = scores.indexOf(Math.max(...scores))
      const minIdx = scores.indexOf(Math.min(...scores))
      highestScore = scores[maxIdx]
      lowestScore = scores[minIdx]
      highestName = assessedLeaners[maxIdx]?.student.full_name ?? null
      lowestName = assessedLeaners[minIdx]?.student.full_name ?? null
    }
    return {
      subjectId: area.subjectId,
      subjectName: area.subjectName,
      meanPercentage: insufficient || !scores.length ? null : meanOf(scores),
      highestName,
      highestScore,
      lowestName,
      lowestScore,
      insufficient: insufficient || !scores.length,
    }
  })

  // Score distribution histogram.
  const bins: { label: string; from: number; to: number }[] = [
    { label: '0–20%', from: 0, to: 20 },
    { label: '21–40%', from: 21, to: 40 },
    { label: '41–60%', from: 41, to: 60 },
    { label: '61–80%', from: 61, to: 80 },
    { label: '81–100%', from: 81, to: 100 },
  ]
  const scoreDistribution: HistogramBin[] = bins.map((b) => {
    const count = percents.filter((p) => p >= b.from - 0.0001 && p <= b.to + 0.0001).length
    return { label: b.label, from: b.from, to: b.to, count, percentage: assessedCount ? (count / assessedCount) * 100 : null }
  })

  // Insights + recommendations generated from actual values.
  const insights: Insight[] = []
  const recommendations: Recommendation[] = []
  if (assessedCount === 0) {
    insights.push({ kind: 'coverage', text: 'No learners have valid recorded results for this Grade and Assessment, so no performance statistics could be computed.' })
    recommendations.push({ category: 'Assessment Capture', text: 'Record assessment results for the enrolled learners before using the analysis for whole-Grade conclusions.' })
  } else {
    const validAreas = learningAreaResults.filter((a) => !a.insufficient && isFiniteNum(a.meanPercentage))
    if (validAreas.length) {
      const sortable = validAreas.filter((a) => a.meanPercentage !== null)
      sortable.sort((a, b) => (a.meanPercentage ?? 0) - (b.meanPercentage ?? 0))
      const weakest = sortable[0]
      const strongest = sortable[sortable.length - 1]
      const overall = classMeanPercentage ?? 0
      if (strongest && isFiniteNum(strongest.meanPercentage)) {
        const diff = (strongest.meanPercentage ?? 0) - overall
        insights.push({
          kind: diff >= 0 ? 'strength' : 'info',
          text: `${strongest.subjectName} is the strongest Learning Area at ${formatCd(strongest.meanPercentage ?? 0)}%, ${diff >= 0 ? 'exceeding' : 'differing from'} the overall Grade mean by ${Math.abs(diff).toFixed(1)} percentage points.`,
        })
        recommendations.push({
          category: 'Learning Area Support',
          text: `${strongest.subjectName} is a relative strength at ${formatCd(strongest.meanPercentage ?? 0)}%; consider modelling the approach used there.`,
        })
      }
      if (weakest && isFiniteNum(weakest.meanPercentage)) {
        const diff = overall - (weakest.meanPercentage ?? 0)
        insights.push({
          kind: 'weakness',
          text: `${weakest.subjectName} is the weakest Learning Area at ${formatCd(weakest.meanPercentage ?? 0)}%, approximately ${diff.toFixed(1)} percentage points below the overall Grade mean.`,
        })
        recommendations.push({ category: 'Learning Area Support', text: `Prioritise reinforcement in ${weakest.subjectName}.` })
      }
    }
    if (coveragePercentage < 100) {
      insights.push({
        kind: 'coverage',
        text: `Statistical analysis is based on the ${assessedCount} of ${enrolledCount} enrolled learners with valid recorded results (${formatCd(coveragePercentage)}% coverage). Learners without recorded results are excluded from performance calculations.`,
      })
      recommendations.push({
        category: 'Assessment Capture',
        text: `Follow up on the ${enrolledCount - assessedCount} learners without a complete recorded assessment before using this analysis to make whole-Grade conclusions.`,
      })
    }
    if (anomalies.length) {
      recommendations.push({ category: 'Data Quality', text: `Verify the ${anomalies.length} flagged partial/inconsistent assessment record(s) before the next reporting cycle.` })
      insights.push({ kind: 'info', text: `${anomalies.length} partial or inconsistent record(s) were detected and excluded from statistics.` })
    }
  }

  const coverageWarning =
    assessedCount === 0
      ? 'No learners have valid recorded results for this Grade and Assessment.'
      : `Data coverage: ${formatCd(coveragePercentage)}%. Only ${assessedCount} of ${enrolledCount} enrolled learners have valid recorded results. Class statistics and performance-level distributions are calculated from those assessed learners only.`

  // Trend: comparable prior assessments for the same class. Only included when
  // at least one genuinely comparable prior point exists.
  const trend: TrendPoint[] = await computeTrend(tenantId, cls.id, examId)

  const scope: AnalysisScope = {
    schoolName: tenantRes?.name ?? 'School',
    schoolCode: tenantRes?.code ?? null,
    schoolAddress: tenantRes?.address ?? null,
    schoolLogoUrl: tenantRes?.logo_url ?? null,
    gradeId: cls.id,
    gradeName: cls.name,
    streamId: effectiveStreamId,
    streamName: effectiveStreamName,
    examId: exam.id,
    examName: exam.name,
    term: exam.term ?? null,
    academicYear: exam.academic_year ?? null,
    assessmentComponent: (exam.assessment_component as 'mid_term' | 'end_term' | null) ?? null,
    classTeacherName: cls.teacher_name ?? null,
  }

  return {
    scope,
    learningAreas,
    maxTotal,
    enrolledCount,
    assessedCount,
    partialCount,
    unassessedCount,
    coveragePercentage,
    classMeanPercentage: isFiniteNum(classMeanPercentage) ? classMeanPercentage : null,
    medianPercentage: isFiniteNum(medianPercentage) ? medianPercentage : null,
    standardDeviation: isFiniteNum(standardDeviation) ? standardDeviation : null,
    highestPercentage,
    lowestPercentage,
    topLearner: top ? { name: top.student.full_name ?? '—', total: top.total, percentage: top.percentage } : null,
    performanceDistribution,
    learningAreaResults,
    ranking,
    scoreDistribution,
    trend,
    anomalies,
    unassessedLearners: unassessedRows.map((s) => ({ studentId: s.id, admissionNo: s.admission_no ?? '—', fullName: s.full_name ?? '' })),
    insights,
    recommendations,
    coverageWarning,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Computes prior comparable assessments for the same class's mean percentage.
 * An assessment is "comparable" when it is scoped to the same class and is
 * ordered before the current one (by academic year, then term). Only returns
 * historical points that genuinely have at least one fully-assessed learner.
 */
async function computeTrend(
  tenantId: string,
  classId: string,
  currentExamId: string,
): Promise<TrendPoint[]> {
  const supabase = await createClient()
  const { data: exams } = await supabase
    .from('exams')
    .select('id,name,term,academic_year')
    .eq('tenant_id', tenantId)
    .order('academic_year', { ascending: true })
    .order('term', { ascending: true })

  const { data: links } = await supabase.from('exam_classes').select('exam_id').eq('class_id', classId)
  const classExamIds = new Set((links ?? []).map((l) => l.exam_id))
  const current = exams?.find((e) => e.id === currentExamId)
  if (!current || !exams || !classExamIds.size) return []

  const termRank: Record<string, number> = { 'TERM 1': 1, 'TERM 2': 2, 'TERM 3': 3 }
  const rankOf = (e: { term: string | null; academic_year: number | null }) => {
    const y = e.academic_year ?? 0
    const t = e.term ? (termRank[e.term.toUpperCase()] ?? 9) : 9
    return y * 10 + t
  }
  const currentRank = rankOf(current)

  const priorExams = exams
    .filter((e) => e.id !== current.id && classExamIds.has(e.id) && rankOf(e) < currentRank)

  const points: TrendPoint[] = []
  for (const exam of priorExams) {
    const { data: areaLinks } = await supabase
      .from('exam_class_subjects')
      .select('subject_id')
      .eq('exam_id', exam.id)
      .eq('class_id', classId)
      .then((res) => res, () => ({ data: null as null }))
    const areas = (areaLinks ?? []).map((l) => l.subject_id)
    if (!areas.length) continue
    const { data: students } = await supabase
      .from('students')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('class_id', classId)
    const ids = (students ?? []).map((s) => s.id)
    if (!ids.length) continue
    const { data: marks } = await supabase
      .from('marks')
      .select('student_id,subject_id,score')
      .eq('tenant_id', tenantId)
      .eq('exam_id', exam.id)
      .in('student_id', ids)
    const areaSet = new Set(areas)
    const byStudent = new Map<string, number[]>()
    for (const m of marks ?? []) {
      if (!areaSet.has(m.subject_id)) continue
      let arr = byStudent.get(m.student_id)
      if (!arr) { arr = []; byStudent.set(m.student_id, arr) }
      arr.push(Number(m.score))
    }
    const maxTotal = areas.length * 100
    const totals = [...byStudent.values()]
      .filter((scores) => scores.length >= areas.length)
      .map((scores) => computeTotal(scores))
    if (!totals.length) continue
    const meanTotal = meanOf(totals)
    const meanPercent = maxTotal > 0 ? computePercent(meanTotal, maxTotal) : null
    if (meanPercent === null) continue
    const label = [exam.term, exam.academic_year].filter(Boolean).join(' ')
    points.push({ label: label || exam.name, percentage: meanPercent })
  }
  return points
}

/**
 * Per-learner assessment trend across an admin's exams, for the learner
 * drill-down. Scoped to the learner's own class and tenant.
 */
export async function getLearnerTrend(tenantId: string, studentId: string): Promise<LearnerTrendScores[]> {
  const supabase = await createClient()
  const { data: student } = await supabase.from('students').select('id,class_id').eq('id', studentId).eq('tenant_id', tenantId).maybeSingle()
  const { data: exams } = await supabase
    .from('exams')
    .select('id,name,term,academic_year')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  const scale = await getTenantGradingScale(tenantId)
  const totalScale = await getTenantTotalGradingScale(tenantId)

  const classId = student?.class_id ?? null
  if (!classId) return []
  const { data: classStudents } = await supabase.from('students').select('id').eq('tenant_id', tenantId).eq('class_id', classId)
  const classStudentIds = (classStudents ?? []).map((s) => s.id)
  const examIds = (exams ?? []).map((e) => e.id)
  if (examIds.length === 0) return []

  const [{ data: subjectLinks }, { data: marksRows }] = await Promise.all([
    supabase
      .from('exam_class_subjects')
      .select('exam_id,subject_id')
      .eq('class_id', classId)
      .in('exam_id', examIds)
      .then((res) => res, (reason: unknown) => ({ data: null as null, error: reason })),
    supabase
      .from('marks')
      .select('student_id,subject_id,score,exam_id')
      .eq('tenant_id', tenantId)
      .in('exam_id', examIds)
      .in('student_id', classStudentIds),
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
