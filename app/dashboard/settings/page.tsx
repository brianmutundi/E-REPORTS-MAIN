import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/supabase/session'
import SuccessToast from '@/components/SuccessToast'
import SchoolLogoUploader from './logo-uploader'
import ChangePasswordForm from './change-password-form'
import { friendlyDbRedirect } from '@/lib/db-errors'
import SubmitButton from '@/components/SubmitButton'

async function saveSchool(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession(); if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/settings?error=' + encodeURIComponent('Error|No school is linked to this account.'))
  const name = String(formData.get('name') || '').trim(); const address = String(formData.get('address') || '').trim() || null
  if (!name) redirect('/dashboard/settings?error=' + encodeURIComponent('Error|School name is required.'))
  const { error } = await supabase.from('tenants').update({ name, address }).eq('id', tenantId)
  if (error) redirect('/dashboard/settings?error=' + encodeURIComponent(friendlyDbRedirect(error)))
  revalidatePath('/dashboard/settings'); revalidatePath('/dashboard/reports'); redirect('/dashboard/settings?saved=1')
}

async function createAcademicYear(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/settings?error=' + encodeURIComponent('Error|No school is linked to this account.'))
  const sourceYear = Number(formData.get('source_year')); const targetYear = Number(formData.get('target_year'))
  if (!Number.isInteger(sourceYear) || !Number.isInteger(targetYear) || targetYear <= sourceYear) redirect('/dashboard/settings?error=' + encodeURIComponent('Academic year error|The target year must be later than the source year.'))
  const { data, error } = await supabase.rpc('rollover_academic_year', { p_source_year: sourceYear, p_target_year: targetYear })
  if (error) redirect('/dashboard/settings?error=' + encodeURIComponent(friendlyDbRedirect(error)))
  const summary = Array.isArray(data) ? data[0] : data
  revalidatePath('/dashboard/settings'); revalidatePath('/dashboard/students'); revalidatePath('/dashboard/marks'); revalidatePath('/dashboard/broadsheets')
  redirect(`/dashboard/settings?year_created=${encodeURIComponent(String(targetYear))}&promoted=${encodeURIComponent(String(summary?.promoted_count ?? 0))}&terminal=${encodeURIComponent(String(summary?.terminal_grade_count ?? 0))}&skipped=${encodeURIComponent(String(summary?.skipped_inactive_count ?? 0))}&existing=${encodeURIComponent(String(summary?.already_enrolled_count ?? 0))}`)
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{saved?:string;error?:string;year_created?:string;promoted?:string;terminal?:string;skipped?:string;existing?:string}> }) {
  const params=await searchParams; const { supabase, user, tenantId } = await getDashboardSession(); if(!user)return <main className="main"><p>Please sign in.</p></main>
  if(!tenantId)return <main className="main"><p>No school is linked.</p></main>
  const {data:tenant}=await supabase.from('tenants').select('name,logo_url').eq('id', tenantId).single()
  let address=''; const addr=await supabase.from('tenants').select('address').eq('id', tenantId).maybeSingle(); if(!addr.error)address=addr.data?.address??''
  const { data: yearRows } = await supabase.from('academic_years').select('year,status').eq('tenant_id', tenantId).order('year', { ascending: false }).limit(10)
  const latestYear = yearRows?.[0]?.year ?? new Date().getFullYear(); const nextYear = latestYear + 1
  return <main className="main" style={{maxWidth:850,margin:'0 auto'}}>
    <div className="top"><div><div className="eyebrow">School setup</div><h1 className="title">School Profile</h1><p className="muted">These details are used on assessment reports.</p></div></div>
    {params.error&&(() => { const i=params.error.indexOf('|'); return i>-1 ? <div className="notice error"><span className="font-semibold">{params.error.slice(0,i)}</span><span className="block text-xs opacity-80 mt-0.5">{params.error.slice(i+1)}</span></div> : <div className="notice error">{params.error}</div> })()}
    {params.saved&&<SuccessToast message="School profile saved" />}
    {params.year_created&&<div className="notice"><span className="font-semibold">Academic year {params.year_created} created.</span><span className="block text-xs opacity-80 mt-0.5">{params.promoted ?? 0} learners promoted automatically, {params.terminal ?? 0} Grade 9 learners retained in Grade 9, {params.skipped ?? 0} learners skipped because their current grade could not be resolved. {params.existing ?? 0} learners already had a placement for this year.</span></div>}
    <div className="card" style={{display:'grid',gap:15}}>
      <h2 className="section-heading" style={{margin:0,fontSize:18}}>School details</h2>
      <SchoolLogoUploader logoUrl={tenant?.logo_url ?? null} tenantId={tenantId} />
      <form action={saveSchool} style={{display:'grid',gap:15}}>
        <label className="field-label">School name<input name="name" defaultValue={tenant?.name??''} required/></label>
        <label className="field-label">Address / P.O Box<input name="address" placeholder="P.O. Box 123 — City" defaultValue={address}/></label>
        <SubmitButton style={{width:'max-content'}}>Save school profile</SubmitButton>
      </form>
    </div>
    <div className="card" style={{display:'grid',gap:15,marginTop:24}}>
      <div><h2 className="section-heading" style={{margin:0,fontSize:18}}>Academic years</h2><p className="muted" style={{marginTop:4}}>Create the next academic year and automatically progress active learner placements from each grade to the next, up to Grade 9.</p></div>
      <form action={createAcademicYear} style={{display:'grid',gap:15}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}><label className="field-label">Source academic year<input name="source_year" type="number" min="2000" max="2100" defaultValue={latestYear} required/></label><label className="field-label">New academic year<input name="target_year" type="number" min="2000" max="2100" defaultValue={nextYear} required/></label></div><div className="notice" style={{margin:0}}>Grade 1 → Grade 2 → … → Grade 8 → Grade 9. Grade 9 remains Grade 9. Existing academic records and marks are not rewritten.</div><SubmitButton style={{width:'max-content'}}>Create year &amp; promote learners</SubmitButton></form>
      {(yearRows?.length ?? 0) > 0 && <div style={{display:'grid',gap:6}}><div className="eyebrow">Recent academic years</div>{yearRows?.map((row) => <div key={row.year} style={{display:'flex',justifyContent:'space-between',padding:'8px 10px',border:'1px solid var(--border,#e2e8f0)',borderRadius:8}}><span>{row.year}</span><span className="muted">{row.status}</span></div>)}</div>}
    </div>
    <div style={{marginTop:24}}><ChangePasswordForm /></div>
  </main>
}