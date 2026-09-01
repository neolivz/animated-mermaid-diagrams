import type { PieConfig, PieSlice } from '../types'

const TITLE = /^title\s+(.+)$/
const SLICE = /^"([^"]+)"\s*:\s*(\S+)$/

export function parsePie(text: string): PieConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  const header = lines[0] ?? ''
  if (!/^pie\b/.test(header)) throw new Error('Not a pie chart')
  const showData = /\bshowData\b/.test(header)

  let title: string | undefined
  const slices: PieSlice[] = []
  for (const line of lines.slice(1)) {
    const t = line.match(TITLE)
    if (t) {
      title = t[1]
      continue
    }
    const s = line.match(SLICE)
    if (s) {
      const n = Number(s[2])
      slices.push({ label: s[1], value: Number.isFinite(n) && n > 0 ? n : 0 })
      continue
    }
    // accTitle/accDescr and anything else unsupported — silently ignored.
  }

  return {
    type: 'pie',
    ...(title !== undefined ? { title } : {}),
    ...(showData ? { showData: true } : {}),
    slices,
  }
}
