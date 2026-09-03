import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/supabase/session'
import { defaultReportTemplate, normalizeReportTemplate, templateFields } from '@/lib/report-template'
import SuccessToast from '@/components/SuccessToast'
import { friendlyDbRedirect } from '@/lib/db-errors'

async function saveTemplate(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/reports/template?error=' + encodeURIComponent('Error|No school is linked to this account.'))
  const { data: existingRow } = await supabase.from('report_templates').select('id,template_json').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  const template = existingRow?.template_json ? normalizeReportTemplate(existingRow.template_json) : structuredClone(defaultReportTemplate)
  for (const field of templateFields) {
    ;(template[field.section] as Record<string, boolean>)[field.key] = formData.get(`${field.section}.${field.key}`) === 'on'
  }
  const name = String(formData.get('name') || 'Default Report Form').trim() || 'Default Report Form'
  const existing = existingRow
  const payload = { tenant_id: tenantId, name, template_json: template, is_default: true }
  const result = existing?.id ? await supabase.from('report_templates').update(payload).eq('id', existing.id) : await supabase.from('report_templates').insert(payload)
  if (result.error) redirect('/dashboard/reports/template?error=' + encodeURIComponent(friendlyDbRedirect(result.error)))
  revalidatePath('/dashboard/reports'); revalidatePath('/dashboard/reports/template')
  redirect('/dashboard/reports/template?saved=1')
}

export default async function ReportTemplatePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return <main className="main"><p>Please sign in.</p></main>
  if (!tenantId) return <main className="main"><p>No school is linked to this account.</p></main>
  const { data: row } = await supabase.from('report_templates').select('name,template_json').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  const template = normalizeReportTemplate(row?.template_json)
  return <main className="main" style={{ maxWidth: 1180, margin: '0 auto' }}>
    <div className="top"><div><div className="eyebrow">Report configuration</div><h1 className="title">Report Template</h1><p className="muted">Choose exactly what appears on generated student reports.</p></div><div style={{ display: 'flex', gap: 8 }}><Link className="btn secondary" href="/dashboard/reports/template/configuration">Report settings</Link><Link className="btn secondary" href="/dashboard/reports">Back to reports</Link></div></div>
    {params.error && (() => { const idx = params.error.indexOf('|'); return idx > -1 ? <div className="notice error"><span className="font-semibold">{params.error.slice(0, idx)}</span><span className="block text-xs opacity-80 mt-0.5">{params.error.slice(idx + 1)}</span></div> : <div className="notice error">{params.error}</div> })()}
    {params.saved && <SuccessToast message="Template saved successfully" />}
    <form action={saveTemplate} className="template-layout">
      <section className="card"><div className="section-heading"><div><h2>Visible fields</h2><p className="muted">Turn sections on or off. Position is optional.</p></div></div>
        <label className="field-label">Template name<input name="name" defaultValue={row?.name ?? 'Default Report Form'} /></label>
        <div className="template-groups">
          {(['school','student','examination','results','additional'] as const).map(section => <fieldset className="template-group" key={section}><legend>{section === 'school' ? 'School branding' : section === 'student' ? 'Student information' : section === 'examination' ? 'Examination information' : section === 'results' ? 'Results' : 'Additional sections'}</legend>{templateFields.filter(f => f.section === section).map(field => <label className="toggle-row" key={`${field.section}.${field.key}`}><span>{field.label}</span><input type="checkbox" name={`${field.section}.${field.key}`} defaultChecked={(template[field.section] as Record<string, boolean>)[field.key]} /></label>)}</fieldset>)}
        </div>
        <button className="btn" style={{ marginTop: 20 }}>Save template</button>
      </section>
      <aside className="card preview-card"><div className="section-heading"><div><h2>Preview</h2><p className="muted">Representative layout using the saved visibility settings.</p></div></div>
        <div className="report preview-report">
          {template.school.name && <div className="preview-school">E-REPORTS SCHOOL</div>}
          {template.school.contact && <div className="preview-contact">P.O Box 123 — {`{{address}}`}</div>}
          {template.examination.name && <h3>Assessment Report · TEST EXAM · TERM 2 · 2026</h3>}
          <div className="preview-meta">{template.student.name && <span><b>Student</b> Sample Student</span>}{template.student.admissionNo && <span><b>Admission</b> ADM-001</span>}{template.student.className && <span><b>Class</b> Grade 6</span>}{template.results.position && <span><b>Grade</b> 2</span>}</div>
          <table className="report-table"><thead><tr>{template.results.learningArea && <th>Learning Area</th>}{template.assessmentComponents.midTerm && <th>Score</th>}{template.assessmentComponents.endTerm && <th>Score</th>}{template.assessmentComponents.average && <th>Score</th>}{template.results.grade && <th>Level</th>}{template.results.gradeDescription && <th>Description</th>}</tr></thead><tbody><tr>{template.results.learningArea && <td>Mathematics</td>}{template.assessmentComponents.midTerm && <td>72</td>}{template.assessmentComponents.endTerm && <td>84</td>}{template.assessmentComponents.average && <td>78</td>}{template.results.grade && <td>ME</td>}{template.results.gradeDescription && <td>Meeting Expectation</td>}</tr><tr>{template.results.learningArea && <td>English</td>}{template.assessmentComponents.midTerm && <td>35</td>}{template.assessmentComponents.endTerm && <td>35</td>}{template.assessmentComponents.average && <td>35</td>}{template.results.grade && <td>BE</td>}{template.results.gradeDescription && <td>Below Expectation</td>}</tr></tbody></table>
          <div className="preview-summary">{template.results.total && <span><b>Total</b> 63</span>}{template.results.average && <span><b>Average</b> 63</span>}{template.results.position && <span><b>Grade</b> 2</span>}</div>
          <div className="report-term-line">School Closes on <b>____________</b> and opens on <b>____________</b></div>
          {template.additional.teacherComment && <div className="preview-note"><b>Remark (Class teacher)</b><div>Good progress.</div></div>}
          {template.additional.overallComment && <div className="preview-note"><b>Remark (Head teacher)</b><div>Keep up the good work.</div></div>}
          {template.additional.signatureArea && <div className="signature-block"><div className="signature-row"><span>Class Teacher&apos;s Name: ______</span><span>Sign: ______</span><span>Date: ______</span></div><div className="signature-row"><span>Principal&apos;s Name: ______</span><span>Sign: ______</span><span>Date: ______</span></div></div>}
        </div>
      </aside>
    </form>
  </main>
}
