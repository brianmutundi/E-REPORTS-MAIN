import { NextRequest } from 'next/server'
import { Document, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { getConfiguredAssessmentResults } from '@/lib/results'
import { getReportTenant, normalizeReportTemplate, validTemplateKey, REPORT_TEMPLATE_KEYS, type ReportTemplateKey } from '@/lib/report-template'
import { getTenantGradingScale } from '@/lib/grading'
import { renderReport, type ReportRenderProps } from '@/components/reports/templates'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return new Response('No school linked', { status: 403 })
  const throttled = limitAuthenticatedRoute(request.headers, user.id, 'reports-pdf', 30)
  if (throttled) return throttled
  const url = new URL(request.url)
  const examId = url.searchParams.get('exam')
  const classId = url.searchParams.get('class')
  const studentId = url.searchParams.get('student')
  const streamId = url.searchParams.get('stream')?.trim() || undefined
  if (!examId || !classId) return new Response('exam and class are required', { status: 400 })

  const clsRes = await supabase.from('classes').select('id,name,teacher_name,principal_name').eq('id', classId).eq('tenant_id', profile.tenant_id).maybeSingle()
  const cls = clsRes.error
    ? (await supabase.from('classes').select('id,name').eq('id', classId).eq('tenant_id', profile.tenant_id).maybeSingle()).data as { id: string; name: string } | null
    : clsRes.data as { id: string; name: string; teacher_name?: string | null; principal_name?: string | null } | null
  const [{ data: exam }, tplState] = await Promise.all([
    supabase.from('exams').select('id,name,term,academic_year').eq('id', examId).eq('tenant_id', profile.tenant_id).maybeSingle(),
    supabase.from('report_templates').select('id,template_json,template_key').eq('tenant_id', profile.tenant_id).eq('is_default', true).maybeSingle(),
  ])
  // The template_key column is added by a later migration; the reports PDF must
  // keep working for projects where it has not been applied yet.
  let templateRow: { id: string; template_json: unknown; template_key?: string | null } | null = tplState.data ?? null
  if (!templateRow && tplState.error) {
    const fallbackRes = await supabase.from('report_templates').select('id,template_json').eq('tenant_id', profile.tenant_id).eq('is_default', true).maybeSingle()
    if (!fallbackRes.error) templateRow = fallbackRes.data
  }
  const tenant = await getReportTenant(supabase, profile.tenant_id)
  if (!exam || !cls || !tenant) return new Response('Report scope not found', { status: 404 })
  const scope = {
    className: cls.name,
    teacherName: (cls as { teacher_name?: string | null }).teacher_name ?? null,
    principalName: (cls as { principal_name?: string | null }).principal_name ?? null,
  }
  const template = normalizeReportTemplate(templateRow?.template_json)
  const rowKey = templateRow?.template_key
  const templateKey: ReportTemplateKey = validTemplateKey(rowKey) ? rowKey : REPORT_TEMPLATE_KEYS[0]
  const gradingScale = await getTenantGradingScale(profile.tenant_id)
  const configured = await getConfiguredAssessmentResults(examId, classId, template.assessmentComponents, streamId)
  if (configured.error) return new Response(configured.error, { status: 409 })
  const selected = studentId ? configured.rows.filter(r => r.studentId === studentId) : configured.rows
  if (!selected.length) return new Response('No report data found', { status: 404 })

  const [{ data: config }, { data: teacherRows }, { data: principalRows }] = templateRow?.id ? await Promise.all([
    supabase.from('report_template_configs').select('opening_date,closing_date,teacher_remarks_enabled,principal_remarks_enabled').eq('report_template_id', templateRow.id).maybeSingle(),
    supabase.from('report_teacher_remarks').select('remark,sort_order').eq('report_template_id', templateRow.id).order('sort_order'),
    supabase.from('report_principal_remarks').select('remark,sort_order').eq('report_template_id', templateRow.id).order('sort_order'),
  ]) : [{ data: null }, { data: null }, { data: null }]
  const teacherRemarks = config?.teacher_remarks_enabled ? teacherRows?.map(r => r.remark) ?? [] : []
  const principalRemarks = config?.principal_remarks_enabled ? principalRows?.map(r => r.remark) ?? [] : []

  const pdf = await renderToBuffer(<Document>{selected.map(result => renderReport(templateKey, {
    tenant, examName: exam.name, term: exam.term, academicYear: exam.academic_year, className: scope.className, template, result, openingDate: config?.opening_date, closingDate: config?.closing_date, teacherRemarks, principalRemarks, gradingScale, teacherName: scope.teacherName, principalName: scope.principalName,
  } satisfies ReportRenderProps))}</Document>)
  const filename = studentId ? `report-${selected[0].admissionNo}.pdf` : `reports-${scope.className.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`
  return new Response(pdf as unknown as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } })
}