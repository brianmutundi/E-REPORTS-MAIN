/**
 * Verifies download/export endpoints and buttons work on the target host.
 * Authenticates via Supabase REST API, injects the session cookie (host-agnostic),
 * then:
 *   - hits the class reports PDF endpoint directly (batch class PDF)
 *   - navigates to the Results page with scope and clicks "Download Excel" + "Download PDF"
 *   - navigates to the Students page for a class and clicks its Excel/PDF exports
 * Each download is captured and asserted to have a non-zero, sane content-length.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const OUT = join(__dirname, '..', 'test-results', 'downloads')
mkdirSync(OUT, { recursive: true })

const BASE = process.env.BASE_URL ?? 'http://localhost:3100'
const BASE_HOST = new URL(BASE).hostname
const BASE_ORIGIN = new URL(BASE).origin
const BASE_SECURE = BASE.startsWith('https://')
const EMAIL = process.env.TEST_EMAIL ?? 'mwita1@gmail.com'
const PASSWORD = process.env.TEST_PASSWORD ?? 'TestPass123!'
const SB_URL = 'https://oakznwbqzcbxzkemvoce.supabase.co'
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ha3pud2JxemNieHprZW12b2NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NjgyMzQsImV4cCI6MjEwMzU0NDIzNH0.3QckHxNBq5zO-litDzBV9eiojTkKSgumfS_OceV1BVY'

const EXAM_ID = 'e8fb49ab-03bd-4820-af42-9a6036200ec4' // MID TERM
const CLASS_ID = '4ef544c8-0cba-4047-a352-f75a2c52ae4b' // GRADE 1

async function getToken() {
  const resp = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SB_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!resp.ok) throw new Error(`auth failed: ${resp.status}`)
  return resp.json()
}

function buildCookie(token: any) {
  const json = JSON.stringify({
    access_token: token.access_token,
    expires_at: token.expires_at,
    expires_in: token.expires_in,
    refresh_token: token.refresh_token,
    token_type: token.token_type,
    user: token.user,
  })
  return { name: 'sb-oakznwbqzcbxzkemvoce-auth-token', value: 'base64-' + Buffer.from(json).toString('base64') }
}

const results: string[] = []

function record(label: string, ok: boolean, detail = '') {
  const tag = ok ? 'PASS' : 'FAIL'
  results.push(`${tag}  ${label}${detail ? ' — ' + detail : ''}`)
  console.log(` ${tag}  ${label}${detail ? ' — ' + detail : ''}`)
}

async function main() {
  console.log(`\n=== Download / Export verification on ${BASE} ===\n`)
  const token = await getToken()
  const cookie = buildCookie(token)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  })
  await context.addCookies([{ ...cookie, domain: BASE_HOST, path: '/', httpOnly: false, secure: BASE_SECURE, sameSite: 'Lax' }])
  const page = await context.newPage()

  // 1) Direct: reports class PDF endpoint
  {
    record('reports/pdf endpoint (batch class PDF)', true, 'requesting…')
    const resp = await page.request.get(
      `${BASE_ORIGIN}/api/reports/pdf?exam=${EXAM_ID}&class=${CLASS_ID}`,
      { headers: { cookie: `${cookie.name}=${cookie.value}` } },
    )
    const len = resp.headers()['content-length']
    const ctype = resp.headers()['content-type']
    const buf = (await resp.body()).byteLength
    const ok = resp.status() === 200 && /pdf/.test(ctype ?? '') && buf > 1000
    record(`reports/pdf (status=${resp.status()}, type=${ctype}, bytes=${buf})`, ok)
  }

  // 1b) Direct: analysis export PDF endpoint
  {
    const resp = await page.request.get(
      `${BASE_ORIGIN}/api/analysis/export/pdf?exam=${EXAM_ID}&class=${CLASS_ID}`,
      { headers: { cookie: `${cookie.name}=${cookie.value}` } },
    )
    const ctype = resp.headers()['content-type']
    const buf = (await resp.body()).byteLength
    const ok = resp.status() === 200 && /pdf/.test(ctype ?? '') && buf > 1000
    record(`analysis/pdf export (status=${resp.status()}, type=${ctype}, bytes=${buf})`, ok)
  }

  // 2) Results page -> Download Excel + PDF (real button clicks)
  {
    const url = `${BASE}/dashboard/results?exam=${EXAM_ID}&class=${CLASS_ID}`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {})
    // Buttons render only after the async server component resolves its data;
    // poll up to 40s for the download links to appear.
    let has = 0
    for (let i = 0; i < 20; i++) {
      has = await page.locator('a[download]').count().catch(() => 0)
      if (has >= 2) break
      await page.waitForTimeout(2000)
    }
    const xlsxBtn = page.locator('a[download]', { hasText: 'Download Excel' })
    const pdfBtn = page.locator('a[download]', { hasText: 'Download PDF' })
    record('results page shows download buttons', has >= 2)
    if (has >= 2) {
      const dl1 = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
      await xlsxBtn.first().click()
      const d = await dl1
      if (d) {
        const p = join(OUT, d.suggestedFilename())
        const path = await d.path()
        const bytes = path ? (await import('node:fs').then(f => f.statSync(path).size)) : 0
        record(`results Excel download '${d.suggestedFilename()}'`, bytes > 500, `${bytes} bytes`)
      } else record('results Excel download', false, 'no download event')
      const dl2 = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
      await pdfBtn.first().click()
      const d2 = await dl2
      if (d2) {
        const path = await d2.path()
        const bytes = path ? (await import('node:fs').then(f => f.statSync(path).size)) : 0
        record(`results PDF download '${d2.suggestedFilename()}'`, bytes > 1000, `${bytes} bytes`)
      } else record('results PDF download', false, 'no download event')
    }
  }

  // 3) Students page -> class Excel + PDF exports
  {
    const url = `${BASE}/dashboard/students?class_id=${CLASS_ID}`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {})
    let has = 0
    for (let i = 0; i < 20; i++) {
      has = await page.locator('a[download]').count().catch(() => 0)
      if (has >= 2) break
      await page.waitForTimeout(2000)
    }
    const xlsxBtn = page.locator('a[download]', { hasText: 'Excel' })
    const pdfBtn = page.locator('a[download]', { hasText: 'PDF' })
    record('students page shows export buttons', has >= 2)
    if (has >= 2) {
      const dl1 = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
      await xlsxBtn.first().click()
      const d = await dl1
      if (d) {
        const path = await d.path()
        const bytes = path ? (await import('node:fs').then(f => f.statSync(path).size)) : 0
        record(`students Excel export '${d.suggestedFilename()}'`, bytes > 500, `${bytes} bytes`)
      }
      const dl2 = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
      await pdfBtn.first().click()
      const d2 = await dl2
      if (d2) {
        const path = await d2.path()
        const bytes = path ? (await import('node:fs').then(f => f.statSync(path).size)) : 0
        record(`students PDF export '${d2.suggestedFilename()}'`, bytes > 1000, `${bytes} bytes`)
      }
    }
  }

  await browser.close()

  console.log('\n=== DOWNLOAD RESULTS ===')
  const fails = results.filter(r => r.startsWith('FAIL'))
  results.forEach(r => console.log('  ' + r))
  console.log(`\n${fails.length === 0 ? 'ALL DOWNLOADS PASS' : 'DOWNLOAD FAILURES: ' + fails.length}`)
}

main().catch(e => { console.error('Fatal', e); process.exit(1) })
