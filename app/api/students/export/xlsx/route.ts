import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return new Response('No school linked', { status: 403 })

  const throttled = limitAuthenticatedRoute(request.headers, user.id, 'export-students-xlsx', 30)
  if (throttled) return throttled

  const classId = new URL(request.url).searchParams.get('class_id')?.trim()
  if (!classId) return new Response('class_id is required', { status: 400 })

  const { data: cls } = await supabase.from('classes').select('id,name').eq('id', classId).eq('tenant_id', profile.tenant_id).maybeSingle()
  if (!cls) return new Response('Class not found', { status: 404 })

  const { data: students, error } = await supabase
    .from('students')
    .select('admission_no,full_name')
    .eq('tenant_id', profile.tenant_id)
    .eq('class_id', cls.id)
    .order('full_name')
  if (error) return new Response('Could not load the selected class roster.', { status: 500 })

  const studentRows = (students ?? []) as { admission_no: string; full_name: string }[]
  const rows = [
    ['Admission No.', 'Name'],
    ...studentRows.map((student) => [student.admission_no, student.full_name]),
  ]
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = [{ wch: 20 }, { wch: 40 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Students')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  const safeClass = cls.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'class'

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeClass}-students.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
