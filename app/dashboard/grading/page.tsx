import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDashboardSession } from '@/lib/supabase/session'
import SuccessToast from '@/components/SuccessToast'
import { friendlyDbRedirect } from '@/lib/db-errors'
import { knecDefaultLevels, getTenantTotalGradingScale, defaultTotalGradingScale, type GradingMode, type GradeRule } from '@/lib/grading'
import GradingModeChooser from '@/components/grading/GradingModeChooser'

const VALID_CODES_8 = ['EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2']
const VALID_CODES_4 = ['EE', 'ME', 'AE', 'BE']

type LevelInput = { code: string; min: number; max: number; points: number | null; name: string; description: string; broad: string | null; sort_order: number }

function broadOf(code: string): string | null {
  const m = code.match(/^([A-Z]{2})/)
  return m ? m[1] : null
}

function defaultColor(code: string): string {
  const base = broadOf(code) ?? code
  const palette: Record<string, string> = {
    EE: '#15803d', ME: '#2563eb', AE: '#d97706', BE: '#dc2626',
    EE1: '#15803d', EE2: '#22c55e', ME1: '#2563eb', ME2: '#60a5fa',
    AE1: '#d97706', AE2: '#f59e0b', BE1: '#dc2626', BE2: '#f87171',
  }
  return palette[code] ?? palette[base] ?? '#64748b'
}

function parseLevels(formData: FormData, mode: GradingMode): LevelInput[] {
  const count = mode === '8' ? 8 : 4
  const rows: LevelInput[] = []
  for (let i = 0; i < count; i++) {
    const code = String(formData.get(`level_${i}_code`) || '').trim().toUpperCase()
    const minRaw = String(formData.get(`level_${i}_min`) || '').trim()
    const maxRaw = String(formData.get(`level_${i}_max`) || '').trim()
    const pointsRaw = String(formData.get(`level_${i}_points`) || '').trim()
    const name = String(formData.get(`level_${i}_name`) || '').trim()
    const desc = String(formData.get(`level_${i}_desc`) || '').trim()
    rows.push({
      code,
      min: minRaw === '' ? NaN : Number(minRaw),
      max: maxRaw === '' ? NaN : Number(maxRaw),
      points: pointsRaw === '' ? null : Number(pointsRaw),
      name,
      description: desc,
      broad: broadOf(code),
      sort_order: i,
    })
  }
  return rows
}

/**
 * Rigorous validation per spec §6: closed-open min-boundary rule (min ≤ x < next.min,
 * top closed at 100), full coverage of 0–100 automatically guaranteed when the first
 * min=0 and the last max=100 with strictly unique ascending mins. Rejects overlaps,
 * gaps, invalid percentages, duplicate codes, empty names, wrong count, and a single
 * level covering the whole domain. Returns a friendly message or null when valid.
 */
function validateLevels(rows: LevelInput[], mode: GradingMode): string | null {
  if (rows.length !== (mode === '8' ? 8 : 4)) return 'This grading system requires exactly 4 or 8 levels.'

  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.code) return 'Every level needs a code (e.g. EE1 or EE).'
    if (seen.has(r.code)) return `The level code "${r.code}" is used more than once.`
    seen.add(r.code)
    if (!r.name.trim() && !r.description.trim()) return `Level "${r.code}" needs a name or description.`
    if (!Number.isFinite(r.min) || !Number.isFinite(r.max)) return `Level "${r.code}" needs numeric minimum and maximum.`
    if (r.min < 0 || r.max > 100 || r.min > r.max) return `Level "${r.code}" has an invalid range — minimum and maximum must be between 0 and 100 with minimum ≤ maximum.`
  }

  // a single level covering the entire domain while others exist
  if (rows.some((r) => r.min === 0 && r.max === 100) && rows.length > 1) {
    return 'No single level may cover the entire 0–100 range while other levels exist.'
  }

  // closed-open boundary rule: sort by min ascending; no two levels may share a lower
  // bound (that would make a value ambiguous), the first must start at 0 and the last
  // must end at 100 so the whole domain is covered.
  const sorted = [...rows].sort((a, b) => a.min - b.min || a.max - b.max)
  if (sorted[0].min !== 0) return 'Ranges must start at 0 — there is an uncovered gap below the first level.'
  const top = sorted[sorted.length - 1]
  if (top.max !== 100) return 'Ranges must end at 100 — there is an uncovered gap above the last level.'
  for (let i = 0; i < sorted.length; i++) {
    const next = sorted[i + 1]
    if (next) {
      if (next.min <= sorted[i].min) return 'Level ranges must not overlap — each level needs a unique minimum.'
      if (next.min < sorted[i].max) return 'Level ranges must not overlap.'
    }
  }
  return null
}

async function selectMode(mode02: '4' | '8'): Promise<void> {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/grading?error=' + encodeURIComponent('Error|No school is linked to this account.'))
  const mode: GradingMode = mode02 === '8' ? '8' : '4'

  // Seed the KNEC-derived defaults for the chosen mode, mark it active.
  const defaults = knecDefaultLevels(mode)
  const pLevels = defaults.map((l, i) => ({
    code: l.grade, min_percent: l.min, max_percent: l.max, points: l.points,
    name: l.name ?? l.grade, description: l.description, broad: l.broad ?? broadOf(l.grade),
    sort_order: i, color: l.color ?? defaultColor(l.grade),
  }))
  const { error } = await supabase.rpc('upsert_grading_configuration', { p_mode: mode, p_levels: pLevels })
  if (error && (error.code as string) !== 'PGRST202' && !/cannot find the function|does not exist/i.test(error.message ?? '')) {
    redirect('/dashboard/grading?error=' + encodeURIComponent(friendlyDbRedirect(error)))
  }
  revalidatePath('/dashboard/grading')
  revalidatePath('/dashboard/results')
  revalidatePath('/dashboard/reports')
  revalidatePath('/dashboard/analysis')
  revalidatePath('/dashboard/reports/template')
}

async function saveGrading(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/grading?error=' + encodeURIComponent('Error|No school is linked to this account.'))
  const mode: GradingMode = String(formData.get('mode') || '4') === '8' ? '8' : '4'
  const rows = parseLevels(formData, mode)
  const problem = validateLevels(rows, mode)
  if (problem) redirect('/dashboard/grading?error=' + encodeURIComponent('Unable to save grading configuration|' + problem))

  const pLevels = rows.map((r) => ({
    code: r.code, min_percent: r.min, max_percent: r.max, points: r.points,
    name: r.name || r.description || r.code, description: r.description,
    broad: r.broad ?? broadOf(r.code), sort_order: r.sort_order, color: defaultColor(r.code),
  }))
  const { error } = await supabase.rpc('upsert_grading_configuration', { p_mode: mode, p_levels: pLevels })
  if (error) {
    if ((error.code as string) !== 'PGRST202' && !/cannot find the function|does not exist/i.test(error.message ?? '')) {
      redirect('/dashboard/grading?error=' + encodeURIComponent(friendlyDbRedirect(error)))
    }
    // Fallback to direct table writes in case the RPC hasn't been applied.
    await supabase.from('grading_configurations').update({ active: false }).eq('tenant_id', tenantId)
    const { data: created, error: insertErr } = await supabase
      .from('grading_configurations')
      .insert({ tenant_id: tenantId, mode, active: true, legacy_source: false })
      .select('id')
      .single()
    if (insertErr || !created) redirect('/dashboard/grading?error=' + encodeURIComponent(friendlyDbRedirect(insertErr) || 'Could not save grading configuration'))
    const { error: lvlErr } = await supabase
      .from('grading_configuration_levels')
      .insert(pLevels.map((l) => ({ config_id: created.id, ...l })))
    if (lvlErr) redirect('/dashboard/grading?error=' + encodeURIComponent(friendlyDbRedirect(lvlErr) || 'Could not save grading configuration'))
  }
  revalidatePath('/dashboard/grading')
  revalidatePath('/dashboard/results')
  revalidatePath('/dashboard/reports')
  revalidatePath('/dashboard/analysis')
  revalidatePath('/dashboard/reports/template')
  redirect('/dashboard/grading?saved=1')
}

async function restoreKnec(formData: FormData) {
  'use server'
  const mode: GradingMode = String(formData.get('mode') || '4') === '8' ? '8' : '4'
  await selectMode(mode)
  redirect('/dashboard/grading?' + (mode === '8' ? 'restored8=1' : 'restored4=1'))
}

async function saveTotalGrading(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/grading?error=' + encodeURIComponent('Error|No school is linked to this account.'))

  const refRaw = String(formData.get('total_ref_max') || '').trim()
  const referenceMaximum = Number(refRaw)
  if (!Number.isFinite(referenceMaximum) || referenceMaximum <= 0) {
    redirect('/dashboard/grading?error=' + encodeURIComponent('Total Aggregate|The aggregate maximum must be a positive number.'))
  }

  const rows = Array.from({ length: 4 }, (_, i) => ({
    level_code: String(formData.get(`total_${i}_code`) || '').trim().toUpperCase(),
    min_score: Number(String(formData.get(`total_${i}_min`) || '').trim()),
    max_score: Number(String(formData.get(`total_${i}_max`) || '').trim()),
    description: String(formData.get(`total_${i}_desc`) || '').trim(),
    sort_order: i,
  }))

  for (const r of rows) {
    if (!r.level_code) { redirect('/dashboard/grading?error=' + encodeURIComponent('Total Aggregate|Every level needs a code (e.g. EE).')); }
    if (!Number.isFinite(r.min_score) || !Number.isFinite(r.max_score) || r.min_score < 0 || r.min_score > r.max_score || r.max_score > referenceMaximum) {
      redirect('/dashboard/grading?error=' + encodeURIComponent('Total Aggregate|Level "' + r.level_code + '" has an invalid range (0 ≤ min ≤ max ≤ ' + referenceMaximum + ').'))
    }
  }

  // Resolve the tenant's default report template (create one if missing).
  const { data: template } = await supabase.from('report_templates').select('id').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  let templateId = template?.id
  if (!templateId) {
    const { data: created } = await supabase.from('report_templates').insert({ tenant_id: tenantId, name: 'Default Report Form', template_json: {}, is_default: true }).select('id').single()
    templateId = created?.id
  }
  if (!templateId) redirect('/dashboard/grading?error=' + encodeURIComponent('Error|Could not resolve the report template.'))

  const { error } = await supabase.rpc('save_total_grading_levels', { p_template_id: templateId, p_reference_maximum: referenceMaximum, p_rows: rows })
  if (error && (error.code as string) !== 'PGRST202' && !/cannot find the function|does not exist/i.test(error.message ?? '')) {
    redirect('/dashboard/grading?error=' + encodeURIComponent(friendlyDbRedirect(error)))
  }

  revalidatePath('/dashboard/grading')
  revalidatePath('/dashboard/results')
  revalidatePath('/dashboard/reports')
  revalidatePath('/dashboard/analysis')
  revalidatePath('/dashboard/reports/template')
  redirect('/dashboard/grading?totalSaved=1')
}

export default async function GradingPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; restored4?: string; restored8?: string; totalSaved?: string }> }) {
  const params = await searchParams
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return <main className="main"><p>Please sign in.</p></main>
  if (!tenantId) return <main className="main"><p>No school is linked to this account.</p></main>

  // Load the active configuration (mode + levels). RPC is preferred; fall back
  // to direct reads so both migration states work.
  let mode: GradingMode = '4'
  let levels: GradeRule[] = []
  let active = false
  const { data: cfg, error: cfgErr } = await supabase
    .from('grading_configurations')
    .select('id, mode, active, grading_configuration_levels(code, min_percent, max_percent, points, name, description, broad, sort_order, color)')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .maybeSingle()
  if (!cfgErr && cfg) {
    mode = cfg.mode === '8' ? '8' : '4'
    active = true
    if (Array.isArray(cfg.grading_configuration_levels) && cfg.grading_configuration_levels.length) {
      levels = (cfg.grading_configuration_levels as any[])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((l) => ({
          grade: l.code, min: Number(l.min_percent), max: Number(l.max_percent),
          points: l.points != null ? Number(l.points) : null,
          name: l.name || l.code, description: l.description,
          broad: l.broad ?? null, sort_order: l.sort_order ?? 0, color: l.color || '#64748b',
        }))
    }
  } else {
    // No explicit config yet — fall back to classic report_grading_levels, else KNEC 4-level defaults.
    const { data: t } = await supabase.from('report_templates').select('id').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
    if (t?.id) {
      const { data: legacy } = await supabase
        .from('report_grading_levels')
        .select('level_code,min_score,max_score,description,sort_order')
        .eq('tenant_id', tenantId)
        .eq('report_template_id', t.id)
        .order('sort_order')
      if (legacy?.length) {
        mode = '4'
        levels = legacy.map((r) => ({
          grade: r.level_code, min: Number(r.min_score), max: Number(r.max_score),
          description: r.description, sort_order: r.sort_order, name: r.description,
        }))
      }
    }
  }
  if (!levels.length) levels = knecDefaultLevels(mode)

  // Total Aggregate grading scale (separate system with its own raws-mark
  // tiers). Defaults auto-load via getTenantTotalGradingScale.
  const totalScale = await getTenantTotalGradingScale(tenantId)
  const totalRef = totalScale?.referenceMaximum ?? defaultTotalGradingScale().referenceMaximum
  const totalRules = totalScale?.rules?.length ? totalScale.rules : defaultTotalGradingScale(totalRef).rules

  const rows = Array.from({ length: mode === '8' ? 8 : 4 }, (_, i) => levels[i])

  return (
    <main className="main" style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div className="top">
        <div>
          <div className="eyebrow">Academic setup</div>
          <h1 className="title">Achievement Grading System</h1>
          <p className="muted">Choose how this school represents achievement levels. The selection controls how achievement is calculated and displayed throughout the school.</p>
        </div>
        <div className="actions-inline" style={{ marginTop: 0 }}>
          <Link className="btn secondary" href="/dashboard/reports/template">Report template</Link>
          <Link className="btn secondary" href="/dashboard/reports/template/configuration">Report configuration</Link>
        </div>
      </div>

      {params.error && (() => { const idx = params.error.indexOf('|'); return idx > -1 ? <div className="notice error"><span className="font-semibold">{params.error.slice(0, idx)}</span><span className="block text-xs opacity-80 mt-0.5">{params.error.slice(idx + 1)}</span></div> : <div className="notice error">{params.error}</div> })()}
      {params.saved && <SuccessToast message="Grading configuration saved" />}
      {params.totalSaved && <SuccessToast message="Total Aggregate scale saved" />}
      {(params.restored8 || params.restored4) && <SuccessToast message={params.restored8 ? 'Restored KNEC 8-level defaults' : 'Restored 4-level defaults'} />}

      <div style={{ marginBottom: 4 }}>
        <h2 className="section-title" style={{ marginBottom: 10 }}>Grading system</h2>
        <GradingModeChooser currentMode={mode} active={active} selectMode={selectMode} />
      </div>

      <form action={saveGrading} className="card" style={{ marginTop: 18 }}>
        <input type="hidden" name="mode" value={mode} />
        <div className="section-heading">
          <div>
            <h2 className="section-title">{mode === '8' ? '8 Performance Levels' : '4 Performance Levels'}</h2>
            <p className="muted">
              {mode === '8'
                ? 'KNEC Actual Performance Levels. Ranges are percentage bands (closed on the lower end, open on the upper; the top level is closed at 100). Edit as needed.'
                : 'Broad achievement levels derived from the KNEC 8-level bands. Ranges are percentage bands (closed on the lower end, open on the upper; the top level is closed at 100). Edit as needed.'}
            </p>
          </div>
          <button
            type="submit"
            name="intent"
            value="restore"
            formAction={restoreKnec}
            className="btn secondary"
            style={{ minWidth: 180 }}
          >
            Restore {mode === '8' ? 'KNEC' : ''} Defaults
          </button>
        </div>

        <div className="table" style={{ overflowX: 'auto' }}>
          <div className="row header" style={{ gridTemplateColumns: mode === '8' ? '86px 1.6fr 1fr 1fr 64px' : '72px 1.6fr 1fr 1fr' }}>
            <span>Code</span><span>Achievement level</span><span>Minimum (%)</span><span>Maximum (%)</span>
            {mode === '8' && <span>Points</span>}
          </div>
          {rows.map((r, i) => {
            const l = r as (GradeRule & { points?: number | null })
            return (
              <div key={i} className="row" style={{ gridTemplateColumns: mode === '8' ? '86px 1.6fr 1fr 1fr 64px' : '72px 1.6fr 1fr 1fr' }}>
                <input name={`level_${i}_code`} aria-label={`Level ${i + 1} code`} defaultValue={l?.grade ?? ''} placeholder={`L${i + 1}`} />
                <input name={`level_${i}_name`} aria-label={`Level ${i + 1} name`} defaultValue={l?.name ?? l?.description ?? ''} placeholder="Achievement level name" />
                <input name={`level_${i}_min`} aria-label={`Level ${i + 1} minimum`} type="number" min="0" max="100" step="0.01" defaultValue={l?.min ?? ''} />
                <input name={`level_${i}_max`} aria-label={`Level ${i + 1} maximum`} type="number" min="0" max="100" step="0.01" defaultValue={l?.max ?? ''} />
                {mode === '8' && <input name={`level_${i}_points`} aria-label={`Level ${i + 1} points`} type="number" min="0" max="8" step="1" defaultValue={l?.points ?? ''} />}
                <textarea
                  name={`level_${i}_desc`}
                  aria-label={`Level ${i + 1} description`}
                  defaultValue={l?.description ?? ''}
                  placeholder="Optional description shown on reports"
                  style={{ gridColumn: '1 / -1', minHeight: 64, borderRadius: 10, border: '1px solid var(--line)', padding: '8px 10px', fontSize: 13 }}
                />
              </div>
            )
          })}
        </div>

        <p className="muted" style={{ marginTop: 12 }}>
          Ranges must fully cover 0–100 with no overlaps or gaps. Each value maps to exactly one level.
        </p>
        <div className="actions-inline" style={{ marginTop: 16 }}>
          <button className="btn" type="submit" name="intent" value="save">Save Grading Configuration</button>
        </div>
      </form>

      <form action={saveTotalGrading} className="card" style={{ marginTop: 18 }}>
        <div className="section-heading">
          <div>
            <h2 className="section-title">Total Aggregate Scale</h2>
            <p className="muted">
              Separate grading tiers for the TOTAL aggregate score (raw marks such as 0–700). These differ from the Learning Area percentage scale because totals use a much larger numerical range.               Sensible defaults load automatically and remain fully editable.
            </p>
          </div>
        </div>

        <label className="field-label" style={{ display: 'block', marginBottom: 12 }}>Aggregate maximum (reference)
          <input name="total_ref_max" type="number" min="1" step="1" defaultValue={String(totalRef)} aria-label="Aggregate maximum" />
        </label>

        <div className="table" style={{ overflowX: 'auto' }}>
          <div className="row header" style={{ gridTemplateColumns: '86px 1.4fr 1fr 1fr' }}>
            <span>Code</span><span>Description</span><span>Minimum (marks)</span><span>Maximum (marks)</span>
          </div>
          {Array.from({ length: 4 }, (_, i) => {
            const l = totalRules[i]
            return (
              <div key={i} className="row" style={{ gridTemplateColumns: '86px 1.4fr 1fr 1fr' }}>
                <input name={`total_${i}_code`} aria-label={`Total level ${i + 1} code`} defaultValue={l?.grade ?? ''} placeholder={`L${i + 1}`} />
                <input name={`total_${i}_desc`} aria-label={`Total level ${i + 1} description`} defaultValue={l?.description ?? ''} placeholder="Level description" />
                <input name={`total_${i}_min`} aria-label={`Total level ${i + 1} minimum`} type="number" min="0" step="0.01" defaultValue={l?.min ?? ''} />
                <input name={`total_${i}_max`} aria-label={`Total level ${i + 1} maximum`} type="number" min="0" step="0.01" defaultValue={l?.max ?? ''} />
              </div>
            )
          })}
        </div>

        <p className="muted" style={{ marginTop: 12 }}>
          Bands must cover the full 0 to {String(totalRef)} range with no overlaps or gaps. Each raw aggregate total maps to exactly one level.
        </p>
        <div className="actions-inline" style={{ marginTop: 16 }}>
          <button className="btn" type="submit" name="intent" value="save-total">Save Total Aggregate Scale</button>
        </div>
      </form>
    </main>
  )
}
