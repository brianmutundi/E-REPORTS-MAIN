// Minimal RFC-4180-ish CSV parser/generator. No external dependency is
// used for this since the only requirement is comma-separated files with
// optional quoting — pulling in a library for that would be overkill.

export type CsvRow = string[]

export function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // Normalize line endings up front so \r\n and \r behave like \n.
  const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"') { inQuotes = true; continue }
    if (char === ',') { row.push(field); field = ''; continue }
    if (char === '\n') {
      row.push(field); field = ''
      rows.push(row); row = []
      continue
    }
    field += char
  }
  // Flush trailing field/row (handles files without a final newline).
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  // Drop fully blank trailing rows produced by trailing newlines.
  while (rows.length && rows[rows.length - 1].every(cell => cell.trim() === '')) rows.pop()
  return rows
}

export function toCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map(row => row.map(cell => toCsvField(cell === null || cell === undefined ? '' : String(cell))).join(',')).join('\n')
}

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
