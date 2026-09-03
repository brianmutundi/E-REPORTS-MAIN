/**
 * Reproduces the reported mobile marks-entry bug:
 * "No visible input fields at ~390px viewport width"
 *
 * Authenticates via Supabase REST API, injects session cookies,
 * navigates to the marks entry page at 393px mobile viewport,
 * captures screenshots, and inspects DOM for score inputs.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BASE = process.env.BASE_URL ?? 'http://localhost:3099'
const EMAIL = process.env.TEST_EMAIL ?? 'loadtest01@school.test'
const PASSWORD = process.env.TEST_PASSWORD ?? 'TestPass123!'
const SB_URL = 'https://oakznwbqzcbxzkemvoce.supabase.co'
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ha3pud2JxemNieHprZW12b2NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NjgyMzQsImV4cCI6MjEwMzU0NDIzNH0.3QckHxNBq5zO-litDzBV9eiojTkKSgumfS_OceV1BVY'
const VIEWPORT_W = 393
const VIEWPORT_H = 852
const SHOTS = join(__dirname, '..', 'test-results', 'mobile-marks')

interface TokenData {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at: number
  token_type: string
  user: { id: string; email: string }
}

async function getSupabaseSession(email: string, password: string): Promise<TokenData> {
  const resp = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SB_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(`Supabase auth failed: ${resp.status} ${body.error_description || body.msg || resp.statusText}`)
  }
  return resp.json()
}

/**
 * @supabase/ssr 0.5.x stores sessions in chunked cookies.
 * The storage key is `sb-<project-ref>-auth-token`.
 * In the default "raw" encoding the value is the JSON string directly;
 * with "base64url" encoding it is prefixed by "base64-".
 * The middleware reads these via request.cookies.getAll().
 *
 * For the server middleware, the session must be in a cookie.
 * We set it using the Playwright context's addCookies API.
 */
function buildSessionCookie(token: TokenData) {
  const key = 'sb-oakznwbqzcbxzkemvoce-auth-token'
  const sessionJson = JSON.stringify({
    access_token: token.access_token,
    expires_at: token.expires_at,
    expires_in: token.expires_in,
    refresh_token: token.refresh_token,
    token_type: token.token_type,
    user: token.user,
  })
  // @supabase/ssr uses base64- prefix when cookieEncoding is "base64url"
  // Check which encoding the project uses by looking at the middleware
  const encoded = 'base64-' + Buffer.from(sessionJson).toString('base64')
  return { key, value: encoded }
}

async function main() {
  mkdirSync(SHOTS, { recursive: true })

  console.log(`\n=== Mobile Marks-Entry Bug Reproduction ===`)
  console.log(`Viewport: ${VIEWPORT_W}x${VIEWPORT_H}`)

  // ── 1. Get session token ───────────────────────────────────────
  console.log('\n[1] Authenticating via Supabase REST API...')
  const token = await getSupabaseSession(EMAIL, PASSWORD)
  console.log(`    OK: ${token.user.email} (id: ${token.user.id})`)

  const { key: cookieKey, value: cookieValue } = buildSessionCookie(token)

  // ── 2. Launch browser with injected cookies ────────────────────
  console.log('[2] Launching browser with session cookie...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })

  // Set the session cookie before any navigation
  await context.addCookies([
    {
      name: cookieKey,
      value: cookieValue,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ])

  const page = await context.newPage()

  // ── 3. Navigate to marks page with scope selected ───────────────
  // Use known IDs: MID TERM exam, GRADE 1, CREATIVE ARTS
  const EXAM_ID = 'e8fb49ab-03bd-4820-af42-9a6036200ec4'
  const CLASS_ID = '4ef544c8-0cba-4047-a352-f75a2c52ae4b'
  const SUBJECT_ID = '239cba23-f5eb-4698-a420-80c5e0d5ccd4'
  const marksUrl = `${BASE}/dashboard/marks?exam=${EXAM_ID}&class=${CLASS_ID}&subject=${SUBJECT_ID}`
  console.log('[3] Navigating to marks page with scope...')
  await page.goto(marksUrl, { waitUntil: 'networkidle', timeout: 30000 })
  console.log(`    Final URL: ${page.url()}`)

  // ── 4. Screenshots ─────────────────────────────────────────────
  await page.screenshot({ path: join(SHOTS, '01-marks-mobile-full.png'), fullPage: true })
  console.log('[4] Full-page screenshot: 01-marks-mobile-full.png')
  await page.screenshot({ path: join(SHOTS, '02-marks-mobile-viewport.png'), fullPage: false })
  console.log('    Viewport screenshot:  02-marks-mobile-viewport.png')

  // ── 5. DOM analysis ────────────────────────────────────────────
  const analysis = await page.evaluate(() => {
    const scoreInputs = document.querySelectorAll('input.input-score-cell')
    const allInputs = document.querySelectorAll('input')
    const selects = document.querySelectorAll('select')
    const tables = document.querySelectorAll('table')
    const tableRails = document.querySelectorAll('.table-rail')
    const notices = document.querySelectorAll('.notice')

    const scoreInputDetails = Array.from(scoreInputs).map((el, i) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      return {
        index: i,
        name: el.getAttribute('name'),
        ariaLabel: el.getAttribute('aria-label'),
        hasRect: rect.width > 0 && rect.height > 0,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        display: style.display,
        visibility: style.visibility,
        opacity: parseFloat(style.opacity),
        outsideViewport: rect.x > window.innerWidth || rect.y > window.innerHeight || rect.x + rect.width < 0 || rect.y + rect.height < 0,
      }
    })

    const selectDetails = Array.from(selects).map((el) => ({
      name: el.getAttribute('name'),
      id: el.getAttribute('id'),
      visible: el.getBoundingClientRect().width > 0,
      disabled: el.disabled,
    }))

    return {
      counts: {
        allInputs: allInputs.length,
        scoreInputs: scoreInputs.length,
        selects: selects.length,
        tables: tables.length,
        tableRails: tableRails.length,
        notices: notices.length,
      },
      scoreInputDetails,
      selectDetails,
      noticeTexts: Array.from(notices).map(el => el.textContent?.trim()).filter(Boolean),
      overflow: {
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,
        hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      },
      tableRailInfo: Array.from(tableRails).map((el) => ({
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        hasHScroll: el.scrollWidth > el.clientWidth,
      })),
      pageText: document.body?.innerText?.slice(0, 2000) ?? '(empty)',
    }
  })

  console.log('\n[5] DOM Counts:')
  console.log(`    <input> total:          ${analysis.counts.allInputs}`)
  console.log(`    <input.input-score-cell>: ${analysis.counts.scoreInputs}`)
  console.log(`    <select>:               ${analysis.counts.selects}`)
  console.log(`    <table>:                ${analysis.counts.tables}`)
  console.log(`    .table-rail:            ${analysis.counts.tableRails}`)
  console.log(`    .notice:                ${analysis.counts.notices}`)

  if (analysis.noticeTexts.length) {
    console.log('\n    Notice banners:')
    for (const n of analysis.noticeTexts) console.log(`      - ${n}`)
  }

  if (analysis.scoreInputDetails.length > 0) {
    console.log(`\n[6] Score input analysis (${analysis.scoreInputDetails.length} inputs):`)
    let visibleInVP = 0, outsideVP = 0, notInLayout = 0, zeroSize = 0

    for (const info of analysis.scoreInputDetails) {
      if (!info.hasRect) {
        notInLayout++
        console.log(`    [${info.index}] ${info.ariaLabel ?? info.name}: NOT IN LAYOUT`)
      } else if (info.width === 0 || info.height === 0) {
        zeroSize++
        console.log(`    [${info.index}] ${info.ariaLabel ?? info.name}: ZERO SIZE`)
      } else if (info.outsideViewport) {
        outsideVP++
        console.log(`    [${info.index}] ${info.ariaLabel ?? info.name}: OUTSIDE VP ${info.width}×${info.height} at (${info.x},${info.y})`)
      } else {
        visibleInVP++
        console.log(`    [${info.index}] ${info.ariaLabel ?? info.name}: ✅ VISIBLE ${info.width}×${info.height} at (${info.x},${info.y}) vis=${info.visibility} opacity=${info.opacity}`)
      }
    }
    console.log(`\n    Summary: ${visibleInVP} visible, ${outsideVP} outside-viewport, ${notInLayout} not-in-layout, ${zeroSize} zero-size`)

    if (outsideVP > 0 || notInLayout > 0) {
      console.log('\n    ⚠ BUG REPRODUCED: Score inputs exist but are NOT visible in the mobile viewport!')
    } else if (visibleInVP > 0) {
      console.log('\n    ✓ All score inputs are visible in the viewport.')
    }
  } else {
    console.log('\n[6] ⚠ No score inputs found in DOM. Investigating...')
    if (analysis.selectDetails.length) {
      console.log('    Filter selects:')
      for (const s of analysis.selectDetails) console.log(`      ${s.id ?? s.name}: visible=${s.visible} disabled=${s.disabled}`)
    }
  }

  console.log('\n[7] Horizontal overflow:')
  console.log(`    body: scrollW=${analysis.overflow.bodyScrollWidth} clientW=${analysis.overflow.bodyClientWidth}`)
  console.log(`    doc:  scrollW=${analysis.overflow.docScrollWidth} clientW=${analysis.overflow.docClientWidth}`)
  console.log(`    hasHorizontalScroll: ${analysis.overflow.hasHorizontalScroll}`)

  if (analysis.tableRailInfo.length) {
    console.log('\n[8] .table-rail:')
    for (const r of analysis.tableRailInfo) {
      console.log(`    ${r.width}×${r.height} scrollW=${r.scrollWidth} clientW=${r.clientWidth} hasHScroll=${r.hasHScroll}`)
    }
  }

  console.log(`\n[9] Page text:\n${analysis.pageText}`)

  // ── 9b. Horizontal-reachability check: scroll each rail to its far right
  // and confirm a score input lands fully inside the rail's visible area. ──
  const reachability = await page.evaluate(() => {
    const rails = document.querySelectorAll<HTMLElement>('.table-rail')
    let verified = 0
    let totalInputs = 0
    const details: { clientW: number; scrollLeft: number; inputs: number; fullyVisible: boolean; anyVisible: boolean }[] = []
    for (const rail of rails) {
      const inputs = rail.querySelectorAll<HTMLInputElement>('input.input-score-cell')
      if (inputs.length === 0) continue
      totalInputs += inputs.length
      for (let i = 0; i < 20; i++) rail.scrollLeft = rail.scrollWidth
      const rw = rail.clientWidth
      let allFullVis = true
      let anyVisible = false
      for (const el of inputs) {
        const r = el.getBoundingClientRect()
        const vis = r.width > 0 && r.height > 0 &&
          r.left >= rail.getBoundingClientRect().left - 1 &&
          r.right <= rail.getBoundingClientRect().right + 1
        if (vis) anyVisible = true
        else allFullVis = false
      }
      details.push({ clientW: rw, scrollLeft: rail.scrollLeft, inputs: inputs.length, fullyVisible: allFullVis, anyVisible })
      verified++
    }
    return { verified, totalInputs, details }
  })
  console.log(`\n     Reachability: ${reachability.verified} rail(s), ${reachability.totalInputs} score inputs checked.`)
  for (const d of reachability.details) {
    console.log(`       rail: clientW=${d.clientW} scrollLeft=${d.scrollLeft} inputs=${d.inputs} fullyVisible=${d.fullyVisible} anyVisible=${d.anyVisible}`)
  }

  await browser.close()
  console.log('\n=== Done ===\n')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
