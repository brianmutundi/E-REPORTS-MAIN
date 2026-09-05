import { NextRequest } from 'next/server'
import { Document, renderToBuffer } from '@react-pdf/renderer'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { getConfiguredAssessmentResults, type AssessmentReportRow } from '@/lib/results'
import { getReportTenant, normalizeReportTemplate, validTemplateKey, REPORT_TEMPLATE_KEYS, type ReportTemplateKey } from '@/lib/report-template'
import { getTenantGradingScale } from '@/lib/grading'
import { renderReport, type ReportRenderProps } from '@/components/reports/templates'
import { getEffectiveTermDates, parseTermReference, NEXT_TERM_OPENING_PLACEHOLDER } from '@/lib/terms'
import { getDashboardSession } from '@/lib/supabase/session'

export const runtime = 'nodejs'

function reportError(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  )
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, tenantId } = await getDashboardSession()
    if (!user) return reportError('Please sign in again.', 401)
    if (!tenantId) return reportError('No school is linked to this account.', 403)

    const throttled = limitAuthenticatedRoute(request.headers, user.id, 'reports-pdf', 30)
    if (throttled) return throttled

    const url = new URL(request.url)
    const examId = url.searchParams.get('exam')?.trim() || ''
    const classId = url.searchParams.get('class')?.trim() || ''
    const studentId = url.searchParams.get('student')?.trim() || undefined
    const streamId = url.searchParams.get('stream')?.trim() || undefined
    if (!examId || !classId) return reportError('An assessment and grade are required.', 400)

    // Resolve the exact tenant-owned grade and assessment independently. Do not
    // use a combined truthy check here: it can hide which lookup failed and was
    // previously responsible for a misleading "selected ... could not be found"
    // response when the report page and API session were not resolving the same
    // authenticated tenant context.
    const clsRes = await supabase
      .from('classes')
      .select('id,name,teacher_name,principal_name')
      .eq('id', classId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    const cls = clsRes.error
      ? (await supabase.from('classes').select('id,name').eq('id', classId).eq('tenant_id', tenantId).maybeSingle()).data as { id: string; name: string } | null
      : clsRes.data as { id: string; name: string; teacher_name?: string | null; principal_name?: string | null } | null

    if (!cls) return reportError('The selected grade is no longer available for this school. Please reload the Assessment Reports page and select the grade again.', 404)

    const [{ data: exam }, tplState] = await Promise.all([
      supabase
        .from('exams')
        .select('id,name,term,academic_year')
        .eq('id', examId)
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabase
        .from('report_templates')
        .select('id,template_json,template_key')
        .eq('tenant_id', tenantId)
        .eq('is_default', true)
        .maybeSingle(),
    ])

    if (!exam) return reportError('The selected assessment is no longer available for this school. Please reload the Assessment Reports page and select the assessment again.', 404)

    let templateRow: { id: string; template_json: unknown; template_key?: string | null } | null = tplState.data ?? null
    if (!templateRow && tplState.error) {
      const fallbackRes = await supabase.from('report_templates').select('id,template_json').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
      if (!fallbackRes.error) templateRow = fallbackRes.data
    }

    const tenant = await getReportTenant(supabase, tenantId)
    if (!tenant) return reportError('The school profile could not be loaded for this assessment report.', 404)

    const scope = {
      className: cls.name,
      teacherName: (cls as { teacher_name?: string | null }).teacher_name ?? null,
      principalName: (cls as { principal_name?: string | null }).principal_name ?? null,
    }
    const template = normalizeReportTemplate(templateRow?.template_json)
    const rowKey = templateRow?.template_key
    const templateKey: ReportTemplateKey = validTemplateKey(rowKey) ? rowKey : REPORT_TEMPLATE_KEYS[0]
    const gradingScale = await getTenantGradingScale(tenantId)
    const configured = await getConfiguredAssessmentResults(examId, classId, template.assessmentComponents, streamId)
    if (configured.error) return reportError(configured.error, 409)

    const selected = studentId ? configured.rows.filter(r => r.studentId === studentId) : configured.rows
    if (!selected.length) return reportError('No report data was found for the selected context.', 404)

    const [{ data: config }, { data: teacherRows }, { data: principalRows }] = templateRow?.id ? await Promise.all([
      supabase.from('report_template_configs').select('teacher_remarks_enabled,principal_remarks_enabled').eq('report_template_id', templateRow.id).maybeSingle(),
      supabase.from('report_teacher_remarks').select('remark,sort_order').eq('report_template_id', templateRow.id).order('sort_order'),
      supabase.from('report_principal_remarks').select('remark,sort_order').eq('report_template_id', templateRow.id).order('sort_order'),
    ]) : [{ data: null }, { data: null }, { data: null }]

    const teacherRemarks = config?.teacher_remarks_enabled ? teacherRows?.map(r => r.remark) ?? [] : []
    const principalRemarks = config?.principal_remarks_enabled ? principalRows?.map(r => r.remark) ?? [] : []
    const effectiveDates = await getEffectiveTermDates(
      supabase,
      tenantId,
      parseTermReference({ term: exam.term, academicYear: exam.academic_year }),
    )
    const closingDate = effectiveDates.closingDate
    const openingDate = effectiveDates.openingDate ?? NEXT_TERM_OPENING_PLACEHOLDER

    const makeProps = (result: AssessmentReportRow): ReportRenderProps => ({
      tenant,
      examName: exam.name,
      term: exam.term,
      academicYear: exam.academic_year,
      className: scope.className,
      template,
      result,
      openingDate,
      closingDate,
      teacherRemarks,
      principalRemarks,
      gradingScale,
      teacherName: scope.teacherName,
      principalName: scope.principalName,
    })

    const rendered = await renderToBuffer(
      <Document>{selected.map(r => renderReport(templateKey, makeProps(r)))}</Document>,
    )
    const body = new Uint8Array(rendered)

    // A successful endpoint response must be a real PDF, never HTML/text.
    const pdfSignature = new TextDecoder().decode(body.slice(0, 5))
    if (pdfSignature !== '%PDF-') {
      console.error('Assessment report renderer returned a non-PDF payload', {
        userId: user.id,
        tenantId,
        examId,
        classId,
        studentId,
        byteLength: body.byteLength,
        signature: pdfSignature,
      })
      return reportError('The report renderer did not produce a valid PDF.', 500)
    }

    const filename = studentId
      ? `report-${selected[0].admissionNo}.pdf`
      : `reports-${scope.className.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=\"${filename}\"`,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Assessment report PDF generation failed', error)
    return reportError('The assessment report could not be generated. Please try again.', 500)
  }
}
