import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { highlightColor, resolveOptions } from '../theme'
import { el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type { DiagramController, PieConfig, ResolvedOptions } from '../types'

/** Categorical slice palette — mid-tone hues legible on both built-in themes.
 *  Cycles for charts with more than 8 slices. Not theme-customizable in v1. */
export const PALETTE = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#f97316', // orange
  '#64748b', // slate
]

const R = 110
const TITLE_H = 34
const LEGEND_ROW_H = 22
const LEGEND_GAP = 36
const SWATCH = 12
const LABEL_FONT = 12.5
// Slices smaller than this get no in-slice percentage label (no room).
const MIN_PCT_LABEL = 0.08

interface ArcBox {
  /** start angle in radians, from 12 o'clock, clockwise */
  a0: number
  a1: number
  frac: number
}

export function buildPieSvg(
  config: PieConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const values = config.slices.map((s) => (Number.isFinite(s.value) && s.value > 0 ? s.value : 0))
  const total = values.reduce((a, b) => a + b, 0)

  const legendW = config.slices.reduce((m, s, i) => {
    const text = config.showData ? `${s.label} — ${values[i]}` : s.label
    return Math.max(m, SWATCH + 8 + estimateTextWidth(text, LABEL_FONT))
  }, 0)
  const titleH = config.title ? TITLE_H : 0
  const pieW = R * 2
  const legendH = config.slices.length * LEGEND_ROW_H
  const width = pieW + LEGEND_GAP + legendW
  const height = titleH + Math.max(pieW, legendH) + 8
  const cx = R
  const cy = titleH + Math.max(R, legendH / 2) + 4

  const pad = opts.padding
  const label = `Pie chart${config.title ? ` "${config.title}"` : ''} with ${config.slices.length} slices (${config.slices
    .map((s) => s.label)
    .join(', ')})`
  const svg = svgRoot(width + pad * 2, height + pad * 2, opts, label)
  const root = el('g', { transform: `translate(${pad},${pad})` })
  svg.appendChild(root)

  const animSteps: AnimStep[] = []

  // Intro: title, or (untitled) the pie's outline ring so the step is never empty.
  const intro: AnimStep = []
  if (config.title) {
    const titleText = textEl(width / 2, TITLE_H / 2, config.title, { color: t.text, size: 16, weight: '600' })
    root.appendChild(titleText)
    intro.push({ el: titleText, kind: 'fade' })
  } else {
    const ring = el('circle', { cx, cy, r: R, fill: 'none', stroke: t.noteBorder, 'stroke-width': 1 })
    root.appendChild(ring)
    intro.push({ el: ring, kind: 'fade' })
  }
  animSteps.push(intro)

  // Arc geometry: from 12 o'clock, clockwise, document order (Mermaid's order).
  const arcs: ArcBox[] = []
  let acc = 0
  for (const v of values) {
    const frac = total > 0 ? v / total : 0
    arcs.push({ a0: (acc / (total || 1)) * 2 * Math.PI, a1: ((acc + v) / (total || 1)) * 2 * Math.PI, frac })
    acc += v
  }
  const point = (angle: number): { x: number; y: number } => ({
    x: cx + R * Math.sin(angle),
    y: cy - R * Math.cos(angle),
  })

  config.slices.forEach((slice, i) => {
    const group: AnimStep = []
    // Shift each palette cycle by one so slice 8 doesn't repeat slice 0's
    // color right next to it at 12 o'clock.
    const color = PALETTE[(i + Math.floor(i / PALETTE.length)) % PALETTE.length]
    const arc = arcs[i]
    const stroke = highlightColor(slice.highlight, t)

    // Slices below ~a millionth of the circle would draw with coincident arc
    // endpoints — per the SVG spec the arc is dropped and only a radius seam
    // would render. They keep their legend row but draw no arc.
    if (arc.frac > 1e-6) {
      const g = el('g')
      if (arc.frac >= 1) {
        // A single 100% slice: arc endpoints coincide, so draw a circle.
        g.appendChild(
          el('circle', {
            cx, cy, r: R, fill: color,
            stroke: stroke ?? t.background,
            'stroke-width': stroke ? 3 : 1.5,
          }),
        )
      } else {
        const p0 = point(arc.a0)
        const p1 = point(arc.a1)
        const largeArc = arc.a1 - arc.a0 > Math.PI ? 1 : 0
        g.appendChild(
          el('path', {
            d: `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${R} ${R} 0 ${largeArc} 1 ${p1.x} ${p1.y} Z`,
            fill: color,
            stroke: stroke ?? t.background,
            'stroke-width': stroke ? 3 : 1.5,
          }),
        )
      }
      if (arc.frac >= MIN_PCT_LABEL) {
        const mid = (arc.a0 + arc.a1) / 2
        const lx = cx + R * 0.62 * Math.sin(mid)
        const ly = cy - R * 0.62 * Math.cos(mid)
        g.appendChild(
          textEl(lx, ly, `${Math.round(arc.frac * 100)}%`, { color: t.background, size: 12, weight: '600' }),
        )
      }
      root.appendChild(g)
      group.push({ el: g, kind: 'fade' })
    }

    const rowY = titleH + 8 + i * LEGEND_ROW_H
    const legendText = config.showData ? `${slice.label} — ${values[i]}` : slice.label
    const row = el('g', {}, [
      el('rect', { x: pieW + LEGEND_GAP, y: rowY, width: SWATCH, height: SWATCH, rx: 3, fill: color }),
      textEl(pieW + LEGEND_GAP + SWATCH + 8, rowY + SWATCH / 2, legendText, {
        color: t.text,
        size: LABEL_FONT,
        anchor: 'start',
      }),
    ])
    root.appendChild(row)
    group.push({ el: row, kind: 'fade' })

    animSteps.push(group)
  })

  return { svg, steps: animSteps }
}

export function pie(container: HTMLElement, config: PieConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildPieSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 1)
}
