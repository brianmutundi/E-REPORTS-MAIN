import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { getLearnerTrend } from '@/lib/analysis'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return new NextResponse('No school linked', { status: 403 })
  const throttled = limitAuthenticatedRoute(request.headers, user.id, 'analysis-learner', 60)
  if (throttled) return throttled
  const studentId = new URL(request.url).searchParams.get('student')
  if (!studentId) return new NextResponse('student is required', { status: 400 })
  const trend = await getLearnerTrend(profile.tenant_id, studentId)
  return NextResponse.json({ trend })
}