import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { highlightColor, resolveOptions } from '../theme'
import { el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type {
  DiagramController,
  ResolvedOptions,
  TimelineConfig,
  TimelinePeriod,
  TimelineSection,
} from '../types'

export const TITLE_H = 34
export const BAND_H = 22
export const BAND_GAP = 10
export const PERIOD_H = 30
export const CONNECT_H = 12
export const EVENT_H = 26
export const EVENT_GAP = 6
export const MIN_COL_W = 90
export const SECTION_GAP = 12

const LABEL_FONT = 13
const EVENT_FONT = 12

interface PeriodBox {
  period: TimelinePeriod
  x: number
  colW: number
  sectionIndex: number
}

interface SectionBox {
  section: TimelineSection
  x1: number
  x2: number
}

export interface TimelineLayout {
  width: number
  height: number
  hasTitle: boolean
  bandY: number
  /** y of the horizontal spine; period boxes center on it */
  spineY: number
  sections: SectionBox[]
  periods: PeriodBox[]
}

export function layoutTimeline(config: TimelineConfig): TimelineLayout {
  const hasTitle = config.title !== undefined
  const bandY = hasTitle ? TITLE_H : 0
  const spineY = bandY + BAND_H + BAND_GAP + PERIOD_H / 2

  const sections: SectionBox[] = []
  const periods: PeriodBox[] = []
  let cursor = 0
  let maxEvents = 0
  config.sections.forEach((section, si) => {
    if (si > 0) cursor += SECTION_GAP
    const x1 = cursor
    // Hand-written configs may carry empty (or shape-mismatched) sections the
    // parser would have dropped — treat missing/empty period lists as empty.
    for (const period of section.periods ?? []) {
      const labelW = estimateTextWidth(period.label, LABEL_FONT) + 28
      const eventW = period.events.reduce(
        (m, e) => Math.max(m, estimateTextWidth(e, EVENT_FONT) + 20),
        0,
      )
      const colW = Math.max(MIN_COL_W, labelW, eventW)
      periods.push({ period, x: cursor + colW / 2, colW, sectionIndex: si })
      maxEvents = Math.max(maxEvents, period.events.length)
      cursor += colW
    }
    sections.push({ section, x1, x2: cursor })
  })

  const stackH = maxEvents > 0 ? CONNECT_H + maxEvents * (EVENT_H + EVENT_GAP) : 0
  return {
    width: cursor,
    height: spineY + PERIOD_H / 2 + stackH + 10,
    hasTitle,
    bandY,
    spineY,
    sections,
    periods,
  }
}

export function buildTimelineSvg(
  config: TimelineConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const L = layoutTimeline(config)
  const pad = opts.padding
  const w = L.width + pad * 2
  const h = L.height + pad * 2
  const label = `Timeline${config.title ? ` "${config.title}"` : ''} with ${L.periods.length} periods across ${L.sections.length} sections`
  const svg = svgRoot(w, h, opts, label)
  const root = el('g', { transform: `translate(${pad},${pad})` })
  svg.appendChild(root)

  const animSteps: AnimStep[] = []

  // Intro: title (when present) + the spine, so the intro step always has
  // content and the step-index offset stays 1 for every config.
  const intro: AnimStep = []
  if (config.title) {
    const titleText = textEl(L.width / 2, TITLE_H / 2, config.title, {
      color: t.text,
      size: 16,
      weight: '600',
    })
    root.appendChild(titleText)
    intro.push({ el: titleText, kind: 'fade' })
  }
  const spine = el('line', {
    x1: 0,
    y1: L.spineY,
    x2: L.width,
    y2: L.spineY,
    stroke: t.line,
    'stroke-width': 2,
  })
  root.appendChild(spine)
  intro.push({ el: spine, kind: 'draw' })
  animSteps.push(intro)

  const stepGroups: AnimStep[] = L.periods.map(() => [])

  // Section band chrome reveals with its section's first period.
  let periodIndex = 0
  for (const box of L.sections) {
    const firstPeriodIndex = periodIndex
    const count = (box.section.periods ?? []).length
    periodIndex += count
    // An empty section has no step to attach its band to (and a zero-width
    // band anyway) — skip it rather than indexing past stepGroups.
    if (count === 0) continue
    const g = el('g')
    g.appendChild(
      el('rect', {
        x: box.x1,
        y: L.bandY,
        width: box.x2 - box.x1,
        height: BAND_H,
        rx: 4,
        fill: t.noteBackground,
        stroke: t.noteBorder,
      }),
    )
    if (box.section.title) {
      g.appendChild(
        textEl((box.x1 + box.x2) / 2, L.bandY + BAND_H / 2, box.section.title, {
          color: t.textSecondary,
          size: 11,
          weight: '600',
        }),
      )
    }
    root.appendChild(g)
    stepGroups[firstPeriodIndex].unshift({ el: g, kind: 'fade' })
  }

  L.periods.forEach((box, i) => {
    const group = stepGroups[i]
    const boxW = box.colW - 10
    const stroke = highlightColor(box.period.highlight, t) ?? t.nodeBorder

    const periodG = el('g', {}, [
      el('rect', {
        x: box.x - boxW / 2,
        y: L.spineY - PERIOD_H / 2,
        width: boxW,
        height: PERIOD_H,
        rx: 6,
        fill: t.nodeBackground,
        stroke,
        'stroke-width': 1.5,
      }),
      textEl(box.x, L.spineY, box.period.label, { color: t.text, size: LABEL_FONT, weight: '600' }),
    ])
    root.appendChild(periodG)
    group.push({ el: periodG, kind: 'scale' })

    if (box.period.events.length > 0) {
      const connectTop = L.spineY + PERIOD_H / 2
      const connector = el('line', {
        x1: box.x,
        y1: connectTop,
        x2: box.x,
        y2: connectTop + CONNECT_H,
        stroke: t.lifeline,
        'stroke-width': 1.5,
      })
      root.appendChild(connector)
      group.push({ el: connector, kind: 'draw' })

      box.period.events.forEach((event, ei) => {
        const y = connectTop + CONNECT_H + ei * (EVENT_H + EVENT_GAP)
        const eg = el('g', {}, [
          el('rect', {
            x: box.x - (box.colW - 16) / 2,
            y,
            width: box.colW - 16,
            height: EVENT_H,
            rx: 4,
            fill: t.noteBackground,
            stroke: t.noteBorder,
          }),
          textEl(box.x, y + EVENT_H / 2, event, { color: t.textSecondary, size: EVENT_FONT }),
        ])
        root.appendChild(eg)
        group.push({ el: eg, kind: 'fade' })
      })
    }
  })
  animSteps.push(...stepGroups)

  return { svg, steps: animSteps }
}

export function timeline(container: HTMLElement, config: TimelineConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildTimelineSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 1)
}
