import type { GanttConfig, GanttSection, GanttStatus, GanttTask } from '../types'

const TITLE = /^title\s+(.+)$/
const SECTION = /^section\s+(.+)$/
const TASK = /^([^:]+?)\s*:\s*(.+)$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const DURATION = /^(\d+(?:\.\d+)?)([dw])$/
const AFTER = /^after\s+(\S+)$/
// Directives parsed-and-ignored (only YYYY-MM-DD dates are supported).
const SKIP = /^(dateFormat\b|axisFormat\b|excludes\b|todayMarker\b|tickInterval\b|acc(Title|Descr)\s*:)/

const MS_PER_DAY = 86400000

export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / MS_PER_DAY
}

export function isoFromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

export function parseGantt(text: string): GanttConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  if (!/^gantt\b/.test(lines[0] ?? '')) throw new Error('Not a gantt chart')

  let title: string | undefined
  const sections: GanttSection[] = []
  let current: GanttSection = { tasks: [] }
  const closeSection = (): void => {
    if (current.tasks.length > 0) sections.push(current)
  }

  // Resolution state, shared across sections (Mermaid resolves in document order).
  const endOf = new Map<string, number>()
  let prevEnd: number | undefined

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
    if (SKIP.test(line)) continue
    const m = line.match(TASK)
    if (!m) continue // unsupported syntax — ignored

    const name = m[1]
    const parts = m[2].split(',').map((p) => p.trim()).filter((p) => p.length > 0)
    let status: GanttStatus | undefined
    let milestone = false
    let id: string | undefined
    let start: string | undefined
    let end: string | undefined
    let after: string | undefined
    let durationDays: number | undefined
    let sawTiming = false

    for (const part of parts) {
      if (part === 'done' || part === 'active' || part === 'crit') {
        status ??= part
        continue
      }
      if (part === 'milestone') {
        milestone = true
        continue
      }
      const aft = part.match(AFTER)
      if (aft) {
        after ??= aft[1]
        sawTiming = true
        continue
      }
      if (DATE.test(part)) {
        if (start === undefined) start = part
        else end ??= part
        sawTiming = true
        continue
      }
      const dur = part.match(DURATION)
      if (dur) {
        durationDays ??= Number(dur[1]) * (dur[2] === 'w' ? 7 : 1)
        sawTiming = true
        continue
      }
      // First unrecognized token before any timing info is the task id.
      if (id === undefined && !sawTiming) id = part
      // Anything else: ignored.
    }

    // Resolve the start day: explicit date → after-reference → previous task's end.
    let startDay: number | undefined
    if (start !== undefined) startDay = dayNumber(start)
    else if (after !== undefined) startDay = endOf.get(after)
    else startDay = prevEnd
    if (startDay === undefined) continue // unresolvable — skipped (lenient)
    // Fractional durations produce fractional ends; a dependent task starts at
    // the NEXT whole day (ISO dates can't carry fractions, and the renderer
    // re-resolves from the emitted ISO — ceil keeps both resolutions identical
    // and "after" free of overlap).
    startDay = Math.ceil(startDay)

    const duration =
      durationDays ?? (end !== undefined ? Math.max(0, dayNumber(end) - startDay) : milestone ? 0 : 1)

    const task: GanttTask = { name, start: isoFromDay(startDay), durationDays: duration }
    if (id !== undefined) {
      task.id = id
      endOf.set(id, startDay + duration)
    }
    if (status !== undefined) task.status = status
    if (milestone) task.milestone = true
    prevEnd = startDay + duration
    current.tasks.push(task)
  }
  closeSection()

  return { type: 'gantt', ...(title !== undefined ? { title } : {}), sections }
}
