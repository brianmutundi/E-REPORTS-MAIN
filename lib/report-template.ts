import type { SupabaseClient } from '@supabase/supabase-js'

export type AssessmentComponents = {
  midTerm: boolean
  endTerm: boolean
  average: boolean
}

export type ReportTemplate = {
  school: { name: boolean; logo: boolean; contact: boolean }
  student: { name: boolean; admissionNo: boolean; className: boolean; stream: boolean }
  examination: { name: boolean; academicYear: boolean; term: boolean }
  results: { learningArea: boolean; marks: boolean; grade: boolean; gradeDescription: boolean; total: boolean; average: boolean; position: boolean }
  additional: { teacherComment: boolean; overallComment: boolean; signatureArea: boolean }
  assessmentComponents: AssessmentComponents
}

export const defaultAssessmentComponents: AssessmentComponents = {
  // Defaults are applied when a template has not stored its own choice.
  midTerm: true,
  endTerm: true,
  average: true,
}

export const defaultReportTemplate: ReportTemplate = {
  school: { name: true, logo: true, contact: true },
  student: { name: true, admissionNo: true, className: true, stream: true },
  examination: { name: true, academicYear: true, term: true },
  results: { learningArea: true, marks: true, grade: true, gradeDescription: true, total: true, average: true, position: true },
  additional: { teacherComment: true, overallComment: true, signatureArea: true },
  assessmentComponents: defaultAssessmentComponents,
}

/**
 * Sensible default teacher/principal remark banks, used both as the editable
 * starting values in Report Settings and as the runtime fallback when a
 * school has not yet saved remarks. They are fully editable by the user and
 * remain linked to the learner's achievement level (best→worst order).
 */
export const DEFAULT_TEACHER_REMARKS = [
  'Excellent progress — outstanding performance',
  'Very good progress — keep it up',
  'Good progress — strive for better',
  'Needs improvement — extra effort required',
]

export const DEFAULT_PRINCIPAL_REMARKS = [
  'Promoted to the next level with distinction',
  'Promoted to the next level',
  'Overall performance satisfactory — needs improvement',
  'Needs closer support',
]

function bool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

export function normalizeAssessmentComponents(value: unknown): AssessmentComponents {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    midTerm: bool(v.midTerm, defaultAssessmentComponents.midTerm),
    endTerm: bool(v.endTerm, defaultAssessmentComponents.endTerm),
    average: bool(v.average, defaultAssessmentComponents.average),
  }
}

export function normalizeReportTemplate(value: unknown): ReportTemplate {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, any>
  return {
    school: { name: bool(v.school?.name, true), logo: bool(v.school?.logo, true), contact: bool(v.school?.contact, false) },
    student: { name: bool(v.student?.name, true), admissionNo: bool(v.student?.admissionNo, true), className: bool(v.student?.className, true), stream: bool(v.student?.stream, false) },
    examination: { name: bool(v.examination?.name, true), academicYear: bool(v.examination?.academicYear, true), term: bool(v.examination?.term, true) },
    results: { learningArea: bool(v.results?.learningArea, true), marks: bool(v.results?.marks, true), grade: bool(v.results?.grade, true), gradeDescription: bool(v.results?.gradeDescription, true), total: bool(v.results?.total, true), average: bool(v.results?.average, true), position: bool(v.results?.position, true) },
    additional: { teacherComment: bool(v.additional?.teacherComment, false), overallComment: bool(v.additional?.overallComment, false), signatureArea: bool(v.additional?.signatureArea, true) },
    assessmentComponents: normalizeAssessmentComponents(v.assessmentComponents),
  }
}

export const templateFields: { section: keyof Omit<ReportTemplate, 'assessmentComponents'>; key: string; label: string }[] = [
  { section: 'school', key: 'name', label: 'School name' },
  { section: 'school', key: 'logo', label: 'School logo' },
  { section: 'school', key: 'contact', label: 'School contact details (P.O Box / address)' },
  { section: 'student', key: 'name', label: 'Student name' },
  { section: 'student', key: 'admissionNo', label: 'Admission number' },
  { section: 'student', key: 'className', label: 'Class' },
  { section: 'student', key: 'stream', label: 'Stream' },
  { section: 'examination', key: 'name', label: 'Examination name' },
  { section: 'examination', key: 'academicYear', label: 'Academic year' },
  { section: 'examination', key: 'term', label: 'Term / period' },
  { section: 'results', key: 'learningArea', label: 'Learning area' },
  { section: 'results', key: 'grade', label: 'Level (grade)' },
  { section: 'results', key: 'gradeDescription', label: 'Grade description' },
  { section: 'results', key: 'total', label: 'Total' },
  { section: 'results', key: 'average', label: 'Average / mean' },
  { section: 'results', key: 'position', label: 'Grade (position)' },
  { section: 'additional', key: 'teacherComment', label: 'Class teacher remark' },
  { section: 'additional', key: 'overallComment', label: 'Head teacher remark' },
  { section: 'additional', key: 'signatureArea', label: 'Signature area' },
]

export type ReportTenant = { name: string; code: string | null; logo_url: string | null; address: string | null }

/**
 * Loads school details for report forms. Reads the optional `address`
 * column and tolerates its absence so the app still works before the
 * add-tenant-address migration is applied to a project.
 */
export async function getReportTenant(supabase: SupabaseClient, tenantId: string): Promise<ReportTenant | null> {
  const { data, error } = await supabase.from('tenants').select('name,code,logo_url,address').eq('id', tenantId).maybeSingle()
  if (!error && data) return data as ReportTenant
  const { data: basic } = await supabase.from('tenants').select('name,code,logo_url').eq('id', tenantId).maybeSingle()
  return basic ? { ...basic, address: null } : null
}
