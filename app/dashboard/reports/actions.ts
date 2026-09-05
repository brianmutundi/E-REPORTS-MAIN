'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/supabase/session'
import { friendlyDbRedirect } from '@/lib/db-errors'
import { defaultReportTemplate } from '@/lib/report-template'

/**
 * Saves the authoritative term/period (opening + closing dates) for the school's
 * default report template. Reuses the existing `report_template_configs` table —
 * the same structure the config page wrote to — so generated reports, the screen
 * preview and the PDF route all read from one source. Rejects a closing date that
 * is earlier than the opening date.
 */
export async function saveReportPeriod(formData: FormData) {
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|No school is linked to this account.'))

  const opening = String(formData.get('opening_date') || '').trim() || null
  const closing = String(formData.get('closing_date') || '').trim() || null
  if (opening && closing && closing < opening) {
    redirect('/dashboard/reports?error=' + encodeURIComponent('Invalid date range|The closing date cannot be earlier than the opening date.'))
  }

  const { data: existing } = await supabase.from('report_templates').select('id').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  let templateId = existing?.id
  if (!templateId) {
    const { data: created, error } = await supabase
      .from('report_templates')
      .insert({ tenant_id: tenantId, name: 'Default Report Form', template_json: defaultReportTemplate, is_default: true })
      .select('id')
      .single()
    if (error || !created) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(error) || 'Could not ready the report template.')))
    templateId = created.id
  }

  const { error } = await supabase.from('report_template_configs').upsert(
    { tenant_id: tenantId, report_template_id: templateId, opening_date: opening, closing_date: closing, teacher_remarks_enabled: true, principal_remarks_enabled: true },
    { onConflict: 'report_template_id' },
  )
  if (error) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(error) || 'Could not save the report period.')))

  // Preserve the current report selection so the save does not lose the grade/stream/assessment.
  const params = new URLSearchParams()
  for (const key of ['exam', 'class', 'stream'] as const) {
    const value = String(formData.get(key) || '').trim()
    if (value) params.set(key, value)
  }
  params.set('saved', '1')
  revalidatePath('/dashboard/reports')
  redirect(`/dashboard/reports?${params.toString()}`)
}