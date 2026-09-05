import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { toCsv } from '@/lib/csv'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const csv = toCsv([
    ['Adm No', 'Name', 'Parent Phone'],
    ['ADM-1001', 'Jane Wanjiku', '0712345678'],
    ['ADM-1002', 'John Otieno', ''],
  ])
  return new NextResponse(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="student-import-template.csv"' },
  })
}
