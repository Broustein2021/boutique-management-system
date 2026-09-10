export const CSV_SEP = ';'

export function escapeCSV(value: string | number): string {
  const text = String(value)
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildCSV(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(escapeCSV).join(CSV_SEP)).join('\r\n')
}

export type ParsedRow = Array<string | number>

export function parseCSV(text: string, sep = CSV_SEP): ParsedRow[] {
  const rows: ParsedRow[] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === sep) {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''))
}

export function detectSeparator(text: string): string {
  const sample = text.slice(0, 4000)
  return (sample.match(/;/g)?.length ?? 0) >= (sample.match(/,/g)?.length ?? 0) ? ';' : ','
}

export function toNumber(value: string | number): number {
  if (typeof value === 'number') return value
  const cleaned = String(value).trim().replace(/\s/g, '').replace(',', '.')
  return Number(cleaned)
}