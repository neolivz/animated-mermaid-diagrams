import type { SankeyConfig, SankeyLink } from '../types'

/** Split one CSV line into fields; double-quoted fields may contain commas,
 *  and `""` inside quotes is an escaped quote. */
function splitCsv(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') inQuotes = false
      else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      fields.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  fields.push(cur.trim())
  return fields
}

export function parseSankey(text: string): SankeyConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  if (!/^sankey(-beta)?\b/.test(lines[0] ?? '')) throw new Error('Not a sankey diagram')

  const links: SankeyLink[] = []
  for (const line of lines.slice(1)) {
    const fields = splitCsv(line)
    if (fields.length < 3) continue // malformed — ignored
    const n = Number(fields[2])
    links.push({
      source: fields[0],
      target: fields[1],
      value: Number.isFinite(n) && n > 0 ? n : 0,
    })
  }
  return { type: 'sankey', links }
}
