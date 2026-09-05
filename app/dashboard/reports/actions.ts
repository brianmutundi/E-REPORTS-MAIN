'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/supabase/session'
import { friendlyDbRedirect } from '@/lib/db-errors'
import { defaultReportTemplate, validTemplateKey } from '@/lib/report-template'
import { parseTermReference, nextTermReference, termLabel } from '@/lib/terms'

/**
 * Report settings use a cross-term pair of dates:
 * - closing_date = the end of the selected/current term
 * - opening_date = the start of the following term
 *
 * The report pair must therefore satisfy closing_date < opening_date.
 * The terms table itself keeps its normal invariant for EACH term:
 * opening_date < closing_date.
 */
export async function saveReportSettings(formData: FormData) {
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|No school is linked to this account.'))

  const opening = String(formData.get('opening_date') || '').trim() || null
  const closing = String(formData.get('closing_date') || '').trim() || null
  const templateKey = String(formData.get('template_key') || '').trim()
  const finalTemplateKey = validTemplateKey(templateKey) ? templateKey : 'standard'

  const { data: existing } = await supabase
    .from('report_templates').select('id').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  let templateId = existing?.id
  if (!templateId) {
    const { data: created, error } = await supabase
      .from('report_templates')
      .insert({ tenant_id: tenantId, name: 'Default Report Form', template_json: defaultReportTemplate, is_default: true, template_key: finalTemplateKey })
      .select('id').single()
    if (error || !created) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(error) || 'Could not create the report template.')))
    templateId = created.id
  }

  let examTerm: string | null = null
  let examYear: number | null = null
  const selectedExamId = String(formData.get('exam') || '').trim()
  if (selectedExamId) {
    const { data: exam } = await supabase.from('exams').select('term,academic_year').eq('id', selectedExamId).eq('tenant_id', tenantId).maybeSingle()
    examTerm = exam?.term ?? null
    examYear = exam?.academic_year ?? null
  }
  if (!examTerm) {
    const { data: latest } = await supabase.from('exams').select('term,academic_year').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    examTerm = latest?.term ?? null
    examYear = latest?.academic_year ?? null
  }

  const currentTerm = parseTermReference({ term: examTerm, academicYear: examYear })

  // These are dates across a term boundary, not the opening/closing dates of one term.
  if (closing && opening && closing >= opening) {
    redirect('/dashboard/reports?error=' + encodeURIComponent('Invalid date range|The school closing date must be before the next term opening date.'))
  }

  if (currentTerm) {
    const next = nextTermReference(currentTerm)
    const [currentRes, nextRes] = await Promise.all([
      supabase.from('terms').select('opening_date,closing_date').eq('tenant_id', tenantId).eq('academic_year', currentTerm.year).eq('term_label', currentTerm.label).maybeSingle(),
      supabase.from('terms').select('opening_date,closing_date').eq('tenant_id', tenantId).eq('academic_year', next.year).eq('term_label', next.label).maybeSingle(),
    ])
    if (currentRes.error) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(currentRes.error) || 'Could not read the current term calendar.')))
    if (nextRes.error) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(nextRes.error) || 'Could not read the next term calendar.')))

    // The terms table has its own per-term constraint: opening < closing.
    // Validate both terms explicitly before writing, so users never receive a raw DB constraint error.
    if (closing && currentRes.data?.opening_date && closing <= currentRes.data.opening_date) {
      redirect('/dashboard/reports?error=' + encodeURIComponent(`Invalid date range|The ${termLabel(currentTerm.termNumber)} closing date must be after its opening date.`))
    }
    if (opening && nextRes.data?.closing_date && opening >= nextRes.data.closing_date) {
      redirect('/dashboard/reports?error=' + encodeURIComponent(`Invalid date range|The next ${termLabel(next.termNumber)} opening date must be before its closing date.`))
    }
  }

  const { error } = await supabase.from('report_template_configs').upsert({
    tenant_id: tenantId,
    report_template_id: templateId,
    opening_date: opening,
    closing_date: closing,
    teacher_remarks_enabled: true,
    principal_remarks_enabled: true,
  }, { onConflict: 'report_template_id' })
  if (error) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(error) || 'Could not save the report settings.')))

  if (currentTerm) {
    const next = nextTermReference(currentTerm)

    // Update only the date belonging to each term. Never copy the cross-term
    // report opening date into the current term, and never overwrite a term's other date.
    if (closing) {
      const { data: currentRow } = await supabase.from('terms').select('id').eq('tenant_id', tenantId).eq('academic_year', currentTerm.year).eq('term_label', currentTerm.label).maybeSingle()
      const result = currentRow?.id
        ? await supabase.from('terms').update({ closing_date: closing }).eq('id', currentRow.id).eq('tenant_id', tenantId)
        : await supabase.from('terms').insert({ tenant_id: tenantId, academic_year: currentTerm.year, term_label: currentTerm.label, opening_date: null, closing_date: closing })
      if (result.error) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(result.error) || `Could not save the ${termLabel(currentTerm.termNumber)} closing date.`)))
    }

    if (opening) {
      const { data: nextRow } = await supabase.from('terms').select('id').eq('tenant_id', tenantId).eq('academic_year', next.year).eq('term_label', next.label).maybeSingle()
      const result = nextRow?.id
        ? await supabase.from('terms').update({ opening_date: opening }).eq('id', nextRow.id).eq('tenant_id', tenantId)
        : await supabase.from('terms').insert({ tenant_id: tenantId, academic_year: next.year, term_label: next.label, opening_date: opening, closing_date: null })
      if (result.error) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(result.error) || `Could not save the ${termLabel(next.termNumber)} opening date.`)))
    }
  }

  const { error: keyError } = await supabase.from('report_templates').update({ template_key: finalTemplateKey }).eq('id', templateId).eq('tenant_id', tenantId)
  if (keyError) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(keyError) || 'Could not save the report template selection.')))

  const params = new URLSearchParams()
  for (const key of ['exam', 'class', 'stream'] as const) {
    const value = String(formData.get(key) || '').trim()
    if (value) params.set(key, value)
  }
  params.set('saved', '1')
  revalidatePath('/dashboard/reports')
  redirect(`/dashboard/reports?${params.toString()}`)
}
