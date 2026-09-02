import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDashboardSession } from '@/lib/supabase/session'
import { normalizeAssessmentComponents, normalizeReportTemplate } from '@/lib/report-template'
import AssessmentComponentsEditor from './AssessmentComponentsEditor'
import SuccessToast from '@/components/SuccessToast'

const DEFAULT_TEACHER_REMARKS = ['Excellent progress', 'Very good progress', 'Good progress', 'Needs improvement']
const DEFAULT_PRINCIPAL_REMARKS = ['Promoted to the next level', 'Keep up the good work', 'Continue working hard', 'Needs closer support']

function rowsFromForm(formData: FormData, prefix: string) {
  return Array.from({ length: 8 }, (_, i) => String(formData.get(`${prefix}_${i}`) || '').trim()).filter(Boolean)
}

async function saveConfiguration(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/reports/template/configuration?error=No%20school%20is%20linked%20to%20this%20account')

  const teacherRemarks = rowsFromForm(formData, 'teacher')
  const principalRemarks = rowsFromForm(formData, 'principal')
  if (teacherRemarks.length < 4 || teacherRemarks.length > 8) redirect('/dashboard/reports/template/configuration?error=Class%20teacher%20remarks%20must%20contain%204%20to%208%20rows')
  if (principalRemarks.length < 4 || principalRemarks.length > 8) redirect('/dashboard/reports/template/configuration?error=Principal%20remarks%20must%20contain%204%20to%208%20rows')

  const assessmentComponents = {
    midTerm: formData.get('assessment_mid_term') === 'on',
    endTerm: formData.get('assessment_end_term') === 'on',
    average: formData.get('assessment_average') === 'on',
  }
  if (!assessmentComponents.midTerm && !assessmentComponents.endTerm && !assessmentComponents.average) {
    redirect('/dashboard/reports/template/configuration?error=Select%20at%20least%20one%20assessment%20component')
  }

  // Atomic save: template, config and both remark lists change in a single
  // transaction, so concurrent or interrupted saves cannot leave the report
  // configuration partially written or duplicated.
  const { error: configureError } = await supabase.rpc('save_report_configuration', {
    p_opening_date: String(formData.get('opening_date') || '') || null,
    p_closing_date: String(formData.get('closing_date') || '') || null,
    p_teacher_enabled: formData.get('teacher_enabled') === 'on',
    p_principal_enabled: formData.get('principal_enabled') === 'on',
    p_assessment_components: assessmentComponents,
    p_teacher_remarks: teacherRemarks,
    p_principal_remarks: principalRemarks,
  })

  if (configureError) {
    if (configureError.code !== 'PGRST202' && !/cannot find the function|does not exist/i.test(configureError.message ?? '')) {
      redirect(`/dashboard/reports/template/configuration?error=${encodeURIComponent(configureError.message || 'Could not save configuration')}`)
    }
    const { data: template } = await supabase.from('report_templates').select('id,template_json').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
    let templateId = template?.id
    if (!templateId) {
      const { data: created, error } = await supabase.from('report_templates').insert({ tenant_id: tenantId, name: 'Default Report Form', template_json: { assessmentComponents }, is_default: true }).select('id').single()
      if (error || !created) redirect(`/dashboard/reports/template/configuration?error=${encodeURIComponent(error?.message || 'Could not create report template')}`)
      templateId = created.id
    } else {
      const existingTemplate = normalizeReportTemplate(template?.template_json)
      const nextTemplate = { ...existingTemplate, assessmentComponents }
      const { error: templateError } = await supabase.from('report_templates').update({ template_json: nextTemplate }).eq('id', templateId).eq('tenant_id', tenantId)
      if (templateError) redirect(`/dashboard/reports/template/configuration?error=${encodeURIComponent(templateError.message)}`)
    }

    const configPayload = { tenant_id: tenantId, report_template_id: templateId, opening_date: String(formData.get('opening_date') || '') || null, closing_date: String(formData.get('closing_date') || '') || null, teacher_remarks_enabled: formData.get('teacher_enabled') === 'on', principal_remarks_enabled: formData.get('principal_enabled') === 'on' }
    const { error: configError } = await supabase.from('report_template_configs').upsert(configPayload, { onConflict: 'report_template_id' })
    if (configError) redirect(`/dashboard/reports/template/configuration?error=${encodeURIComponent(configError.message)}`)

    const { error: teacherDeleteError } = await supabase.from('report_teacher_remarks').delete().eq('report_template_id', templateId)
    if (teacherDeleteError) redirect(`/dashboard/reports/template/configuration?error=${encodeURIComponent(teacherDeleteError.message)}`)
    const { error: principalDeleteError } = await supabase.from('report_principal_remarks').delete().eq('report_template_id', templateId)
    if (principalDeleteError) redirect(`/dashboard/reports/template/configuration?error=${encodeURIComponent(principalDeleteError.message)}`)
    const { error: teacherError } = await supabase.from('report_teacher_remarks').insert(teacherRemarks.map((remark, i) => ({ tenant_id: tenantId, report_template_id: templateId, remark, sort_order: i })))
    if (teacherError) redirect(`/dashboard/reports/template/configuration?error=${encodeURIComponent(teacherError.message)}`)
    const { error: principalError } = await supabase.from('report_principal_remarks').insert(principalRemarks.map((remark, i) => ({ tenant_id: tenantId, report_template_id: templateId, remark, sort_order: i })))
    if (principalError) redirect(`/dashboard/reports/template/configuration?error=${encodeURIComponent(principalError.message)}`)
  }

  revalidatePath('/dashboard/reports')
  revalidatePath('/dashboard/reports/template')
  revalidatePath('/dashboard/reports/template/configuration')
  revalidatePath('/dashboard/grading')
  revalidatePath('/dashboard/results')
  redirect('/dashboard/reports/template/configuration?saved=1')
}

export default async function ReportTemplateConfigurationPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return <main className="main"><p>Please sign in.</p></main>
  if (!tenantId) return <main className="main"><p>No school is linked to this account.</p></main>
  const { data: template } = await supabase.from('report_templates').select('id,template_json').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  const [{ data: config }, { data: teachers }, { data: principals }] = await Promise.all([
    template?.id ? supabase.from('report_template_configs').select('opening_date,closing_date,teacher_remarks_enabled,principal_remarks_enabled').eq('report_template_id', template.id).maybeSingle() : Promise.resolve({ data: null }),
    template?.id ? supabase.from('report_teacher_remarks').select('remark,sort_order').eq('report_template_id', template.id).order('sort_order') : Promise.resolve({ data: null }),
    template?.id ? supabase.from('report_principal_remarks').select('remark,sort_order').eq('report_template_id', template.id).order('sort_order') : Promise.resolve({ data: null }),
  ])
  const teacherRows = teachers?.map(r => r.remark) ?? DEFAULT_TEACHER_REMARKS
  const principalRows = principals?.map(r => r.remark) ?? DEFAULT_PRINCIPAL_REMARKS
  const templateValue = normalizeReportTemplate(template?.template_json)
  const assessmentComponents = normalizeAssessmentComponents(templateValue.assessmentComponents)

  return <main className="main" style={{ maxWidth: 1100, margin: '0 auto' }}>
    <div className="top"><div><div className="eyebrow">Report template configuration</div><h1 className="title">Report Settings</h1><p className="muted">Configure term dates, assessment components and selectable remarks used by report forms.</p></div><Link className="btn secondary" href="/dashboard/reports/template">Back to template</Link></div>
    {params.error && <div className="notice error">{params.error}</div>}{params.saved && <SuccessToast message="Report configuration saved" />}
    <form action={saveConfiguration} className="template-layout">
      <section className="card">
        <h2>Term dates</h2><p className="muted">These dates are stored with the report template and appear on generated reports.</p>
        <div className="form-grid"><label className="field-label">Opening date<input type="date" name="opening_date" defaultValue={config?.opening_date ?? ''}/></label><label className="field-label">Closing date<input type="date" name="closing_date" defaultValue={config?.closing_date ?? ''}/></label></div>

        <h2 style={{ marginTop: 24 }}>Assessment Components</h2>
        <p className="muted">Select the assessment results you want displayed on this report form.</p>
        <AssessmentComponentsEditor initial={assessmentComponents} />

        <h2 style={{ marginTop: 28 }}>Remarks</h2><p className="muted">Each enabled remark list must contain between 4 and 8 options.</p>
        <label className="toggle-row"><span>Enable class teacher remarks</span><input type="checkbox" name="teacher_enabled" defaultChecked={config?.teacher_remarks_enabled ?? true}/></label>
        <div className="table">{Array.from({ length: 8 }, (_, i) => <div className="row" key={`teacher-${i}`}><span>{i + 1}</span><input name={`teacher_${i}`} defaultValue={teacherRows[i] ?? ''} placeholder={i < 4 ? 'Required remark' : 'Optional remark'}/></div>)}</div>
        <label className="toggle-row" style={{ marginTop: 20 }}><span>Enable principal remarks</span><input type="checkbox" name="principal_enabled" defaultChecked={config?.principal_remarks_enabled ?? true}/></label>
        <div className="table">{Array.from({ length: 8 }, (_, i) => <div className="row" key={`principal-${i}`}><span>{i + 1}</span><input name={`principal_${i}`} defaultValue={principalRows[i] ?? ''} placeholder={i < 4 ? 'Required remark' : 'Optional remark'}/></div>)}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}><button className="btn">Save configuration</button><Link className="btn secondary" href="/dashboard/grading">Configure grading levels</Link></div>
      </section>
    </form>
  </main>
}
