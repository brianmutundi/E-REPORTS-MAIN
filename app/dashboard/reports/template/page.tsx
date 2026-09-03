import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/supabase/session'
import { defaultReportTemplate, normalizeReportTemplate } from '@/lib/report-template'
import SuccessToast from '@/components/SuccessToast'
import { friendlyDbRedirect } from '@/lib/db-errors'

async function saveTemplate(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/reports/template?error=' + encodeURIComponent('Error|No school is linked to this account.'))
  const { data: existingRow } = await supabase.from('report_templates').select('id,template_json').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  // Every report component is compulsory — the stored visibility template is
  // always the full default (no choice-based toggles).
  const template = structuredClone(defaultReportTemplate)
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
    <div className="top"><div><div className="eyebrow">Report configuration</div><h1 className="title">Report Template</h1><p className="muted">All report components are compulsory and appear on every generated report.</p></div><div style={{ display: 'flex', gap: 8 }}><Link className="btn secondary" href="/dashboard/reports/template/configuration">Report settings</Link><Link className="btn secondary" href="/dashboard/reports">Back to reports</Link></div></div>
    {params.error && (() => { const idx = params.error.indexOf('|'); return idx > -1 ? <div className="notice error"><span className="font-semibold">{params.error.slice(0, idx)}</span><span className="block text-xs opacity-80 mt-0.5">{params.error.slice(idx + 1)}</span></div> : <div className="notice error">{params.error}</div> })()}
    {params.saved && <SuccessToast message="Template saved successfully" />}
    <form action={saveTemplate} className="template-layout">
      <section className="card"><div className="section-heading"><div><h2>Template</h2><p className="muted">The report form shows all sections by default — school branding, student information, examination information, every score column, the grading key, totals, all remarks and the signature area.</p></div></div>
        <label className="field-label">Template name<input name="name" defaultValue={row?.name ?? 'Default Report Form'} /></label>
        <button className="btn" style={{ marginTop: 20 }}>Save template</button>
      </section>
      <aside className="card preview-card"><div className="section-heading"><div><h2>Preview</h2><p className="muted">Representative single-page layout. All components are compulsory.</p></div></div>
        <div className="report preview-report">
          <div className="preview-school">E-REPORTS SCHOOL</div>
          <div className="preview-contact">P.O Box 123 — {`{{address}}`}</div>
          <h3>Assessment Report · TEST EXAM · TERM 2 · 2026</h3>
          <div className="preview-meta"><span><b>Student</b> Sample Student</span><span><b>Admission</b> ADM-001</span><span><b>Class</b> Grade 6</span><span><b>Grade</b> 2</span></div>
          <table className="report-table"><thead><tr><th>Learning Area</th><th>Score</th><th>Score</th><th>Score</th><th>Level</th><th>Description</th></tr></thead><tbody><tr><td>Mathematics</td><td>72</td><td>84</td><td>78</td><td>ME</td><td>Meeting Expectation</td></tr><tr><td>English</td><td>35</td><td>35</td><td>35</td><td>BE</td><td>Below Expectation</td></tr></tbody></table>
          <div className="preview-summary"><span><b>Total</b> 63</span><span><b>Average</b> 63</span><span><b>Grade</b> 2</span></div>
          <div className="report-term-line">School Closes on <b>____________</b> and opens on <b>____________</b></div>
          <div className="preview-note"><b>Remark (Class teacher)</b><div>Good progress.</div></div>
          <div className="preview-note"><b>Remark (Principal)</b><div>Keep up the good work.</div></div>
          <div className="signature-block"><div className="signature-row"><span>Class Teacher&apos;s Name: ______</span><span>Sign: ______</span><span>Date: ______</span></div><div className="signature-row"><span>Principal&apos;s Name: ______</span><span>Sign: ______</span><span>Date: ______</span></div></div>
        </div>
      </aside>
    </form>
  </main>
}
