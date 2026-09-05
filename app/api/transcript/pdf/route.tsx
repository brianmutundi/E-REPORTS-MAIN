import { NextRequest } from 'next/server'
import { Document, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { getTranscriptForClass } from '@/lib/transcript'
import TranscriptPage from '@/components/reports/transcript/TranscriptPage'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return new Response('No school linked', { status: 403 })
  const throttled = limitAuthenticatedRoute(request.headers, user.id, 'transcript-pdf', 20)
  if (throttled) return throttled

  const url = new URL(request.url)
  const classId = url.searchParams.get('class')
  const studentId = url.searchParams.get('student')?.trim() || null
  if (!classId) return new Response('class is required', { status: 400 })

  const { data: cls } = await supabase.from('classes').select('id,name').eq('id', classId).eq('tenant_id', profile.tenant_id).maybeSingle()
  if (!cls) return new Response('Grade not found', { status: 404 })

  const transcripts = await getTranscriptForClass(classId)
  if (!transcripts.length) return new Response('No transcript data found', { status: 404 })

  const selected = studentId ? transcripts.filter(t => t.student.studentId === studentId) : transcripts
  if (!selected.length) return new Response('Student not found', { status: 404 })

  const pdf = await renderToBuffer(<Document>{selected.map(t => <TranscriptPage key={t.student.studentId} data={t} />)}</Document>)
  const filename = studentId ? `transcript-${selected[0].student.admissionNo}.pdf` : `transcripts-${cls.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`

  return new Response(pdf as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' },
  })
}