import path from 'node:path'
import fs from 'node:fs'
import Handlebars from 'handlebars'
import puppeteer from 'puppeteer'

/**
 * HTML-to-PDF engine + Handlebars compile for the selectable custom HTML
 * report form ('html_custom'). This is how the plain-HTML CBC report template
 * (the gemini-code HTML mockup) becomes a real, pixel-faithful PDF instead of
 * being handed back as a .txt/.html file.
 *
 * Templates use Handlebars `{{placeholder}}` syntax against the same
 * AssessmentReportData shape that `buildCbcData()` builds for the
 * React-PDF CBC template, so both render paths stay in sync.
 */

// Date formatter helpers usable from any uploaded template.
export function formatReportDate(value: unknown): string {
  if (value == null || value === '') return '_____________'
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) || /^\d{2}-[A-Za-z]{3}-\d{4}$/.test(text)) {
    const date = new Date(`${text}T00:00:00`)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    }
    return text
  }
  return text
}

Handlebars.registerHelper('dateFormat', (value: unknown) => formatReportDate(value))
Handlebars.registerHelper('ifEq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
  return a === b ? options.fn(this) : options.inverse(this)
})
Handlebars.registerHelper('upper', (value: unknown) => String(value ?? '').toUpperCase())

/**
 * Built-in default for the custom HTML report: the CBC 4-level assessment
 * report as generated from the gemini-code mockup. Keeps the exact same
 * placeholders as the React-PDF CBC template, so a school can paste its own
 * HTML over it and the data binding still lines up.
 */
export const GEMINI_CBC_HTML_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 10px; }
  .page-outer { border: 2px solid #1e293b; padding: 10px; }
  .page-inner { border: 0.75px solid #1e293b; padding: 12px; }
  .header { display: flex; align-items: center; border-bottom: 1.5px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 10px; }
  .header .logo { width: 60px; text-align: center; }
  .header .logo img { width: 50px; height: 50px; border-radius: 50%; object-fit: contain; }
  .header .logo .initials { width: 50px; height: 50px; border-radius: 50%; border: 1.5px solid #1e3a8a; background: #eff6ff; color: #1e3a8a; font-weight: 700; font-size: 11px; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
  .header .school { flex: 1; text-align: center; }
  .header .school h1 { margin: 0; font-size: 15px; letter-spacing: 1px; color: #1e3a8a; text-transform: uppercase; }
  .header .school p { margin: 2px 0 0; color: #475569; font-size: 8px; }
  .header .school .title { margin: 5px 0 0; font-size: 9.5px; font-weight: 700; text-transform: uppercase; }
  .meta { display: flex; border: 1px solid #cbd5e1; background: #eff6ff; margin-bottom: 12px; }
  .meta .cell { flex: 1; padding: 7px; }
  .meta .cell .label { font-size: 6.5px; font-weight: 700; text-transform: uppercase; color: #475569; }
  .meta .cell .value { font-size: 10px; font-weight: 700; color: #1e3a8a; }
  .section-title { font-size: 7.5px; font-weight: 700; text-transform: uppercase; color: #1e3a8a; margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #f8fafc; color: #475569; border: 0.5px solid #cbd5e1; padding: 4px; font-size: 6.5px; text-transform: uppercase; }
  td { border: 0.5px solid #cbd5e1; padding: 5px; font-size: 8.5px; }
  .badge { display: inline-block; border-radius: 3px; padding: 1.5px 4px; font-weight: 700; font-size: 7px; }
  .badge.ee { background: #dcfce7; color: #166534; }
  .badge.me { background: #dbeafe; color: #1e40af; }
  .badge.ae { background: #fef9c3; color: #854d0e; }
  .badge.be { background: #fee2e2; color: #991b1b; }
  tr.summary td { background: #f8fafc; font-weight: 700; }
  .info { display: flex; border: 1px dashed #cbd5e1; background: #fafafa; margin-bottom: 12px; }
  .info .cell { flex: 1; padding: 6px; font-size: 8px; }
  .info .cell .label { font-weight: 700; }
  .remarks { display: flex; gap: 10px; }
  .remarks .card { flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; }
  .remarks .card .text { font-style: italic; font-size: 8.5px; margin: 6px 0; min-height: 26px; }
  .remarks .card .name { font-size: 8px; margin: 0 0 6px; }
  .remarks .card .sig { display: flex; font-size: 7.5px; }
  .remarks .card .sig span { flex: 1; border-bottom: 0.75px dashed #94a3b8; height: 8px; }
  .e-reports-page-break { page-break-after: always; }
</style>
</head>
<body>
  <div class="page-outer"><div class="page-inner">
    <div class="header">
      <div class="logo">
        {{#if school.logo_url}}<img src="{{school.logo_url}}" alt="School logo">{{else}}<div class="initials">{{school.initials}}</div>{{/if}}
      </div>
      <div class="school">
        <h1>{{school.name}}</h1>
        <p>PO Box: {{school.box_number}}{{#if school.location}}, {{school.location}}{{/if}}</p>
        <div class="title">Assessment Report &mdash; {{exam.term_title}}</div>
      </div>
      <div class="logo"></div>
    </div>

    <div class="meta">
      <div class="cell"><div class="label">Student Name</div><div class="value">{{student.name}}</div></div>
      <div class="cell"><div class="label">Admission No.</div><div class="value">{{student.admission_number}}</div></div>
      <div class="cell"><div class="label">Grade</div><div class="value">{{student.grade}}</div></div>
    </div>

    <div class="section-title">Performance Level Key (4-Level Scale)</div>
    <table>
      <thead><tr><th style="width:14%">Code</th><th>Performance Level</th><th style="width:30%">Score Range</th></tr></thead>
      <tbody>
      {{#each performance_levels}}
        <tr><td style="text-align:center"><span class="badge {{code_slug}}">{{code}}</span></td><td>{{name}}</td><td style="text-align:center">{{range}}</td></tr>
      {{/each}}
      </tbody>
    </table>

    <table>
      <thead><tr><th style="text-align:left">Learning Area</th><th style="width:12%">Score</th><th style="width:14%">Level</th><th style="text-align:left">Description</th></tr></thead>
      <tbody>
      {{#each subjects}}
        <tr><td>{{name}}</td><td style="text-align:center">{{score}}</td><td style="text-align:center"><span class="badge {{level_slug}}">{{level_code}}</span></td><td>{{level_description}}</td></tr>
      {{/each}}
        <tr class="summary"><td>TOTAL SCORE</td><td style="text-align:center">{{summary.total_score}}</td><td colspan="2">Overall Level: {{summary.overall_level_code}} &mdash; {{summary.overall_level_name}}</td></tr>
      </tbody>
    </table>

    <div class="info">
      <div class="cell"><span class="label">Closes: </span>{{term.closing_date}}</div>
      <div class="cell"><span class="label">Opens: </span>{{term.opening_date}}</div>
      <div class="cell"><span class="label">Fee Balance: </span>{{financials.fee_balance}}</div>
      <div class="cell"><span class="label">Next Fee: </span>{{financials.next_term_fee}}</div>
    </div>

    <div class="remarks">
      <div class="card">
        <div class="section-title">Grade Class Teacher&apos;s Remark</div>
        <div class="text">&ldquo;{{remarks.teacher.text}}&rdquo;</div>
        <div class="name"><b>Name: </b>{{remarks.teacher.name}}</div>
        <div class="sig"><span>Sign:</span><span>Date:</span></div>
      </div>
      <div class="card">
        <div class="section-title">Principal&apos;s Remark</div>
        <div class="text">&ldquo;{{remarks.principal.text}}&rdquo;</div>
        <div class="name"><b>Name: </b>{{remarks.principal.name}}</div>
        <div class="sig"><span>Sign:</span><span>Date:</span></div>
      </div>
    </div>
  </div></div>
</body>
</html>`

/**
 * Locates the Puppeteer browser cache. Prefers an explicit env var; otherwise
 * falls back to the project-local cache written by .npmrc. This keeps the
 * browser findable both on local dev machines and inside the Vercel bundle.
 */
function resolvePuppeteerCacheDir(): string {
  const fromEnv = process.env.PUPPETEER_CACHE_DIR || process.env.npm_config_puppeteer_cache_dir
  if (fromEnv) return path.resolve(fromEnv)
  const candidates = [
    path.join(process.cwd(), 'node_modules', '.cache', 'puppeteer'),
    path.join(process.cwd(), '.cache', 'puppeteer'),
  ]
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c
    } catch {
      /* ignore */
    }
  }
  return candidates[0]
}

function wrapDocument(body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>@page{size:A4;margin:12mm}html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:10pt}.e-reports-page-break{page-break-after:always}</style></head><body>${body}</body></html>`
}

function ensureDocument(html: string): string {
  if (/<html[\s>]/i.test(html)) return html
  return wrapDocument(html)
}

/**
 * Compiles a Handlebars template against a report context and returns a
 * standalone HTML document ready for the PDF engine.
 */
export function compileHtmlTemplate(template: string, context: Record<string, unknown>): string {
  const compiled = Handlebars.compile(template, { noEscape: false })
  return ensureDocument(compiled(context))
}

/**
 * Renders one or more compiled Handlebars sections through the headless
 * browser and returns real PDF bytes (%PDF-...). Multiple contexts produce a
 * multi-page PDF with a hard page break between students.
 */
export async function renderHtmlTemplateToPdf(
  templateSource: string,
  contexts: Record<string, unknown>[],
): Promise<Uint8Array> {
  if (!process.env.PUPPETEER_CACHE_DIR) process.env.PUPPETEER_CACHE_DIR = resolvePuppeteerCacheDir()

  const compiled = Handlebars.compile(templateSource, { noEscape: false })
  const sections = contexts.map((ctx) => ensureDocument(compiled(ctx)))
  const body =
    sections.length === 1 ? sections[0] : wrapDocument(sections.join('<div class="e-reports-page-break"></div>'))

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(body, { waitUntil: 'load', timeout: 30000 })
    return await page.pdf({ format: 'A4', printBackground: true })
  } finally {
    await browser.close()
  }
}

/**
 * Convenience wrapper for single-student rendering (the common "view/print one
 * report" case). Returns a Uint8Array of PDF bytes.
 */
export async function renderSingleHtmlTemplateToPdf(templateSource: string, context: Record<string, unknown>): Promise<Uint8Array> {
  return renderHtmlTemplateToPdf(templateSource, [context])
}