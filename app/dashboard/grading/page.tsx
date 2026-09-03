import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDashboardSession } from '@/lib/supabase/session'
import SuccessToast from '@/components/SuccessToast'
import { friendlyDbRedirect } from '@/lib/db-errors'

const DEFAULT_LEVELS = [
  { level_code: 'EE', min_score: 80, max_score: 100, description: 'Exceeding Expectation' },
  { level_code: 'ME', min_score: 60, max_score: 79.99, description: 'Meeting Expectation' },
  { level_code: 'AE', min_score: 40, max_score: 59.99, description: 'Approaching Expectation' },
  { level_code: 'BE', min_score: 0, max_score: 39.99, description: 'Below Expectation' },
]

const DEFAULT_TOTAL_MAXIMUM = 700

// Totals bands default to the same 80/60/40 thresholds expressed on the
// reference maximum (e.g. total out of 700), so unconfigured behaviour matches
// the learning-area percentages.
const DEFAULT_TOTAL_LEVELS = [
  { level_code: 'EE', min_score: 560, max_score: 700, description: 'Exceeding Expectation' },
  { level_code: 'ME', min_score: 420, max_score: 559.99, description: 'Meeting Expectation' },
  { level_code: 'AE', min_score: 280, max_score: 419.99, description: 'Approaching Expectation' },
  { level_code: 'BE', min_score: 0, max_score: 279.99, description: 'Below Expectation' },
]

function readLevels(formData: FormData, prefix = '') {
  return Array.from({ length: 8 }, (_, index) => {
    const levelCode = String(formData.get(`${prefix}level_${index}`) || '').trim().toUpperCase()
    const minRaw = String(formData.get(`${prefix}min_${index}`) || '').trim()
    const maxRaw = String(formData.get(`${prefix}max_${index}`) || '').trim()
    const description = String(formData.get(`${prefix}description_${index}`) || '').trim()

    return {
      level_code: levelCode,
      min_score: minRaw === '' ? NaN : Number(minRaw),
      max_score: maxRaw === '' ? NaN : Number(maxRaw),
      description,
      sort_order: index,
    }
  }).filter(r =>
    r.level_code ||
    r.description ||
    Number.isFinite(r.min_score) ||
    Number.isFinite(r.max_score)
  )
}

function rangesOverlap(rows: { min_score: number; max_score: number }[]) {
  const sortedRanges = [...rows].sort((a, b) => a.min_score - b.min_score)
  return sortedRanges.some((current, index) => {
    if (index === 0) return false
    return current.min_score < sortedRanges[index - 1].max_score
  })
}

async function ensureDefaultTemplate(supabase: any, tenantId: string): Promise<string> {
  const { data: template } = await supabase.from('report_templates').select('id').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  if (template?.id) return template.id
  const { data: created, error } = await supabase.from('report_templates').insert({ tenant_id: tenantId, name: 'Default Report Form', template_json: {}, is_default: true }).select('id').single()
  if (error || !created) redirect(`/dashboard/grading?error=${encodeURIComponent(error?.message || 'Could not create report template')}`)
  return created.id
}

async function saveGrading(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/grading?error=No%20school%20is%20linked%20to%20this%20account&tab=areas')
  const rows = readLevels(formData, 'area_')
  if (rows.length < 4 || rows.length > 8) redirect('/dashboard/grading?error=Configure%204%20to%208%20grading%20levels&tab=areas')
  const invalid = rows.some(r =>
    !r.level_code ||
    !r.description ||
    !Number.isFinite(r.min_score) ||
    !Number.isFinite(r.max_score) ||
    r.min_score < 0 ||
    r.max_score > 100 ||
    r.min_score > r.max_score
  )
  const overlap = rangesOverlap(rows)

  if (invalid || overlap) {
    redirect(
      `/dashboard/grading?error=${encodeURIComponent(
        overlap
          ? 'Grading ranges must not overlap'
          : 'Check all levels, ranges and descriptions'
      )}&tab=areas`
    )
  }
  const templateId = await ensureDefaultTemplate(supabase, tenantId)
  const { error: levelError } = await supabase.rpc('save_grading_levels', {
    p_template_id: templateId,
    p_rows: rows.map(r => ({ level_code: r.level_code, min_score: r.min_score, max_score: r.max_score, description: r.description, sort_order: r.sort_order })),
  })
  if (levelError) {
    if (levelError.code !== 'PGRST202' && !/cannot find the function|does not exist/i.test(levelError.message ?? '')) {
      redirect(`/dashboard/grading?error=${encodeURIComponent(friendlyDbRedirect(levelError) || 'Could not save grading levels')}&tab=areas`)
    }
    const { error: deleteError } = await supabase.from('report_grading_levels').delete().eq('report_template_id', templateId)
    if (deleteError) redirect(`/dashboard/grading?error=${encodeURIComponent(friendlyDbRedirect(deleteError) || 'Could not save grading levels')}&tab=areas`)
    const { error } = await supabase.from('report_grading_levels').insert(rows.map(r => ({ ...r, tenant_id: tenantId, report_template_id: templateId })))
    if (error) redirect(`/dashboard/grading?error=${encodeURIComponent(friendlyDbRedirect(error) || 'Could not save grading levels')}&tab=areas`)
  }
  revalidatePath('/dashboard/grading'); revalidatePath('/dashboard/results'); revalidatePath('/dashboard/reports'); revalidatePath('/dashboard/analysis'); revalidatePath('/dashboard/reports/template')
  redirect('/dashboard/grading?tab=areas&saved=1')
}

async function saveTotalGrading(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/grading?error=No%20school%20is%20linked%20to%20this%20account&tab=totals')
  const refRaw = String(formData.get('total_reference_max') || '').trim()
  const referenceMax = refRaw === '' ? NaN : Number(refRaw)
  const rows = readLevels(formData, 'total_')
  if (!Number.isFinite(referenceMax) || referenceMax <= 0) redirect('/dashboard/grading?error=The%20reference%20total%20must%20be%20positive&tab=totals')
  if (rows.length < 4 || rows.length > 8) redirect('/dashboard/grading?error=Configure%204%20to%208%20total%20grading%20levels&tab=totals')
  const invalid = rows.some(r =>
    !r.level_code ||
    !r.description ||
    !Number.isFinite(r.min_score) ||
    !Number.isFinite(r.max_score) ||
    r.min_score < 0 ||
    r.max_score > referenceMax ||
    r.min_score > r.max_score
  )
  const overlap = rangesOverlap(rows)

  if (invalid || overlap) {
    redirect(
      `/dashboard/grading?error=${encodeURIComponent(
        overlap
          ? 'Total grading ranges must not overlap'
          : 'Check all total levels, ranges and descriptions'
      )}&tab=totals`
    )
  }
  const templateId = await ensureDefaultTemplate(supabase, tenantId)
  const { error: levelError } = await supabase.rpc('save_total_grading_levels', {
    p_template_id: templateId,
    p_reference_maximum: referenceMax,
    p_rows: rows.map(r => ({ level_code: r.level_code, min_score: r.min_score, max_score: r.max_score, description: r.description, sort_order: r.sort_order })),
  })
  if (levelError) {
    if (levelError.code !== 'PGRST202' && !/cannot find the function|does not exist/i.test(levelError.message ?? '')) {
      redirect(`/dashboard/grading?error=${encodeURIComponent(friendlyDbRedirect(levelError) || 'Could not save total grading levels')}&tab=totals`)
    }
    const { error: deleteError } = await supabase.from('report_total_grading_levels').delete().eq('report_template_id', templateId)
    if (deleteError) redirect(`/dashboard/grading?error=${encodeURIComponent(friendlyDbRedirect(deleteError) || 'Could not save total grading levels')}&tab=totals`)
    const { error } = await supabase.from('report_total_grading_levels').insert(rows.map(r => ({ ...r, tenant_id: tenantId, report_template_id: templateId, reference_maximum: referenceMax })))
    if (error) redirect(`/dashboard/grading?error=${encodeURIComponent(friendlyDbRedirect(error) || 'Could not save total grading levels')}&tab=totals`)
  }
  revalidatePath('/dashboard/grading'); revalidatePath('/dashboard/results'); revalidatePath('/dashboard/reports'); revalidatePath('/dashboard/analysis'); revalidatePath('/dashboard/reports/template')
  redirect('/dashboard/grading?tab=totals&saved=1')
}

export default async function GradingPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; tab?: string }> }) {
  const params = await searchParams
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return <main className="main"><p>Please sign in.</p></main>
  if (!tenantId) return <main className="main"><p>No school is linked to this account.</p></main>
  const { data: template } = await supabase.from('report_templates').select('id').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  const { data: areaData } = template?.id ? await supabase.from('report_grading_levels').select('level_code,min_score,max_score,description,sort_order').eq('report_template_id', template.id).order('sort_order') : { data: null }
  const { data: totalData } = template?.id ? await supabase.from('report_total_grading_levels').select('level_code,min_score,max_score,description,sort_order,reference_maximum').eq('report_template_id', template.id).order('sort_order') : { data: null }
  const scale = areaData?.length ? areaData : DEFAULT_LEVELS
  const totalScale = totalData?.length ? totalData : DEFAULT_TOTAL_LEVELS
  const totalReferenceMax = totalData?.length ? Number(totalData[0]?.reference_maximum ?? DEFAULT_TOTAL_MAXIMUM) : DEFAULT_TOTAL_MAXIMUM
  const activeTab = params.tab === 'totals' ? 'totals' : 'areas'

  return <main className="main" style={{ maxWidth: 1000, margin: '0 auto' }}><div className="top"><div><div className="eyebrow">Report template configuration</div><h1 className="title">Grading Levels</h1><p className="muted">Configure two independent scales: per Learning Area (0–100 per subject) and the overall Totals (raw marks against a reference total).</p></div><Link className="btn secondary" href="/dashboard/reports/template">Report template</Link></div>
{params.error && (() => { const idx = params.error.indexOf('|'); return idx > -1 ? <div className="notice error"><span className="font-semibold">{params.error.slice(0, idx)}</span><span className="block text-xs opacity-80 mt-0.5">{params.error.slice(idx + 1)}</span></div> : <div className="notice error">{params.error}</div> })()}{params.saved && <SuccessToast message={activeTab === 'totals' ? 'Totals grading levels saved' : 'Learning area grading levels saved'} />}

    <form action={saveGrading} className="card" style={{ marginTop: 6 }}>
      <h2>Learning Area Grading</h2>
      <p className="muted">Ranges are applied to each learning area&apos;s score (0–100).</p>
      <div className="table"><div className="row header"><span>Level</span><span>Minimum</span><span>Maximum</span><span>Description</span></div>{Array.from({ length: 8 }, (_, index) => { const r: any = scale[index]; return <div className="row" key={index}><input name={`area_level_${index}`} aria-label={`Learning area level ${index + 1} code`} defaultValue={r?.level_code ?? ''} placeholder={index < 4 ? `Level ${index + 1}` : 'Optional'} /><input name={`area_min_${index}`} aria-label={`Learning area level ${index + 1} minimum score`} type="number" min="0" max="100" step="0.01" defaultValue={r?.min_score ?? ''}/><input name={`area_max_${index}`} aria-label={`Learning area level ${index + 1} maximum score`} type="number" min="0" max="100" step="0.01" defaultValue={r?.max_score ?? ''}/><input name={`area_description_${index}`} aria-label={`Learning area level ${index + 1} description`} defaultValue={r?.description ?? ''} placeholder={index < 4 ? 'Performance description' : 'Optional'} /></div>})}</div>
      <p className="muted" style={{ marginTop: 12 }}>Ranges cannot overlap and must stay within 0–100.</p>
      <button className="btn" style={{ marginTop: 20 }}>Save learning area grading</button>
    </form>

    <form action={saveTotalGrading} className="card" style={{ marginTop: 20 }}>
      <h2>Totals Grading</h2>
      <p className="muted">Ranges are applied to the overall total (raw marks). Enter them against a reference total — each assessment&apos;s true maximum (learning areas × 100) is scaled into it. The principal&apos;s remark and the overall performance level read from these bands.</p>
      <div className="row" style={{ width: 260 }}>
        <span>Reference total (out of)</span>
        <input name="total_reference_max" aria-label="Reference total maximum" type="number" min="1" step="0.01" defaultValue={totalReferenceMax} style={{ maxWidth: 120 }} />
      </div>
      <div className="table"><div className="row header"><span>Level</span><span>Minimum</span><span>Maximum</span><span>Description</span></div>{Array.from({ length: 8 }, (_, index) => { const r: any = totalScale[index]; return <div className="row" key={index}><input name={`total_level_${index}`} aria-label={`Total level ${index + 1} code`} defaultValue={r?.level_code ?? ''} placeholder={index < 4 ? `Level ${index + 1}` : 'Optional'} /><input name={`total_min_${index}`} aria-label={`Total level ${index + 1} minimum score`} type="number" min="0" step="0.01" defaultValue={r?.min_score ?? ''}/><input name={`total_max_${index}`} aria-label={`Total level ${index + 1} maximum score`} type="number" min="0" step="0.01" defaultValue={r?.max_score ?? ''}/><input name={`total_description_${index}`} aria-label={`Total level ${index + 1} description`} defaultValue={r?.description ?? ''} placeholder={index < 4 ? 'Performance description' : 'Optional'} /></div>})}</div>
      <p className="muted" style={{ marginTop: 12 }}>Ranges cannot overlap and must stay between 0 and the reference total.</p>
      <button className="btn" style={{ marginTop: 20 }}>Save totals grading</button>
    </form>
  </main>
}