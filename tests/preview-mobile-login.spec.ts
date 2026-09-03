import { chromium, type Page } from 'playwright'
const BASE = 'https://e-reports-kf3cbwv54-brian-7b28.vercel.app'
const EMAIL = process.env.TEST_EMAIL ?? 'mwita1@gmail.com'
const PASSWORD = process.env.TEST_PASSWORD ?? 'TestPass123!'
const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

async function attempt(label: string) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 375, height: 667 }, userAgent: ua })
  const net: string[] = []
  page.on('request', r => { const u = r.url(); if (u.includes('/api/auth/') || u.includes('/auth/v1/')) net.push(`REQ:${r.method()} ${u.replace(BASE,'')}`) })
  const consoleErr: string[] = []
  page.on('console', m => { if (m.type()==='error' || m.type()==='warning') consoleErr.push(`[${m.type()}] ${m.text().slice(0,150)}`) })
  page.on('pageerror', e => consoleErr.push(`[pageerror] ${String(e).slice(0,200)}`))
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 40000 })
  await page.fill('#username', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(6000)
  console.log(`\n=== ${label} ===`)
  console.log(`URL: ${page.url()}`)
  const notice = await page.locator('.notice').textContent().catch(()=>'')
  if (notice) console.log(`NOTICE: ${notice}`)
  console.log('NETWORK:')
  for (const n of net) console.log('  ' + n)
  console.log('CONSOLE (errors/warnings):')
  for (const c of consoleErr) console.log('  ' + c)
  await browser.close()
}

;(async () => {
  await attempt('PREVIEW mobile-375 first try')
  await attempt('PREVIEW mobile-375 second try')
})().catch(e => { console.error('Fatal', e); process.exit(1) })
