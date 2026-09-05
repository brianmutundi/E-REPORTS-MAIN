'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/supabase/session'
import { friendlyDbRedirect } from '@/lib/db-errors'
import { defaultReportTemplate, validTemplateKey } from '@/lib/report-template'

/**
 * Assessment Report dates are independent report-period settings.
 * They are intentionally NOT linked to the school's `terms` calendar.
 * For the Assessment Report period, the closing date must be before the opening date.
 */
export async function saveReportSettings(formData: FormData) {
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/reports?error=' + encodeURIComponent('Error|No school is linked to this account.'))

  const opening = String(formData.get('opening_date') || '').trim() || null
  const closing = String(formData.get('closing_date') || '').trim() || null
  const templateKey = String(formData.get('template_key') || '').trim()
  const finalTemplateKey = validTemplateKey(templateKey) ? templateKey : 'standard'

  if (opening && closing && closing >= opening) {
    redirect('/dashboard/reports?error=' + encodeURIComponent('Invalid date range|The closing date must be before the opening date.'))
  }

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
      .insert({
        tenant_id: tenantId,
        name: 'Default Report Form',
        template_json: defaultReportTemplate,
        is_default: true,
        template_key: finalTemplateKey,
      })
      .select('id')
      .single()
    if (error || !created) {
      redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(error) || 'Could not create the report template.')))
    }
    templateId = created.id
  }

  const { error } = await supabase.from('report_template_configs').upsert({
    tenant_id: tenantId,
    report_template_id: templateId,
    opening_date: opening,
    closing_date: closing,
    teacher_remarks_enabled: true,
    principal_remarks_enabled: true,
  }, { onConflict: 'report_template_id' })
  if (error) {
    redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(error) || 'Could not save the report settings.')))
  }

  const { error: keyError } = await supabase
    .from('report_templates')
    .update({ template_key: finalTemplateKey })
    .eq('id', templateId)
    .eq('tenant_id', tenantId)

  if (keyError) {
    redirect('/dashboard/reports?error=' + encodeURIComponent('Error|' + (friendlyDbRedirect(keyError) || 'Could not save the report template selection.')))
  }

  const params = new URLSearchParams()
  for (const key of ['exam', 'class', 'stream'] as const) {
    const value = String(formData.get(key) || '').trim()
    if (value) params.set(key, value)
  }
  params.set('saved', '1')
  revalidatePath('/dashboard/reports')
  redirect(`/dashboard/reports?${params.toString()}`)
}
