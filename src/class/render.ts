import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { endAngle, smoothPath, trimEnd, type Pt } from '../edge-path'
import { graphLayout } from '../graph-layout'
import { highlightColor, resolveOptions } from '../theme'
import { arrowHead, el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type {
  ClassConfig,
  ClassNode,
  ClassRelationType,
  DiagramController,
  ResolvedOptions,
  ThemeTokens,
} from '../types'

const TITLE_H = 26
const ANNOTATION_H = 15
const ROW_H = 17
const ROW_FONT = 11.5
const TITLE_FONT = 13
const PAD_X = 12
const MIN_W = 110

export function classNodeSize(cls: ClassNode): { w: number; h: number } {
  const label = cls.label ?? cls.id
  const rows = [...(cls.attributes ?? []), ...(cls.methods ?? [])]
  const rowW = rows.reduce((m, r) => Math.max(m, estimateTextWidth(r, ROW_FONT)), 0)
  const annW = cls.annotation ? estimateTextWidth(cls.annotation, 11) : 0
  const w = Math.max(MIN_W, estimateTextWidth(label, TITLE_FONT) + PAD_X * 2 + 8, rowW + PAD_X * 2, annW + PAD_X * 2)
  const headerH = TITLE_H + (cls.annotation ? ANNOTATION_H : 0)
  const attrsH = (cls.attributes?.length ?? 0) * ROW_H
  const methodsH = (cls.methods?.length ?? 0) * ROW_H
  const bodyH = attrsH + methodsH
  return { w, h: headerH + bodyH + (bodyH > 0 ? 8 : 0) }
}

// End-marker length each relation type trims its line by.
const MARKER_LEN: Record<ClassRelationType, number> = {
  inheritance: 14,
  realization: 14,
  composition: 16,
  aggregation: 16,
  association: 10,
  dependency: 10,
  link: 0,
}

/** Marker at the path tip, pointing along `angle` (degrees). */
function relationMarker(
  type: ClassRelationType,
  tip: Pt,
  angle: number,
  t: ThemeTokens,
): SVGElement | undefined {
  const transform = `translate(${tip.x},${tip.y}) rotate(${angle})`
  switch (type) {
    case 'inheritance':
    case 'realization':
      return el('polygon', {
        points: '0,0 -14,-7 -14,7',
        fill: t.background,
        stroke: t.line,
        'stroke-width': 1.5,
        transform,
      })
    case 'composition':
    case 'aggregation':
      return el('path', {
        d: 'M 0 0 L -8 -5.5 L -16 0 L -8 5.5 Z',
        fill: type === 'composition' ? t.line : t.background,
        stroke: t.line,
        'stroke-width': 1.5,
        transform,
      })
    case 'association':
    case 'dependency':
      return arrowHead(tip.x, tip.y, angle, t.line)
    case 'link':
      return undefined
  }
}

/** Cardinality label position: `dist` along the segment from the endpoint
 *  toward the path interior, offset perpendicular so it clears the line. */
function cardinalityPos(end: Pt, inward: Pt, dist: number): Pt {
  const dx = inward.x - end.x
  const dy = inward.y - end.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  return { x: end.x + ux * dist - uy * 10, y: end.y + uy * dist + ux * 10 }
}

function classBox(cls: ClassNode, x: number, y: number, w: number, h: number, t: ThemeTokens): SVGGElement {
  const stroke = highlightColor(cls.highlight, t) ?? t.nodeBorder
  const g = el('g', {}, [
    el('rect', {
      x, y, width: w, height: h, rx: 4,
      fill: t.nodeBackground,
      stroke,
      'stroke-width': cls.highlight ? 2.5 : 1.5,
    }),
  ])
  const headerH = TITLE_H + (cls.annotation ? ANNOTATION_H : 0)
  let ty = y + TITLE_H / 2 + (cls.annotation ? 2 : 0)
  if (cls.annotation) {
    g.appendChild(textEl(x + w / 2, y + 11, cls.annotation, { color: t.textSecondary, size: 11 }))
    ty = y + ANNOTATION_H + TITLE_H / 2 - 4
  }
  g.appendChild(textEl(x + w / 2, ty, cls.label ?? cls.id, { color: t.text, size: TITLE_FONT, weight: '600' }))

  const attrs = cls.attributes ?? []
  const methods = cls.methods ?? []
  let rowY = y + headerH
  if (attrs.length > 0 || methods.length > 0) {
    g.appendChild(el('line', { x1: x, y1: rowY, x2: x + w, y2: rowY, stroke: t.nodeBorder, 'stroke-width': 1 }))
  }
  rowY += 4
  for (const a of attrs) {
    g.appendChild(textEl(x + PAD_X, rowY + ROW_H / 2, a, { color: t.text, size: ROW_FONT, anchor: 'start' }))
    rowY += ROW_H
  }
  if (attrs.length > 0 && methods.length > 0) {
    g.appendChild(el('line', { x1: x, y1: rowY, x2: x + w, y2: rowY, stroke: t.nodeBorder, 'stroke-width': 1 }))
  }
  for (const m of methods) {
    g.appendChild(textEl(x + PAD_X, rowY + ROW_H / 2, m, { color: t.text, size: ROW_FONT, anchor: 'start' }))
    rowY += ROW_H
  }
  return g
}

export function buildClassSvg(
  config: ClassConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const direction = config.direction ?? 'TB'
  const classById = new Map(config.classes.map((k) => [k.id, k]))
  // Mermaid's layout convention ranks the parent/whole ABOVE the child/part,
  // but these relations point child→parent (marker at `to`). Feed dagre the
  // reversed edge for ranking, then flip the returned waypoints back so the
  // marker still lands at the `to` end.
  const rankReversed = (type: ClassRelationType): boolean =>
    type === 'inheritance' || type === 'realization' || type === 'composition' || type === 'aggregation'
  const layout = graphLayout(
    config.classes.map((k) => ({ id: k.id, ...classNodeSize(k) })),
    config.relations.map((r) => {
      const reversed = rankReversed(r.type ?? 'association')
      return {
        from: reversed ? r.to : r.from,
        to: reversed ? r.from : r.to,
        ...(r.label ? { labelW: estimateTextWidth(r.label, 12) + 12, labelH: 20 } : {}),
      }
    }),
    direction,
  )
  const root = el('g')
  const labelLayer = el('g')

  let extraRight = 0
  let extraBottom = 0

  const edgeTargets: { anim: AnimStep; targetLayer: number; sourceLayer: number }[] = []
  let edgeCursor = 0
  for (const rel of config.relations) {
    const s = layout.nodes.get(rel.from)
    const e = layout.nodes.get(rel.to)
    if (!s || !e) continue
    const type = rel.type ?? 'association'
    const dashed = rel.dashed || type === 'dependency' || type === 'realization'
    const dashAttr: Record<string, string> = dashed ? { 'stroke-dasharray': '6 4' } : {}
    const drawKind = dashed ? ('drawDash' as const) : ('draw' as const)
    const anim: AnimStep = []

    if (rel.from === rel.to) {
      // Self-relation: loop off the right edge of the box.
      const cy = s.y + s.h / 2
      const rx = s.x + s.w
      const path = el('path', {
        d: `M ${rx} ${cy - 8} C ${rx + 36} ${cy - 8}, ${rx + 36} ${cy + 8}, ${rx + 12} ${cy + 8}`,
        fill: 'none', stroke: t.line, 'stroke-width': 2, ...dashAttr,
      })
      root.appendChild(path)
      anim.push({ el: path, kind: drawKind })
      const marker = relationMarker(type, { x: rx + 2, y: cy + 8 }, 180, t)
      if (marker) {
        root.appendChild(marker)
        anim.push({ el: marker, kind: 'fade' })
      }
      extraRight = Math.max(extraRight, rx + 40 - layout.width)
      if (rel.label) {
        const txt = textEl(rx + 44, cy, rel.label, { color: t.textSecondary, size: 12, anchor: 'start' })
        labelLayer.appendChild(txt)
        anim.push({ el: txt, kind: 'fade' })
        extraRight = Math.max(extraRight, rx + 44 + estimateTextWidth(rel.label, 12) + 6 - layout.width)
      }
      edgeTargets.push({ anim, targetLayer: e.layer, sourceLayer: s.layer })
      continue
    }

    const placed = layout.edges[edgeCursor++]
    const reversed = rankReversed(type)
    // Reversed relations keep dagre's parent→child point order so the draw
    // animation grows OUT of the already-visible parent; the marker then sits
    // at the path START (the parent = rel.to), pointing back outward.
    const pts = placed.points.map((p) => ({ x: p.x, y: p.y }))
    const tip = reversed ? pts[0] : pts[pts.length - 1]
    const angle = reversed
      ? endAngle([pts[1] ?? pts[0], pts[0]])
      : endAngle(pts)
    const pathPts = reversed
      ? trimEnd([...pts].reverse(), MARKER_LEN[type]).reverse()
      : trimEnd(pts, MARKER_LEN[type])

    const path = el('path', {
      d: smoothPath(pathPts),
      fill: 'none', stroke: t.line, 'stroke-width': 2, ...dashAttr,
    })
    root.appendChild(path)
    anim.push({ el: path, kind: drawKind })
    const marker = relationMarker(type, tip, angle, t)
    if (marker) {
      root.appendChild(marker)
      anim.push({ el: marker, kind: 'fade' })
    }
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
    const fromEnd = reversed ? pts[pts.length - 1] : pts[0]
    const fromInward = (reversed ? pts[pts.length - 2] : pts[1]) ?? fromEnd
    const toInward = (reversed ? pts[1] : pts[pts.length - 2]) ?? tip
    if (rel.fromCardinality) {
      const p = cardinalityPos(fromEnd, fromInward, 16)
      const txt = textEl(p.x, p.y, rel.fromCardinality, { color: t.textSecondary, size: 11 })
      labelLayer.appendChild(txt)
      anim.push({ el: txt, kind: 'fade' })
    }
    if (rel.toCardinality) {
      const p = cardinalityPos(tip, toInward, 16 + MARKER_LEN[type])
      const txt = textEl(p.x, p.y, rel.toCardinality, { color: t.textSecondary, size: 11 })
      labelLayer.appendChild(txt)
      anim.push({ el: txt, kind: 'fade' })
    }
    edgeTargets.push({ anim, targetLayer: placed.targetLayer, sourceLayer: placed.sourceLayer })
  }

  // Class boxes on top of relation lines.
  const nodeAnim = new Map<string, AnimStep[number]>()
  for (const [id, p] of layout.nodes) {
    const cls = classById.get(id)
    if (!cls) continue
    const g = classBox(cls, p.x, p.y, p.w, p.h, t)
    root.appendChild(g)
    nodeAnim.set(id, { el: g, kind: 'scale' })
  }
  root.appendChild(labelLayer)

  // Interleave: layer 0 boxes, edges into layer 1, layer 1 boxes, …;
  // back/self edges last — same structure as the flowchart's auto mode.
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
  const h = layout.height + extraBottom + pad * 2
  const label = `Class diagram with ${config.classes.length} classes (${config.classes
    .map((k) => k.label ?? k.id)
    .join(', ')}) and ${config.relations.length} relations`
  const svg = svgRoot(w, h, opts, label)
  root.setAttribute('transform', `translate(${pad},${pad})`)
  svg.appendChild(root)

  return { svg, steps: steps.filter((s) => s.length > 0) }
}

export function classDiagram(container: HTMLElement, config: ClassConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildClassSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 0)
}
