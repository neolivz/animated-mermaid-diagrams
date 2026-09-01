import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { highlightColor, resolveOptions } from '../theme'
import { el, estimateTextWidth, svgRoot, textEl } from '../svg'
import { dayNumber, isoFromDay } from './parse'
import type {
  DiagramController,
  GanttConfig,
  GanttSection,
  GanttTask,
  ResolvedOptions,
  ThemeTokens,
} from '../types'

const TITLE_H = 34
const SECTION_H = 22
const ROW_H = 26
const BAR_H = 14
const AXIS_H = 26
const LABEL_GAP = 14
const MIN_LABEL_W = 100
const NAME_FONT = 12

export interface GanttRow {
  task: GanttTask
  sectionIndex: number
  startDay: number
  durationDays: number
}

/** Flattens sections into rows with every start resolved to a day number —
 *  the same document-order resolution the parser applies, repeated here so
 *  hand-written configs can use `after`/`end`/implicit starts too. */
export function resolveGanttRows(sections: GanttSection[]): GanttRow[] {
  const rows: GanttRow[] = []
  const endOf = new Map<string, number>()
  let prevEnd: number | undefined
  sections.forEach((section, si) => {
    for (const task of section.tasks ?? []) {
      let startDay: number | undefined
      if (task.start !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(task.start)) startDay = dayNumber(task.start)
      else if (task.after !== undefined) startDay = endOf.get(task.after)
      else startDay = prevEnd
      if (startDay === undefined || !Number.isFinite(startDay)) continue
      // Whole-day starts, matching the parser's resolution exactly (see parse.ts).
      startDay = Math.ceil(startDay)
      const durationDays = Number.isFinite(task.durationDays)
        ? Math.max(0, task.durationDays!)
        : task.end !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(task.end)
          ? Math.max(0, dayNumber(task.end) - startDay)
          : task.milestone
            ? 0
            : 1
      if (task.id !== undefined) endOf.set(task.id, startDay + durationDays)
      prevEnd = startDay + durationDays
      rows.push({ task, sectionIndex: si, startDay, durationDays })
    }
  })
  return rows
}

function barColor(task: GanttTask, t: ThemeTokens): string {
  const hl = highlightColor(task.highlight, t)
  if (hl) return hl
  switch (task.status) {
    case 'done':
      return t.textSecondary
    case 'active':
      return t.highlight
    case 'crit':
      return t.highlightRed
    default:
      return t.line
  }
}

export function buildGanttSvg(
  config: GanttConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const rows = resolveGanttRows(config.sections)
  const titleH = config.title ? TITLE_H : 0

  const labelW = Math.max(
    MIN_LABEL_W,
    rows.reduce((m, r) => Math.max(m, estimateTextWidth(r.task.name, NAME_FONT) + 16), 0),
    config.sections.reduce((m, s) => Math.max(m, estimateTextWidth(s.title ?? '', 12) + 16), 0),
  )

  // Zero resolvable rows still need a finite day range for the axis.
  const minDay = rows.length > 0 ? rows.reduce((m, r) => Math.min(m, r.startDay), Infinity) : 0
  const maxDay = rows.length > 0 ? rows.reduce((m, r) => Math.max(m, r.startDay + r.durationDays), -Infinity) : 1
  const days = Math.max(1, maxDay - minDay)
  const pxPerDay = Math.min(40, Math.max(4, 640 / days))
  const chartW = days * pxPerDay
  const x = (day: number): number => labelW + LABEL_GAP + (day - minDay) * pxPerDay

  // Row geometry: section header band + its rows, top to bottom.
  const sectionsWithRows = config.sections
    .map((section, si) => ({ section, si, rows: rows.filter((r) => r.sectionIndex === si) }))
    .filter((entry) => entry.rows.length > 0)
  let yCursor = titleH + 6
  const sectionBandY = new Map<number, number>()
  const rowY = new Map<GanttRow, number>()
  for (const entry of sectionsWithRows) {
    sectionBandY.set(entry.si, yCursor)
    yCursor += SECTION_H
    for (const r of entry.rows) {
      rowY.set(r, yCursor + ROW_H / 2)
      yCursor += ROW_H
    }
  }
  const axisY = yCursor + 6
  const width = labelW + LABEL_GAP + chartW + 8
  const height = axisY + AXIS_H

  const pad = opts.padding
  const label = `Gantt chart${config.title ? ` "${config.title}"` : ''} with ${rows.length} tasks across ${sectionsWithRows.length} sections`
  const svg = svgRoot(width + pad * 2, height + pad * 2, opts, label)
  const root = el('g', { transform: `translate(${pad},${pad})` })
  svg.appendChild(root)

  const animSteps: AnimStep[] = []

  // Intro: title + axis (baseline, ticks, gridlines) — never empty.
  const intro: AnimStep = []
  if (config.title) {
    const titleText = textEl(width / 2, TITLE_H / 2, config.title, { color: t.text, size: 16, weight: '600' })
    root.appendChild(titleText)
    intro.push({ el: titleText, kind: 'fade' })
  }
  const axisGroup = el('g')
  axisGroup.appendChild(
    el('line', { x1: x(minDay), y1: axisY, x2: x(minDay + days), y2: axisY, stroke: t.noteBorder, 'stroke-width': 1 }),
  )
  if (rows.length > 0) {
    const step = days <= 14 ? 1 : days <= 90 ? 7 : 30
    for (let d = minDay; d <= minDay + days; d += step) {
      axisGroup.appendChild(
        el('line', { x1: x(d), y1: titleH + 6, x2: x(d), y2: axisY, stroke: t.noteBorder, 'stroke-width': 0.5, 'stroke-dasharray': '2 4' }),
      )
      axisGroup.appendChild(
        textEl(x(d), axisY + 12, isoFromDay(d).slice(5), { color: t.textSecondary, size: 10 }),
      )
    }
  }
  root.appendChild(axisGroup)
  intro.push({ el: axisGroup, kind: 'fade' })
  animSteps.push(intro)

  const stepGroups: AnimStep[] = rows.map(() => [])

  // Section band chrome reveals with its section's first task.
  for (const entry of sectionsWithRows) {
    const bandY = sectionBandY.get(entry.si)!
    const g = el('g', {}, [
      el('rect', {
        x: 0,
        y: bandY + 2,
        width,
        height: SECTION_H - 4,
        rx: 4,
        fill: t.noteBackground,
        stroke: t.noteBorder,
      }),
    ])
    if (entry.section.title) {
      g.appendChild(
        textEl(8, bandY + SECTION_H / 2, entry.section.title, {
          color: t.textSecondary,
          size: 12,
          weight: '600',
          anchor: 'start',
        }),
      )
    }
    root.appendChild(g)
    stepGroups[rows.indexOf(entry.rows[0])].unshift({ el: g, kind: 'fade' })
  }

  rows.forEach((r, i) => {
    const group = stepGroups[i]
    const y = rowY.get(r)!
    const color = barColor(r.task, t)

    const name = textEl(labelW - 8, y, r.task.name, { color: t.text, size: NAME_FONT, anchor: 'end' })
    root.appendChild(name)
    group.push({ el: name, kind: 'fade' })

    if (r.task.milestone) {
      const mx = x(r.startDay)
      const d = BAR_H / 2 + 2
      const diamond = el('polygon', {
        points: `${mx},${y - d} ${mx + d},${y} ${mx},${y + d} ${mx - d},${y}`,
        fill: color,
      })
      root.appendChild(diamond)
      group.push({ el: diamond, kind: 'scale' })
    } else {
      // A path (not a rect) so the 'draw' animation grows the bar in time order.
      const x0 = x(r.startDay)
      const x1 = Math.max(x0 + 2, x(r.startDay + r.durationDays))
      const bar = el('path', {
        d: `M ${x0} ${y} L ${x1} ${y}`,
        stroke: color,
        'stroke-width': BAR_H,
        fill: 'none',
        'stroke-opacity': r.task.status === 'done' ? 0.55 : 1,
      })
      root.appendChild(bar)
      group.push({ el: bar, kind: 'draw' })
    }
  })
  animSteps.push(...stepGroups)

  return { svg, steps: animSteps }
}

export function gantt(container: HTMLElement, config: GanttConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildGanttSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 1)
}
