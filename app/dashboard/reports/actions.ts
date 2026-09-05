'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/supabase/session'
import { friendlyDbRedirect } from '@/lib/db-errors'
import { defaultReportTemplate, validTemplateKey } from '@/lib/report-template'
import { parseTermReference, termLabel } from '@/lib/terms'

/**
 * Report settings edit the opening and closing dates of the TERM selected by
 * the examination. The report itself displays the current term's closing date
 * and the following term's opening date via getEffectiveTermDates().
 *
 * Therefore the settings form must validate the normal per-term invariant:
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

  if (opening && closing && opening >= closing) {
    const label = currentTerm ? termLabel(currentTerm.termNumber) : 'selected term'
    redirect('/dashboard/reports?error=' + encodeURIComponent(`Invalid date range|The ${label} closing date must be after its opening date.`))
  }

  if (currentTerm) {
    const { data: currentRes, error: currentError } = await supabase
      .from('terms')
      .select('id,opening_date,closing_date')
      .eq('tenant_id', tenantId)
      .eq('academic_year', currentTerm.year)
      .eq('term_label', currentTerm.label)
      .maybeSingle()

    if (currentError) {
      redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(currentError) || 'Could not read the selected term calendar.')))
    }

    // Preserve existing dates when the form leaves one field blank. Validate
    // the resulting complete term pair before writing, if both are known.
    const effectiveOpening = opening ?? currentRes?.opening_date ?? null
    const effectiveClosing = closing ?? currentRes?.closing_date ?? null
    if (effectiveOpening && effectiveClosing && effectiveOpening >= effectiveClosing) {
      redirect('/dashboard/reports?error=' + encodeURIComponent(`Invalid date range|The ${termLabel(currentTerm.termNumber)} closing date must be after its opening date.`))
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

  if (currentTerm && (opening || closing)) {
    const { data: currentRow, error: rowError } = await supabase
      .from('terms')
      .select('id,opening_date,closing_date')
      .eq('tenant_id', tenantId)
      .eq('academic_year', currentTerm.year)
      .eq('term_label', currentTerm.label)
      .maybeSingle()

    if (rowError) {
      redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(rowError) || `Could not read the ${termLabel(currentTerm.termNumber)} calendar.`)))
    }

    const currentOpening = opening ?? currentRow?.opening_date ?? null
    const currentClosing = closing ?? currentRow?.closing_date ?? null
    if (currentOpening && currentClosing && currentOpening >= currentClosing) {
      redirect('/dashboard/reports?error=' + encodeURIComponent(`Invalid date range|The ${termLabel(currentTerm.termNumber)} closing date must be after its opening date.`))
    }

    const result = currentRow?.id
      ? await supabase.from('terms').update({ opening_date: opening ?? currentRow.opening_date, closing_date: closing ?? currentRow.closing_date }).eq('id', currentRow.id).eq('tenant_id', tenantId)
      : await supabase.from('terms').insert({ tenant_id: tenantId, academic_year: currentTerm.year, term_label: currentTerm.label, opening_date: opening, closing_date: closing })

    if (result.error) {
      redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(result.error) || `Could not save the ${termLabel(currentTerm.termNumber)} dates.`)))
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
