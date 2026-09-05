/**
 * Cross-device end-to-end audit logged in as "mwita" (admin).
 *
 * Runs at four viewport sizes: mobile 375px, mobile 390px, tablet 768px, desktop 1440px.
 *
 * For each size it:
 *   1. Tests the real login UI (fill form + click Login) and asserts the
 *      redirect to the admin dashboard.
 *   2. Visits every admin-reachable screen and checks:
 *        - the page actually rendered (no Next error page / 500),
 *        - no unexpected horizontal overflow (clipped content at the window level),
 *        - the page has meaningful text content.
 *   3. For the marks entry screen, additionally verifies the score-input column
 *      is horizontally reachable within its scroll rail (the known bug class).
 *
 * Auth is performed through the real form so the full login path (throttle gate,
 * signInWithPassword, role lookup, redirect) is exercised on each device size.
 */
import { chromium, type Page, type Browser } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BASE = (process.env.BASE_URL ?? 'http://localhost:3099').replace(/\/$/, '')
const EMAIL = process.env.TEST_EMAIL ?? 'mwita1@gmail.com'
const PASSWORD = process.env.TEST_PASSWORD ?? 'TestPass123!'
const SHOTS = join(__dirname, '..', 'test-results', 'mwita-audit')

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 667, dsf: 3, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  { name: 'mobile-390', width: 390, height: 844, dsf: 3, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  { name: 'tablet-768', width: 768, height: 1024, dsf: 2, ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  { name: 'desktop-1440', width: 1440, height: 900, dsf: 1, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
]

// All admin-reachable screens from the navigation rail.
const SCREENS = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Learners (students)', path: '/dashboard/students' },
  { label: 'Grades (classes)', path: '/dashboard/classes' },
  { label: 'Streams', path: '/dashboard/streams' },
  { label: 'Learning Areas (subjects)', path: '/dashboard/subjects' },
  { label: 'Assessments (examinations)', path: '/dashboard/examinations' },
  { label: 'Assessment Scores', path: '/dashboard/marks' },
  { label: 'Broadsheets', path: '/dashboard/broadsheets' },
  { label: 'Analysis', path: '/dashboard/analysis' },
  { label: 'Report Forms (reports)', path: '/dashboard/reports' },
  { label: 'Grading', path: '/dashboard/grading' },
  { label: 'School Profile (settings)', path: '/dashboard/settings' },
]

interface ScreenReport {
  label: string
  path: string
  status: number
  isNextError: boolean
  textLen: number
  bodyHOverflow: boolean
  docHOverflow: boolean
  viewportW: number
  docScrollW: number
}

async function doLogin(page: Page): Promise<{ ok: boolean; finalUrl: string; error?: string; attempts: number }> {
  let lastError: string | undefined
  let attempts = 0
  for (let t = 0; t < 2; t++) {
    attempts++
    try {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForSelector('#username', { timeout: 15000 })
      await page.fill('#username', EMAIL)
      await page.fill('#password', PASSWORD)
      await page.click('button[type="submit"]')
      await page.waitForURL('**/dashboard**', { timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(1500)
      if (page.url().includes('/dashboard')) {
        return { ok: true, finalUrl: page.url(), attempts }
      }
      lastError = 'no redirect to /dashboard'
    } catch (e: any) {
      lastError = e?.message
    }
    // Transient throttle/rate-limit on auth — brief pause then retry (a real
    // user would do the same rather than being locked out of the check).
    await new Promise((r) => setTimeout(r, 4000))
  }
  return { ok: false, finalUrl: page.url(), error: lastError, attempts }
}

async function auditScreen(page: Page, s: { label: string; path: string }): Promise<ScreenReport> {
  let status = 0
  try {
    const resp = await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle', timeout: 30000 })
    status = resp?.status() ?? 0
  } catch (e: any) {
    return { label: s.label, path: s.path, status: -1, isNextError: false, textLen: 0, bodyHOverflow: false, docHOverflow: false, viewportW: 0, docScrollW: 0 }
  }
  await page.waitForTimeout(800)
  return await page.evaluate(
    ({ s, status }) => {
      const text = (document.body?.innerText ?? '').trim()
      const doc = document.documentElement
      const body = document.body
      const isNextError = /statusCode["']?\s*[:=]\s*500/.test(document.body?.innerHTML?.slice(0, 2000) ?? '') || text.includes('statusCode')
      return {
        label: s.label,
        path: s.path,
        status,
        isNextError: isNextError && text.includes('statusCode'),
        textLen: text.length,
        bodyHOverflow: body ? body.scrollWidth > body.clientWidth + 1 : false,
        docHOverflow: doc.scrollWidth > doc.clientWidth + 1,
        viewportW: window.innerWidth,
        docScrollW: doc.scrollWidth,
      }
    },
    { s, status },
  )
}

/**
 * For the marks matrix, verify the score-entry column is horizontally reachable:
 * scroll each .table-rail to its far right and check every input.input-score-cell
 * lands fully inside the rail's visible box. Returns a per-rail summary.
 */
async function auditMarksReachability(page: Page) {
  return await page.evaluate(() => {
    const rails = document.querySelectorAll<HTMLElement>('.table-rail')
    const out: { clientW: number; scrollW: number; inputs: number; fullyVisible: boolean; anyVisible: boolean }[] = []
    for (const rail of rails) {
      const inputs = rail.querySelectorAll<HTMLInputElement>('input.input-score-cell')
      if (!inputs.length) continue
      for (let i = 0; i < 30; i++) rail.scrollLeft = rail.scrollWidth
      const rbox = rail.getBoundingClientRect()
      let fullyVisible = true
      let anyVisible = false
      let count = 0
      for (const el of inputs) {
        const r = el.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) continue
        count++
        const visible = r.left >= rbox.left - 1 && r.right <= rbox.right + 1
        if (visible) anyVisible = true
        else fullyVisible = false
      }
      out.push({ clientW: Math.round(rbox.width), scrollW: rail.scrollWidth, inputs: count, fullyVisible, anyVisible })
    }
    return out
  })
}

async function run() {
  mkdirSync(SHOTS, { recursive: true })
  const browser: Browser = await chromium.launch({ headless: true })

  const overall: { vp: string; loginOk: boolean; failPairs: string[] }[] = []

  for (const vp of VIEWPORTS) {
    console.log(`\n════════════════════════════════════════════`)
    console.log(`VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`)
    console.log(`════════════════════════════════════════════`)

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dsf,
      userAgent: vp.ua,
    })
    const page = await context.newPage()
    const failPairs: string[] = []

    // 1) Login via real UI
    const login = await doLogin(page)
    console.log(` [LOGIN] ok=${login.ok} -> ${login.finalUrl} (attempts=${login.attempts})`)
    if (!login.ok) await page.screenshot({ path: join(SHOTS, `${vp.name}-login-fail.png`), fullPage: true })
    const loginOk = login.ok

    // 2) Screen audit
    if (loginOk) {
      for (const s of SCREENS) {
        const r = await auditScreen(page, s)
        const issues: string[] = []
        if (r.status >= 400) issues.push(`HTTP ${r.status}`)
        if (r.isNextError) issues.push('NEXT_ERROR_PAGE')
        if (r.bodyHOverflow) issues.push(`BODY_HOVER (scroll=${r.docScrollW} vw=${r.viewportW})`)
        if (r.docHOverflow) issues.push(`DOC_HOVER (scroll=${r.docScrollW} vw=${r.viewportW})`)
        if (r.textLen < 20) issues.push(`EMPTY_PAGE(${r.textLen})`)
        const flag = issues.length ? `⚠ [${issues.join(', ')}]` : '✓'
        console.log(`   ${flag.padEnd(4)} ${s.label.padEnd(30)} ${r.path}  (HTTP ${r.status}, text ${r.textLen})`)
        if (issues.length) {
          failPairs.push(`${s.path}:${issues.join(',')}`)
          await page.screenshot({ path: join(SHOTS, `${vp.name}-${s.label.replace(/\W+/g, '-')}-issue.png`), fullPage: true })
        }
      }

      // 3) Marks-entry reachability (the known bug class)
      await page.goto(`${BASE}/dashboard/marks`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(800)
      const rail = await auditMarksReachability(page)
      if (rail.length) {
        for (const r of rail) {
          const ok = r.fullyVisible
          const flag = ok ? '✓' : '⚠'
          console.log(`   ${flag}   Marks rail: clientW=${r.clientW} scrollW=${r.scrollW} inputs=${r.inputs} fullyVisible=${ok} anyVisible=${r.anyVisible}`)
          if (!ok) failPairs.push(`/dashboard/marks:RailInputsNotFullyVisible`)
        }
      } else {
        // Possibly no scope loaded — marks page will show its configure UI.
        const marksText = await page.evaluate(() => (document.body?.innerText ?? '').slice(0, 80))
        console.log(`   .  Marks page: no score rail (no scope configured). text="${marksText.trim()}"`)
      }
    }

    overall.push({ vp: vp.name, loginOk, failPairs })

    await context.close()

    // Space out the per-viewport real-UI logins to avoid tripping the app's
    // brute-force throttle / Supabase auth rate limits during the suite.
    if (vp.name !== VIEWPORTS[VIEWPORTS.length - 1].name) {
      await new Promise((r) => setTimeout(r, 6000))
    }
  }

  await browser.close()

  console.log(`\n════════════════════════════════════════════`)
  console.log('SUMMARY')
  console.log(`════════════════════════════════════════════`)
  for (const o of overall) {
    const status = o.loginOk ? (o.failPairs.length ? 'ISSUES' : 'PASS') : 'LOGIN_FAIL'
    console.log(` ${o.vp.padEnd(13)} login=${o.loginOk ? 'OK' : 'FAIL'}  ${status}  fails=[${o.failPairs.join('; ')}]`)
  }
  const anyFail = overall.some((o) => !o.loginOk || o.failPairs.length)
  console.log(`\nRESULT: ${anyFail ? 'FAILURES DETECTED — see above' : 'ALL SCREENS PASS across all viewports'}`)
}

run().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
