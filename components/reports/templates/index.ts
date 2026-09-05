import React from 'react'
import type { ReactElement } from 'react'
import type { GradeRule } from '@/lib/grading'
import { remarkForLevel } from '@/lib/grading'
import type { ReportTemplate, ReportTemplateKey } from '@/lib/report-template'
import type { AssessmentReportRow } from '@/lib/results'
import StandardReportTemplate from './StandardReportTemplate'
import AssessmentReportCBC, { type AssessmentReportData } from './AssessmentReportCBC'

export const REPORT_TEMPLATES = {
  standard: StandardReportTemplate,
  cbc_4level: AssessmentReportCBC,
} as const

export type ReportRenderProps = {
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

function schoolInitials(name: string): string {
  const initials = name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return initials || 'SCH'
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '_____________'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function levelRange(min: number, max: number): string {
  const lo = Math.ceil(min)
  const hi = Math.floor(max)
  return lo === hi ? `${lo}` : `${lo} - ${hi}`
}

export function buildCbcData(props: ReportRenderProps): AssessmentReportData {
  const { tenant, examName, term, academicYear, className, result, openingDate, closingDate, teacherRemarks, principalRemarks, gradingScale = [], teacherName, principalName } = props
  const teacherRemark = remarkForLevel(result.overallLevel, gradingScale, teacherRemarks)
  const principalRemark = remarkForLevel(result.overallLevel, gradingScale, principalRemarks)
  const termTitle = `${examName}${term ? ` · ${term}` : ''}${academicYear ? ` · ${academicYear}` : ''}`
  return {
    school: {
      name: tenant.name,
      box_number: tenant.address ?? '________________',
      location: '',
      logo_url: tenant.logo_url ?? undefined,
      initials: schoolInitials(tenant.name),
    },
    student: {
      name: result.fullName,
      admission_number: result.admissionNo,
      grade: className,
    },
    exam: { term_title: termTitle },
    performance_levels: gradingScale.map((r) => ({
      code: r.grade,
      code_slug: r.grade.slice(0, 2).toLowerCase(),
      name: r.name ?? r.description,
      range: levelRange(r.min, r.max),
    })),
    subjects: result.subjects.map((s) => {
      const score = s.average ?? s.endTerm ?? s.midTerm
      return {
        name: s.subjectName,
        score: score === null ? 'ABS' : score.toFixed(2),
        level_code: s.grade || '—',
        level_slug: s.grade ? s.grade.slice(0, 2).toLowerCase() : 'be',
        level_description: s.gradeDescription || '—',
      }
    }),
    summary: {
      total_score: result.total === null ? '—' : `${result.total}`,
      overall_level_code: result.overallLevel,
      overall_level_name: result.overallDescription || '—',
    },
    term: {
      closing_date: formatDate(closingDate),
      opening_date: formatDate(openingDate),
    },
    financials: {
      fee_balance: '________________',
      next_term_fee: '________________',
    },
    remarks: {
      teacher: { text: teacherRemark || '______________________________________________', name: teacherName ?? '________________' },
      principal: { text: principalRemark || '______________________________________________', name: principalName ?? '________________' },
    },
  }
}

export function renderReport(key: ReportTemplateKey, props: ReportRenderProps): ReactElement {
  if (key === 'cbc_4level') {
    return React.createElement(AssessmentReportCBC, { data: buildCbcData(props) })
  }
  return React.createElement(StandardReportTemplate, props)
}