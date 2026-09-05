import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export type AssessmentComponents = { midTerm: boolean; endTerm: boolean; average: boolean }
export const REPORT_TEMPLATE_KEYS = ['standard', 'cbc_4level'] as const
export type ReportTemplateKey = (typeof REPORT_TEMPLATE_KEYS)[number]
export const REPORT_TEMPLATE_LABELS: Record<ReportTemplateKey, string> = { standard: 'Standard Assessment Report', cbc_4level: 'CBC 4-Level Assessment Report' }
export function validTemplateKey(value: unknown): value is ReportTemplateKey { return REPORT_TEMPLATE_KEYS.some((key) => key === value) }
export type ReportTemplate = {
  school: { name: boolean; logo: boolean; contact: boolean }
  student: { name: boolean; admissionNo: boolean; className: boolean; stream: boolean }
  examination: { name: boolean; academicYear: boolean; term: boolean }
  results: { learningArea: boolean; marks: boolean; grade: boolean; gradeDescription: boolean; total: boolean; average: boolean }
  additional: { teacherComment: boolean; overallComment: boolean; signatureArea: boolean }
  assessmentComponents: AssessmentComponents
}
export const defaultAssessmentComponents: AssessmentComponents = { midTerm: false, endTerm: true, average: true }
export const defaultReportTemplate: ReportTemplate = {
  school: { name: true, logo: true, contact: false }, student: { name: true, admissionNo: true, className: true, stream: false }, examination: { name: true, academicYear: true, term: true }, results: { learningArea: true, marks: true, grade: true, gradeDescription: true, total: true, average: true }, additional: { teacherComment: false, overallComment: false, signatureArea: true }, assessmentComponents: defaultAssessmentComponents,
}
function bool(value: unknown, fallback: boolean) { return typeof value === 'boolean' ? value : fallback }
export function normalizeAssessmentComponents(value: unknown): AssessmentComponents { const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>; return { midTerm: bool(v.midTerm, false), endTerm: bool(v.endTerm, true), average: bool(v.average, true) } }
export function normalizeReportTemplate(value: unknown): ReportTemplate { const v = (value && typeof value === 'object' ? value : {}) as Record<string, any>; return { school: { name: bool(v.school?.name, true), logo: bool(v.school?.logo, true), contact: bool(v.school?.contact, false) }, student: { name: bool(v.student?.name, true), admissionNo: bool(v.student?.admissionNo, true), className: bool(v.student?.className, true), stream: bool(v.student?.stream, false) }, examination: { name: bool(v.examination?.name, true), academicYear: bool(v.examination?.academicYear, true), term: bool(v.examination?.term, true) }, results: { learningArea: bool(v.results?.learningArea, true), marks: bool(v.results?.marks, true), grade: bool(v.results?.grade, true), gradeDescription: bool(v.results?.gradeDescription, true), total: bool(v.results?.total, true), average: bool(v.results?.average, true) }, additional: { teacherComment: bool(v.additional?.teacherComment, false), overallComment: bool(v.additional?.overallComment, false), signatureArea: bool(v.additional?.signatureArea, true) }, assessmentComponents: normalizeAssessmentComponents(v.assessmentComponents) } }
export const templateFields: { section: keyof Omit<ReportTemplate, 'assessmentComponents'>; key: string; label: string }[] = [
  { section: 'school', key: 'name', label: 'School name' }, { section: 'school', key: 'logo', label: 'School logo' }, { section: 'school', key: 'contact', label: 'School contact details (P.O Box / address)' }, { section: 'student', key: 'name', label: 'Student name' }, { section: 'student', key: 'admissionNo', label: 'Admission number' }, { section: 'student', key: 'className', label: 'Grade' }, { section: 'student', key: 'stream', label: 'Stream' }, { section: 'examination', key: 'name', label: 'Examination name' }, { section: 'examination', key: 'academicYear', label: 'Academic year' }, { section: 'examination', key: 'term', label: 'Term / period' }, { section: 'results', key: 'learningArea', label: 'Learning area' }, { section: 'results', key: 'grade', label: 'Level (grade)' }, { section: 'results', key: 'gradeDescription', label: 'Grade description' }, { section: 'results', key: 'total', label: 'Total' }, { section: 'results', key: 'average', label: 'Average / mean' }, { section: 'additional', key: 'teacherComment', label: 'Grade class teacher remark' }, { section: 'additional', key: 'overallComment', label: 'Principal remark' }, { section: 'additional', key: 'signatureArea', label: 'Signature area' },
]
export type ReportTenant = { name: string; logo_url: string | null; address: string | null }

/** Resolve only the already-authenticated tenant. The caller must obtain tenantId from getDashboardSession. */
export async function getReportTenant(supabase: SupabaseClient, tenantId: string): Promise<ReportTenant | null> {
  if (!tenantId) return null

  // Diagnostic trail across every branch below, so a null return can always be
  // explained afterwards instead of collapsing into one generic message. Each
  // entry records which lookup ran and exactly why it did not return a row:
  // a thrown/config error, a Postgres/PostgREST error, or a clean zero-row
  // result (no error, no data) which is a data-state fact, not a failure.
  const trail: Array<{ step: string; outcome: string; detail?: string }> = []

  // This function is called only from server-side report/dashboard code. The
  // tenantId comes from the authenticated dashboard session, not the URL.
  // Querying that exact tenant with the service-role client avoids a false
  // "profile missing" result when tenant RLS/PostgREST visibility is the issue,
  // while still preserving tenant isolation at the application boundary.
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('tenants')
      .select('name,logo_url,address')
      .eq('id', tenantId)
      .maybeSingle()
    if (!error && data) return data as ReportTenant
    if (error) trail.push({ step: 'admin_client', outcome: 'query_error', detail: error.message })
    else trail.push({ step: 'admin_client', outcome: 'zero_rows' })
  } catch (error) {
    trail.push({ step: 'admin_client', outcome: 'unavailable', detail: error instanceof Error ? error.message : 'Unknown error' })
  }

  // RLS-protected fallback for environments where the service-role key is not
  // available. It is still constrained to the same authenticated tenantId.
  const primary = await supabase
    .from('tenants')
    .select('name,logo_url,address')
    .eq('id', tenantId)
    .maybeSingle()
  if (!primary.error && primary.data) return primary.data as ReportTenant
  trail.push(
    primary.error
      ? { step: 'rls_client_full_select', outcome: 'query_error', detail: primary.error.message }
      : { step: 'rls_client_full_select', outcome: 'zero_rows' },
  )

  if (primary.error) {
    const basic = await supabase
      .from('tenants')
      .select('name,logo_url')
      .eq('id', tenantId)
      .maybeSingle()
    if (!basic.error && basic.data) return { ...basic.data, address: null } as ReportTenant
    trail.push(
      basic.error
        ? { step: 'rls_client_basic_select', outcome: 'query_error', detail: basic.error.message }
        : { step: 'rls_client_basic_select', outcome: 'zero_rows' },
    )
  }

  // One line, always logged when every lookup path has been exhausted, naming
  // the tenantId and exactly what each branch returned. "zero_rows" on both
  // the service-role and RLS-scoped queries (no query_error anywhere) means
  // there is genuinely no tenants row for this id — a data problem, not RLS
  // or config. A query_error/unavailable entry points at RLS or environment
  // configuration instead.
  console.error('Assessment report tenant lookup exhausted all paths', { tenantId, trail })
  return null
}
