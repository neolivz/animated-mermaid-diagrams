import type { TimelineConfig, TimelinePeriod, TimelineSection } from '../types'

const TITLE = /^title\s+(.+)$/
const SECTION = /^section\s+(.+)$/

export function parseTimeline(text: string): TimelineConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  if (!/^timeline\b/.test(lines[0] ?? '')) throw new Error('Not a timeline diagram')

  let title: string | undefined
  const sections: TimelineSection[] = []
  let current: TimelineSection = { periods: [] }
  let lastPeriod: TimelinePeriod | undefined

  const closeSection = (): void => {
    if (current.periods.length > 0) sections.push(current)
  }

  for (const line of lines.slice(1)) {
    const t = line.match(TITLE)
    if (t) {
      title = t[1]
      continue
    }
    const s = line.match(SECTION)
    if (s) {
      closeSection()
      current = { title: s[1], periods: [] }
      lastPeriod = undefined
      continue
    }
    // Bare keywords and accessibility directives must not become periods.
    if (/^(title|section)$/.test(line) || /^acc(Title|Descr)\s*:/.test(line)) continue
    const parts = line.split(':').map((p) => p.trim())
    if (parts[0] === '') {
      // Continuation line (`: event : event`): events append to the previous
      // period; with no period open the events have no home and are dropped.
      const events = parts.slice(1).filter((e) => e.length > 0)
      lastPeriod?.events.push(...events)
      continue
    }
    lastPeriod = { label: parts[0], events: parts.slice(1).filter((e) => e.length > 0) }
    current.periods.push(lastPeriod)
  }
  closeSection()

  return { type: 'timeline', ...(title !== undefined ? { title } : {}), sections }
}
