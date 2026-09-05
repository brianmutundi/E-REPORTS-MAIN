import { NextRequest } from 'next/server'
import { Document, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { getConfiguredAssessmentResults, type AssessmentReportRow } from '@/lib/results'
import { getReportTenant, normalizeReportTemplate, validTemplateKey, REPORT_TEMPLATE_KEYS, type ReportTemplateKey } from '@/lib/report-template'
import { getTenantGradingScale } from '@/lib/grading'
import { renderReport, type ReportRenderProps } from '@/components/reports/templates'
import { getEffectiveTermDates, parseTermReference, NEXT_TERM_OPENING_PLACEHOLDER } from '@/lib/terms'

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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return reportError('Please sign in again.', 401)

    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
    if (!profile?.tenant_id) return reportError('No school is linked to this account.', 403)

    const throttled = limitAuthenticatedRoute(request.headers, user.id, 'reports-pdf', 30)
    if (throttled) return throttled

    const url = new URL(request.url)
    const examId = url.searchParams.get('exam')
    const classId = url.searchParams.get('class')
    const studentId = url.searchParams.get('student')
    const streamId = url.searchParams.get('stream')?.trim() || undefined
    if (!examId || !classId) return reportError('An assessment and grade are required.', 400)

    const clsRes = await supabase.from('classes').select('id,name,teacher_name,principal_name').eq('id', classId).eq('tenant_id', profile.tenant_id).maybeSingle()
    const cls = clsRes.error
      ? (await supabase.from('classes').select('id,name').eq('id', classId).eq('tenant_id', profile.tenant_id).maybeSingle()).data as { id: string; name: string } | null
      : clsRes.data as { id: string; name: string; teacher_name?: string | null; principal_name?: string | null } | null

    const [{ data: exam }, tplState] = await Promise.all([
      supabase.from('exams').select('id,name,term,academic_year').eq('id', examId).eq('tenant_id', profile.tenant_id).maybeSingle(),
      supabase.from('report_templates').select('id,template_json,template_key').eq('tenant_id', profile.tenant_id).eq('is_default', true).maybeSingle(),
    ])

    let templateRow: { id: string; template_json: unknown; template_key?: string | null } | null = tplState.data ?? null
    if (!templateRow && tplState.error) {
      const fallbackRes = await supabase.from('report_templates').select('id,template_json').eq('tenant_id', profile.tenant_id).eq('is_default', true).maybeSingle()
      if (!fallbackRes.error) templateRow = fallbackRes.data
    }

    const tenant = await getReportTenant(supabase, profile.tenant_id)
    if (!exam || !cls || !tenant) return reportError('The selected assessment or grade could not be found.', 404)

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
      profile.tenant_id,
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
        tenantId: profile.tenant_id,
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
        'Content-Disposition': `attachment; filename="${filename}"`,
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
