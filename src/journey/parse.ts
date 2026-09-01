import type { JourneyConfig, JourneySection, JourneyTask } from '../types'

const TITLE = /^title\s+(.+)$/
const SECTION = /^section\s+(.+)$/
// `Name : score : Actor1, Actor2` — name is anything up to the first colon,
// so scores/actors can't be absorbed into it; both trailing parts optional.
const TASK = /^([^:]+?)\s*:\s*([^:]*?)(?:\s*:\s*(.+))?$/

function parseScore(raw: string): number {
  const trimmed = raw.trim()
  // Empty and non-numeric both mean "unscored": Mermaid's scale midpoint.
  // (Number('') is 0, so the empty check must come before the NaN one.)
  if (trimmed === '') return 4
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return 4
  return Math.min(7, Math.max(1, n))
}

export function parseJourney(text: string): JourneyConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  if (!/^journey\b/.test(lines[0] ?? '')) throw new Error('Not a journey diagram')

  let title: string | undefined
  const sections: JourneySection[] = []
  let current: JourneySection = { tasks: [] }

  const closeSection = (): void => {
    if (current.tasks.length > 0) sections.push(current)
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
      current = { title: s[1], tasks: [] }
      continue
    }
    // Accessibility directives would otherwise match the task pattern.
    if (/^acc(Title|Descr)\s*:/.test(line)) continue
    const task = line.match(TASK)
    if (task) {
      const entry: JourneyTask = { name: task[1], score: parseScore(task[2]) }
      if (task[3] !== undefined) {
        const actors = task[3].split(',').map((a) => a.trim()).filter((a) => a.length > 0)
        if (actors.length > 0) entry.actors = actors
      }
      current.tasks.push(entry)
      continue
    }
    // Anything else is unsupported syntax — silently ignored, like the other parsers.
  }
  closeSection()

  return { type: 'journey', ...(title !== undefined ? { title } : {}), sections }
}
