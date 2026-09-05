'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/supabase/session'
import { friendlyDbRedirect } from '@/lib/db-errors'
import { defaultReportTemplate, validTemplateKey } from '@/lib/report-template'
import { parseTermReference, nextTermReference, termLabel } from '@/lib/terms'

/**
 * Saves report settings and the school term calendar.
 *
 * IMPORTANT: Assessment reports show the end of the CURRENT term followed by
 * the start of the NEXT term. Therefore the valid date relationship is:
 *
 *   current term closing date < next term opening date
 *
 * The two dates are deliberately NOT treated as a single same-term range.
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
    .from('report_templates')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .maybeSingle()
  let templateId = existing?.id
  if (!templateId) {
    const { data: created, error } = await supabase
      .from('report_templates')
      .insert({ tenant_id: tenantId, name: 'Default Report Form', template_json: defaultReportTemplate, is_default: true, template_key: finalTemplateKey })
      .select('id')
      .single()
    if (error || !created) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(error) || 'Could not create the report template.')))
    templateId = created.id
  }

  let examTerm: string | null = null
  let examYear: number | null = null
  const selectedExamId = String(formData.get('exam') || '').trim()
  if (selectedExamId) {
    const { data: exam } = await supabase
      .from('exams')
      .select('term,academic_year')
      .eq('id', selectedExamId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    examTerm = exam?.term ?? null
    examYear = exam?.academic_year ?? null
  }
  if (!examTerm) {
    const { data: latest } = await supabase
      .from('exams')
      .select('term,academic_year')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    examTerm = latest?.term ?? null
    examYear = latest?.academic_year ?? null
  }

  const currentTerm = parseTermReference({ term: examTerm, academicYear: examYear })

  // The report's two dates span the boundary between terms:
  // closing = current term closing; opening = next term opening.
  // Consequently the correct invariant is closing < opening.
  if (closing && opening && closing >= opening) {
    redirect('/dashboard/reports?error=' + encodeURIComponent('Invalid date range|The closing date must be before the next term opening date.'))
  }

  if (currentTerm && closing && opening) {
    const next = nextTermReference(currentTerm)
    const { data: nextRow } = await supabase
      .from('terms')
      .select('opening_date')
      .eq('tenant_id', tenantId)
      .eq('academic_year', next.year)
      .eq('term_label', next.label)
      .maybeSingle()

    // If a next-term opening already exists, it must agree with the submitted
    // report opening date. This prevents silently writing one date to the
    // report config and a different date to the term calendar.
    const existingNextOpening = nextRow?.opening_date ?? null
    if (existingNextOpening && existingNextOpening !== opening) {
      redirect('/dashboard/reports?error=' + encodeURIComponent('Invalid date range|The opening date must match the next term opening date for this school.'))
    }
  }

  const { error } = await supabase
    .from('report_template_configs')
    .upsert(
      {
        tenant_id: tenantId,
        report_template_id: templateId,
        opening_date: opening,
        closing_date: closing,
        teacher_remarks_enabled: true,
        principal_remarks_enabled: true,
      },
      { onConflict: 'report_template_id' },
    )
  if (error) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(error) || 'Could not save the report settings.')))

  if (currentTerm) {
    const next = nextTermReference(currentTerm)

    // Store the current term's closing date without overwriting its own
    // opening date. Store the submitted opening date on the NEXT term.
    if (closing) {
      const { data: currentRow } = await supabase
        .from('terms')
        .select('opening_date')
        .eq('tenant_id', tenantId)
        .eq('academic_year', currentTerm.year)
        .eq('term_label', currentTerm.label)
        .maybeSingle()

      const { error: currentTermError } = await supabase
        .from('terms')
        .upsert(
          {
            tenant_id: tenantId,
            academic_year: currentTerm.year,
            term_label: currentTerm.label,
            opening_date: currentRow?.opening_date ?? null,
            closing_date: closing,
          },
          { onConflict: 'tenant_id,academic_year,term_label', ignoreDuplicates: false },
        )
      if (currentTermError) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(currentTermError) || `Could not save the ${termLabel(currentTerm.termNumber)} closing date.`)))
    }

    if (opening) {
      const { data: nextRow } = await supabase
        .from('terms')
        .select('closing_date')
        .eq('tenant_id', tenantId)
        .eq('academic_year', next.year)
        .eq('term_label', next.label)
        .maybeSingle()

      if (nextRow?.closing_date && nextRow.closing_date <= opening) {
        redirect('/dashboard/reports?error=' + encodeURIComponent('Invalid date range|The next term opening date must be before that term closes.'))
      }

      const { error: nextTermError } = await supabase
        .from('terms')
        .upsert(
          {
            tenant_id: tenantId,
            academic_year: next.year,
            term_label: next.label,
            opening_date: opening,
            closing_date: nextRow?.closing_date ?? null,
          },
          { onConflict: 'tenant_id,academic_year,term_label', ignoreDuplicates: false },
        )
      if (nextTermError) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(nextTermError) || `Could not save the ${termLabel(next.termNumber)} opening date.`)))
    }
  }

  const { error: keyError } = await supabase
    .from('report_templates')
    .update({ template_key: finalTemplateKey })
    .eq('id', templateId)
    .eq('tenant_id', tenantId)
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
