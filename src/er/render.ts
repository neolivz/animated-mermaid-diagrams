import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { endAngle, smoothPath, type Pt } from '../edge-path'
import { graphLayout } from '../graph-layout'
import { highlightColor, resolveOptions } from '../theme'
import { el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type {
  DiagramController,
  ErCardinality,
  ErConfig,
  ErEntity,
  ResolvedOptions,
  ThemeTokens,
} from '../types'

const TITLE_H = 24
const ROW_H = 17
const ROW_FONT = 11.5
const TITLE_FONT = 13
const PAD_X = 10
const COL_GAP = 12
const MIN_W = 120

function columnWidths(e: ErEntity): { typeW: number; nameW: number; keysW: number } {
  let typeW = 0
  let nameW = 0
  let keysW = 0
  for (const a of e.attributes ?? []) {
    typeW = Math.max(typeW, estimateTextWidth(a.type, ROW_FONT))
    nameW = Math.max(nameW, estimateTextWidth(a.name, ROW_FONT))
    if (a.keys?.length) keysW = Math.max(keysW, estimateTextWidth(a.keys.join(','), ROW_FONT))
  }
  return { typeW, nameW, keysW }
}

export function erEntitySize(e: ErEntity): { w: number; h: number } {
  const { typeW, nameW, keysW } = columnWidths(e)
  const rows = e.attributes?.length ?? 0
  const rowsW =
    rows > 0 ? PAD_X + typeW + COL_GAP + nameW + (keysW > 0 ? COL_GAP + keysW : 0) + PAD_X : 0
  const w = Math.max(MIN_W, estimateTextWidth(e.label ?? e.id, TITLE_FONT) + 24, rowsW)
  return { w, h: TITLE_H + rows * ROW_H + (rows > 0 ? 4 : 0) }
}

/** Crow's-foot marker at endpoint `end` (on the entity border), oriented by
 *  `angle` — the direction the path leaves the entity. Glyphs read outward:
 *  foot prongs touch the border, bars/circles sit further along the line. */
export function crowFoot(
  cardinality: ErCardinality,
  end: Pt,
  angle: number,
  t: ThemeTokens,
): SVGGElement {
  const g = el('g', {
    'data-er-marker': cardinality,
    transform: `translate(${end.x},${end.y}) rotate(${angle})`,
  })
  const stroke = { stroke: t.line, 'stroke-width': 1.5, fill: 'none' }
  const many = cardinality === 'one-or-more' || cardinality === 'zero-or-more'
  const zero = cardinality === 'zero-or-one' || cardinality === 'zero-or-more'
  if (many) {
    // Prongs from a point 12px down the line back to the border.
    g.appendChild(el('path', { d: 'M 12 0 L 0 -7 M 12 0 L 0 0 M 12 0 L 0 7', ...stroke }))
  }
  const barX = many ? 16 : 8
  g.appendChild(el('line', { x1: barX, y1: -6, x2: barX, y2: 6, ...stroke }))
  if (cardinality === 'exactly-one') {
    g.appendChild(el('line', { x1: 14, y1: -6, x2: 14, y2: 6, ...stroke }))
  }
  if (zero) {
    g.appendChild(el('circle', { cx: barX + 8, cy: 0, r: 4, ...stroke, fill: t.background }))
  }
  return g
}

function entityBox(e: ErEntity, x: number, y: number, w: number, h: number, t: ThemeTokens): SVGGElement {
  const stroke = highlightColor(e.highlight, t) ?? t.nodeBorder
  const g = el('g', {}, [
    el('rect', {
      x, y, width: w, height: h, rx: 4,
      fill: t.nodeBackground,
      stroke,
      'stroke-width': e.highlight ? 2.5 : 1.5,
    }),
  ])
  g.appendChild(textEl(x + w / 2, y + TITLE_H / 2, e.label ?? e.id, { color: t.text, size: TITLE_FONT, weight: '600' }))
  const attrs = e.attributes ?? []
  if (attrs.length > 0) {
    g.appendChild(el('line', { x1: x, y1: y + TITLE_H, x2: x + w, y2: y + TITLE_H, stroke: t.nodeBorder, 'stroke-width': 1 }))
    const { typeW } = columnWidths(e)
    let rowY = y + TITLE_H + 2
    for (const a of attrs) {
      const cy = rowY + ROW_H / 2
      g.appendChild(textEl(x + PAD_X, cy, a.type, { color: t.textSecondary, size: ROW_FONT, anchor: 'start' }))
      g.appendChild(textEl(x + PAD_X + typeW + COL_GAP, cy, a.name, { color: t.text, size: ROW_FONT, anchor: 'start' }))
      if (a.keys?.length) {
        g.appendChild(textEl(x + w - PAD_X, cy, a.keys.join(','), { color: t.textSecondary, size: ROW_FONT, anchor: 'end' }))
      }
      rowY += ROW_H
    }
  }
  return g
}

export function buildErSvg(
  config: ErConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const entityById = new Map(config.entities.map((e) => [e.id, e]))
  const layout = graphLayout(
    config.entities.map((e) => ({ id: e.id, ...erEntitySize(e) })),
    config.relationships.map((r) => ({
      from: r.from,
      to: r.to,
      ...(r.label ? { labelW: estimateTextWidth(r.label, 12) + 12, labelH: 20 } : {}),
    })),
    'TB',
  )
  const root = el('g')
  const labelLayer = el('g')

  let extraRight = 0

  const edgeTargets: { anim: AnimStep; targetLayer: number; sourceLayer: number }[] = []
  let edgeCursor = 0
  for (const rel of config.relationships) {
    const s = layout.nodes.get(rel.from)
    const e = layout.nodes.get(rel.to)
    if (!s || !e) continue
    const dashed = rel.identifying === false
    const dashAttr: Record<string, string> = dashed ? { 'stroke-dasharray': '6 4' } : {}
    const drawKind = dashed ? ('drawDash' as const) : ('draw' as const)
    const anim: AnimStep = []
    const fromCard = rel.fromCardinality ?? 'exactly-one'
    const toCard = rel.toCardinality ?? 'exactly-one'

    if (rel.from === rel.to) {
      // Self-relationship: loop off the right edge; markers at both stubs.
      const cy = s.y + s.h / 2
      const rx = s.x + s.w
      const path = el('path', {
        d: `M ${rx} ${cy - 8} C ${rx + 40} ${cy - 8}, ${rx + 40} ${cy + 8}, ${rx} ${cy + 8}`,
        fill: 'none', stroke: t.line, 'stroke-width': 2, ...dashAttr,
      })
      root.appendChild(path)
      anim.push({ el: path, kind: drawKind })
      const top = crowFoot(fromCard, { x: rx, y: cy - 8 }, 0, t)
      const bottom = crowFoot(toCard, { x: rx, y: cy + 8 }, 0, t)
      root.appendChild(top)
      root.appendChild(bottom)
      anim.push({ el: top, kind: 'fade' }, { el: bottom, kind: 'fade' })
      extraRight = Math.max(extraRight, rx + 44 - layout.width)
      if (rel.label) {
        const txt = textEl(rx + 48, cy, rel.label, { color: t.textSecondary, size: 12, anchor: 'start' })
        labelLayer.appendChild(txt)
        anim.push({ el: txt, kind: 'fade' })
        extraRight = Math.max(extraRight, rx + 48 + estimateTextWidth(rel.label, 12) + 6 - layout.width)
      }
      edgeTargets.push({ anim, targetLayer: e.layer, sourceLayer: s.layer })
      continue
    }

    const placed = layout.edges[edgeCursor++]
    const pts = placed.points.map((p) => ({ x: p.x, y: p.y }))
    const path = el('path', {
      d: smoothPath(pts),
      fill: 'none', stroke: t.line, 'stroke-width': 2, ...dashAttr,
    })
    root.appendChild(path)
    anim.push({ el: path, kind: drawKind })

    // Markers: from-end oriented along the first segment (leaving the source),
    // to-end oriented back along the last segment (leaving the target).
    const next = pts[1] ?? pts[0]
    const fromAngle = (Math.atan2(next.y - pts[0].y, next.x - pts[0].x) * 180) / Math.PI
    const toAngle = endAngle(pts) + 180
    const mFrom = crowFoot(fromCard, pts[0], fromAngle, t)
    const mTo = crowFoot(toCard, pts[pts.length - 1], toAngle, t)
    root.appendChild(mFrom)
    root.appendChild(mTo)
    anim.push({ el: mFrom, kind: 'fade' }, { el: mTo, kind: 'fade' })

    if (rel.label) {
      const mid = pts[Math.floor(pts.length / 2)]
      const mx = placed.label?.x ?? mid.x
      const my = placed.label?.y ?? mid.y
      const lw = estimateTextWidth(rel.label, 12) + 12
      const g = el('g', {}, [
        el('rect', { x: mx - lw / 2, y: my - 10, width: lw, height: 20, rx: 4, fill: t.background }),
        textEl(mx, my, rel.label, { color: t.textSecondary, size: 12 }),
      ])
      labelLayer.appendChild(g)
      anim.push({ el: g, kind: 'fade' })
    }
    edgeTargets.push({ anim, targetLayer: placed.targetLayer, sourceLayer: placed.sourceLayer })
  }

  const nodeAnim = new Map<string, AnimStep[number]>()
  for (const [id, p] of layout.nodes) {
    const entity = entityById.get(id)
    if (!entity) continue
    const g = entityBox(entity, p.x, p.y, p.w, p.h, t)
    root.appendChild(g)
    nodeAnim.set(id, { el: g, kind: 'scale' })
  }
  root.appendChild(labelLayer)

  const steps: AnimStep[] = []
  for (let layer = 0; layer < layout.layers.length; layer++) {
    if (layer > 0) {
      const into = edgeTargets.filter((e) => e.targetLayer === layer && e.sourceLayer < layer)
      if (into.length > 0) steps.push(into.flatMap((e) => e.anim))
    }
    steps.push(layout.layers[layer].map((id) => nodeAnim.get(id)!).filter(Boolean))
  }
  const backEdges = edgeTargets.filter((e) => e.targetLayer <= e.sourceLayer).flatMap((e) => e.anim)
  if (backEdges.length > 0) steps.push(backEdges)

  const pad = opts.padding
  const w = layout.width + extraRight + pad * 2
  const h = layout.height + pad * 2
  const label = `Entity-relationship diagram with ${config.entities.length} entities (${config.entities
    .map((e) => e.label ?? e.id)
    .join(', ')}) and ${config.relationships.length} relationships`
  const svg = svgRoot(w, h, opts, label)
  root.setAttribute('transform', `translate(${pad},${pad})`)
  svg.appendChild(root)

  return { svg, steps: steps.filter((s) => s.length > 0) }
}

export function erDiagram(container: HTMLElement, config: ErConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildErSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 0)
}
