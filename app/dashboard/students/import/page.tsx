import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/supabase/session'
import StudentImportWizard from './StudentImportWizard'

type SearchParams = { class_id?: string }

export default async function StudentImportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const classId = String(params.class_id || '').trim()
  if (!classId) redirect('/dashboard/students?error=Select%20a%20class%20before%20starting%20a%20bulk%20import')

  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/students?error=No%20school%20is%20linked')

  const { data: selectedClass } = await supabase
    .from('classes')
    .select('id,name')
    .eq('id', classId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!selectedClass) redirect('/dashboard/students?error=Invalid%20class%20selection')

  return <StudentImportWizard classId={selectedClass.id} className={selectedClass.name} />
}
