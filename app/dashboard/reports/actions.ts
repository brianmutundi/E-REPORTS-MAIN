'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/supabase/session'
import { friendlyDbRedirect } from '@/lib/db-errors'
import { defaultReportTemplate, validTemplateKey } from '@/lib/report-template'
import { parseTermReference, nextTermReference, termLabel } from '@/lib/terms'

/** Saves the default report form and the term calendar dates for the selected examination's term. */
export async function saveReportSettings(formData: FormData) {
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|No school is linked to this account.'))

  const opening = String(formData.get('opening_date') || '').trim() || null
  const closing = String(formData.get('closing_date') || '').trim() || null

  // Opening and closing belong to the same selected term: opening must be
  // strictly earlier than closing. The NEXT term opening is validated
  // separately below and must be strictly later than this term's closing.
  if (opening && closing && opening >= closing) {
    redirect('/dashboard/reports?error=' + encodeURIComponent('Invalid date range|The opening date must be before the closing date.'))
  }

  const templateKey = String(formData.get('template_key') || '').trim()
  const finalTemplateKey = validTemplateKey(templateKey) ? templateKey : 'standard'

  const { data: existing } = await supabase.from('report_templates').select('id').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
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
  if (currentTerm && closing) {
    const next = nextTermReference(currentTerm)
    const { data: nextRow } = await supabase
      .from('terms')
      .select('opening_date')
      .eq('tenant_id', tenantId)
      .eq('academic_year', next.year)
      .eq('term_label', next.label)
      .maybeSingle()
    const nextOpening = nextRow?.opening_date ?? null
    if (nextOpening && nextOpening <= closing) {
      redirect('/dashboard/reports?error=' + encodeURIComponent('Invalid date range|The next term opening date cannot be on or before this term closing date.'))
    }
  }

  const { error } = await supabase.from('report_template_configs').upsert(
    { tenant_id: tenantId, report_template_id: templateId, opening_date: opening, closing_date: closing, teacher_remarks_enabled: true, principal_remarks_enabled: true },
    { onConflict: 'report_template_id' },
  )
  if (error) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(error) || 'Could not save the report settings.')))

  if (currentTerm) {
    const { error: termError } = await supabase.from('terms').upsert(
      { tenant_id: tenantId, academic_year: currentTerm.year, term_label: currentTerm.label, opening_date: opening, closing_date: closing },
      { onConflict: 'tenant_id,academic_year,term_label', ignoreDuplicates: false },
    )
    if (termError) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(termError) || `Could not save the ${termLabel(currentTerm.termNumber)} dates.`)))
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
