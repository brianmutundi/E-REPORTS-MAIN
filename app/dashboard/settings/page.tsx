import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDashboardSession } from '@/lib/supabase/session'
import SuccessToast from '@/components/SuccessToast'
import SchoolLogoUploader from './logo-uploader'
import ChangePasswordForm from './change-password-form'

async function saveSchool(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession(); if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/settings?error=No%20school%20is%20linked')
  const name = String(formData.get('name') || '').trim(); const code = String(formData.get('code') || '').trim() || null; const address = String(formData.get('address') || '').trim() || null
  if (!name) redirect('/dashboard/settings?error=School%20name%20is%20required')
  // Try to persist the address too; if the column has not been applied to
  // the project yet, fall back to the original fields so saving still works.
  let { error } = await supabase.from('tenants').update({ name, code, address }).eq('id', tenantId)
  if (error) {
    const retry = await supabase.from('tenants').update({ name, code }).eq('id', tenantId)
    error = retry.error
  }
  if (error) redirect(`/dashboard/settings?error=${encodeURIComponent(error.message)}`)
  redirect('/dashboard/settings?saved=1')
}
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{saved?:string;error?:string}> }) {
  const params=await searchParams; const { supabase, user, tenantId } = await getDashboardSession(); if(!user)return <main className="main"><p>Please sign in.</p></main>
  if(!tenantId)return <main className="main"><p>No school is linked.</p></main>
  const {data:tenant}=await supabase.from('tenants').select('name,code,logo_url').eq('id', tenantId).single()
  let address=''
  const addr=await supabase.from('tenants').select('address').eq('id', tenantId).maybeSingle(); if(!addr.error)address=addr.data?.address??''
  return <main className="main" style={{maxWidth:850,margin:'0 auto'}}><div className="top"><div><div className="eyebrow">School setup</div><h1 className="title">School Profile</h1><p className="muted">These details are used on report forms.</p></div><Link className="btn secondary" href="/dashboard/reports/template">Report Template</Link></div>{params.error&&<div className="notice error">{params.error}</div>}{params.saved&&<SuccessToast message="School profile saved" />}
    <div className="card" style={{display:'grid',gap:15}}>
      <h2 className="section-heading" style={{margin:0,fontSize:18}}>School details</h2>
      <SchoolLogoUploader logoUrl={tenant?.logo_url ?? null} tenantId={tenantId} />
      <form action={saveSchool} style={{display:'grid',gap:15}}>
        <label className="field-label">School name<input name="name" defaultValue={tenant?.name??''} required/></label>
        <label className="field-label">School code<input name="code" defaultValue={tenant?.code??''}/></label>
        <label className="field-label">Address / P.O Box<input name="address" placeholder="P.O. Box 123 — City" defaultValue={address}/></label>
        <button className="btn" style={{width:'max-content'}}>Save school profile</button>
      </form>
    </div>
    <div style={{marginTop:24}}><ChangePasswordForm /></div>
  </main>
}
