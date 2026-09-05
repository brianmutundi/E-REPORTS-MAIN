// Assessment Analysis model types.
//
// The CBC palette used for performance levels across every surface (web
// preview and PDF). Covers both the 4-level (EE/ME/AE/BE) and 8-level
// (EE1..BE2) code sets so charts stay visually consistent and mode-aware.
// The preferred colour for a level comes from the active grading
// configuration (lib/grading.ts); these are only fallbacks.
export const LEVEL_COLOR: Record<string, string> = {
  EE: '#15803d',
  ME: '#2563eb',
  AE: '#d97706',
  BE: '#dc2626',
  EE1: '#15803d',
  EE2: '#22c55e',
  ME1: '#2563eb',
  ME2: '#60a5fa',
  AE1: '#d97706',
  AE2: '#f59e0b',
  BE1: '#dc2626',
  BE2: '#f87171',
}

export const LEVEL_DEFAULT: { code: string; description: string; color: string }[] = [
  { code: 'EE', description: 'Exceeding Expectation', color: LEVEL_COLOR.EE },
  { code: 'ME', description: 'Meeting Expectation', color: LEVEL_COLOR.ME },
  { code: 'AE', description: 'Approaching Expectation', color: LEVEL_COLOR.AE },
  { code: 'BE', description: 'Below Expectation', color: LEVEL_COLOR.BE },
]

// Fallback used only when a configured level has no known colour.
export function levelColor(code: string): string {
  return LEVEL_COLOR[code] ?? '#64748b'
}

export type AnalysisScope = {
  schoolName: string
  schoolCode: string | null
  schoolAddress: string | null
  schoolLogoUrl: string | null
  gradeId: string
  gradeName: string
  streamId: string | null
  streamName: string | null
  examId: string
  examName: string
  term: string | null
  academicYear: number | null
  assessmentComponent: 'mid_term' | 'end_term' | null
  classTeacherName: string | null
}

export type AnalysisLearnerSubject = {
  subjectId: string
  subjectName: string
  score: number | null
}

export type AnalysisAssessedLearner = {
  studentId: string
  admissionNo: string
  fullName: string
  assessedCount: number
  expectedCount: number
  total: number
  percentage: number
  overallLevel: string
  overallDescription: string
  subjects: AnalysisLearnerSubject[]
}

export type AnalysisRankRow = AnalysisAssessedLearner & { position: number }

export type AnalysisLevel = {
  code: string
  description: string
  count: number
  percentage: number | null
  color: string
}

export type AnalysisLearningAreaResult = {
  subjectId: string
  subjectName: string
  meanPercentage: number | null
  highestName: string | null
  highestScore: number | null
  lowestName: string | null
  lowestScore: number | null
  insufficient: boolean
  /** Per-level learner counts for this learning area, aligned with the active grading scale. */
  distribution: AnalysisLevel[]
}

export type HistogramBin = {
  label: string
  from: number
  to: number
  count: number
  percentage: number | null
}

export type Insight = {
  kind: 'strength' | 'weakness' | 'coverage' | 'concentration' | 'info'
  text: string
}

export type Anomaly = {
  learnerName: string
  admissionNo: string
  reason: string
}

export type Recommendation = {
  category: 'Assessment Capture' | 'Learning Area Support' | 'Data Quality' | 'Trend'
  text: string
}

export type TrendPoint = {
  label: string
  percentage: number
}

// Per-learner assessment trend used by the learner drill-down endpoint.
export type LearnerTrendScores = {
  examId: string
  examName: string
  term: string | null
  academicYear: number | null
  total: number | null
  percent: number | null
  overallLevel: string
  overallDescription: string
  position: number | null
  positions: { classId: string; className: string; position: number }[]
}

export type AssessmentAnalysisModel = {
  scope: AnalysisScope
  learningAreas: { subjectId: string; subjectName: string }[]
  maxTotal: number
  enrolledCount: number
  assessedCount: number
  partialCount: number
  unassessedCount: number
  coveragePercentage: number
  classMeanPercentage: number | null
  medianPercentage: number | null
  standardDeviation: number | null
  highestPercentage: number | null
  lowestPercentage: number | null
  topLearner: { name: string; total: number; percentage: number } | null
  performanceDistribution: AnalysisLevel[]
  learningAreaResults: AnalysisLearningAreaResult[]
  ranking: AnalysisRankRow[]
  scoreDistribution: HistogramBin[]
  trend: TrendPoint[]
  anomalies: Anomaly[]
  unassessedLearners: { studentId: string; admissionNo: string; fullName: string }[]
  insights: Insight[]
  recommendations: Recommendation[]
  coverageWarning: string | null
  generatedAt: string
}
