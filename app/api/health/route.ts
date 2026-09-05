import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const started = Date.now()
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('tenants').select('id', { count: 'exact', head: true })
    if (error) {
      logError('health_check_failed', error, { duration_ms: Date.now() - started })
      return NextResponse.json({ status: 'unhealthy' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ status: 'ok' }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    logError('health_check_exception', error, { duration_ms: Date.now() - started })
    return NextResponse.json({ status: 'unhealthy' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
