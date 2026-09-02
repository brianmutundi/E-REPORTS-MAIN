export type SubjectAnalysis = {
  subjectId: string
  subjectName: string
  learnerCount: number
  assessedCount: number
  average: number | null
  highest: number | null
  lowest: number | null
}

export type StreamAnalysis = {
  streamId: string
  streamName: string
  learnerCount: number
  assessedCount: number
  averageTotal: number | null
  topLearner: string | null
  topTotal: number | null
  levelCounts: Record<string, number>
}

export type LearnerSubjectAnalysis = {
  subjectId: string
  subjectName: string
  score: number | null
  grade: string
  gradeDescription: string
}

export type LearnerAnalysis = {
  studentId: string
  admissionNo: string
  fullName: string
  streamId: string | null
  streamName: string | null
  assessedCount: number
  expectedCount: number
  complete: boolean
  total: number | null
  percent: number | null
  overallLevel: string
  overallDescription: string
  gradePosition: number | null
  streamPosition: number | null
  subjects: LearnerSubjectAnalysis[]
}

export type LevelCount = { grade: string; description: string; count: number }

export type GradeAnalysis = {
  classId: string
  className: string
  learnerCount: number
  assessedCount: number
  averageTotal: number | null
  averagePercent: number | null
  topLearner: string | null
  topTotal: number | null
  levelDistribution: LevelCount[]
  streams: StreamAnalysis[]
  learningAreas: SubjectAnalysis[]
  learners: LearnerAnalysis[]
}

export type AssessmentAnalysis = {
  examId: string
  examName: string
  term: string | null
  academicYear: number | null
  grades: GradeAnalysis[]
}

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

const LEVEL_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#f97316']

export function levelColor(index: number) {
  return LEVEL_COLORS[index % LEVEL_COLORS.length]
}