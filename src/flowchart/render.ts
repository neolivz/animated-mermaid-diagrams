import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { graphLayout, type PlacedNode } from '../graph-layout'
import { resolveOptions } from '../theme'
import { arrowHead, el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type {
  DiagramController,
  FlowchartConfig,
  FlowNode,
  ResolvedOptions,
  ThemeTokens,
} from '../types'

interface Pt {
  x: number
  y: number
}

function nodeSize(n: FlowNode): { w: number; h: number } {
  const tw = estimateTextWidth(n.text)
  switch (n.shape ?? 'rounded') {
    case 'diamond':
      return { w: tw + 64, h: 54 }
    case 'circle': {
      const d = Math.max(tw + 24, 56)
      return { w: d, h: d }
    }
    default:
      return { w: Math.max(tw + 32, 64), h: 38 }
  }
}

function nodeShape(n: FlowNode, p: PlacedNode, t: ThemeTokens): SVGElement {
  const stroke = n.highlight ? t.highlight : t.nodeBorder
  const common = {
    fill: t.nodeBackground,
    stroke,
    'stroke-width': n.highlight ? 2.5 : 1.5,
  }
  const cx = p.x + p.w / 2
  const cy = p.y + p.h / 2
  switch (n.shape ?? 'rounded') {
    case 'diamond':
      return el('polygon', {
        points: `${cx},${p.y} ${p.x + p.w},${cy} ${cx},${p.y + p.h} ${p.x},${cy}`,
        ...common,
      })
    case 'circle':
      return el('circle', { cx, cy, r: p.w / 2, ...common })
    case 'stadium':
      return el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, rx: p.h / 2, ...common })
    case 'rect':
      return el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, rx: 0, ...common })
    default:
      return el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, rx: 8, ...common })
  }
}

// dagre clips edge endpoints to each node's bounding RECTANGLE. Diamond and
// circle shapes need a second clip against their real border: cast a ray
// from the shape's center through the adjacent waypoint and find where it
// crosses the shape.
function intersectDiamond(center: Pt, w: number, h: number, from: Pt): Pt {
  const dx = from.x - center.x
  const dy = from.y - center.y
  const r = Math.abs(dx) / (w / 2) + Math.abs(dy) / (h / 2)
  if (r === 0) return { x: center.x, y: center.y }
  const t = 1 / r
  return { x: center.x + dx * t, y: center.y + dy * t }
}

function intersectCircle(center: Pt, r: number, from: Pt): Pt {
  const dx = from.x - center.x
  const dy = from.y - center.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return { x: center.x, y: center.y }
  const t = r / dist
  return { x: center.x + dx * t, y: center.y + dy * t }
}

// Midpoint-quadratic smoothing over dagre's polyline waypoints — no extra deps.
function smoothPath(pts: Pt[]): string {
  if (pts.length < 3) return `M ${pts[0].x} ${pts[0].y} L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    d += ` Q ${pts[i].x} ${pts[i].y}, ${mx} ${my}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

// Arrowhead polygon length (see arrowHead in svg.ts) — edge paths stop this far
// short of the border so the line flows into the head instead of under it.
const HEAD_LEN = 10

export function buildFlowchartSvg(
  config: FlowchartConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const direction = config.direction ?? 'TB'
  const horizontal = direction === 'LR' || direction === 'RL'
  const nodeById = new Map(config.nodes.map((n) => [n.id, n]))
  const layout = graphLayout(
    config.nodes.map((n) => ({ id: n.id, ...nodeSize(n) })),
    config.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      ...(edge.label
        ? { labelW: estimateTextWidth(edge.label, 12) + 12, labelH: 20 }
        : {}),
    })),
    direction,
  )
  const root = el('g')
  const labelLayer = el('g')

  // Self-loops hang outside the node layout (dagre never sees them) and grow
  // the canvas instead of clipping; the content group shifts by extraLeft/extraTop.
  let extraLeft = 0
  let extraRight = 0
  let extraTop = 0
  let extraBottom = 0
  const trackX = (x1: number, x2: number): void => {
    extraLeft = Math.max(extraLeft, -x1)
    extraRight = Math.max(extraRight, x2 - layout.width)
  }

  // Edge elements first (paths render under nodes).
  const edgeTargets: { anim: AnimStep; targetLayer: number; sourceLayer: number }[] = []
  let edgeCursor = 0
  for (const edge of config.edges) {
    const s = layout.nodes.get(edge.from)
    const e = layout.nodes.get(edge.to)
    if (!s || !e) continue
    const dashAttr: Record<string, string> =
      edge.type === 'dashed' ? { 'stroke-dasharray': '6 4' } : {}
    const drawKind = edge.type === 'dashed' ? ('drawDash' as const) : ('draw' as const)
    const anim: AnimStep = []

    if (edge.from === edge.to) {
      // Self-loop: bulge right of the node (below it for horizontal flow).
      if (horizontal) {
        const cx = s.x + s.w / 2
        const by = s.y + s.h
        const path = el('path', {
          d: `M ${cx - 8} ${by} C ${cx - 8} ${by + 34}, ${cx + 8} ${by + 34}, ${cx + 8} ${by + 12}`,
          fill: 'none', stroke: t.line, 'stroke-width': 2, ...dashAttr,
        })
        root.appendChild(path)
        anim.push({ el: path, kind: drawKind })
        const head = arrowHead(cx + 8, by + 2, 270, t.line)
        root.appendChild(head)
        anim.push({ el: head, kind: 'fade' })
        extraBottom = Math.max(extraBottom, by + 44 - layout.height)
        if (edge.label) {
          const lw = estimateTextWidth(edge.label, 12)
          const txt = textEl(cx, by + 44, edge.label, { color: t.textSecondary, size: 12 })
          labelLayer.appendChild(txt)
          anim.push({ el: txt, kind: 'fade' })
          extraBottom = Math.max(extraBottom, by + 54 - layout.height)
          trackX(cx - lw / 2, cx + lw / 2)
        }
      } else {
        const cy = s.y + s.h / 2
        const rx = s.x + s.w
        const path = el('path', {
          d: `M ${rx} ${cy - 8} C ${rx + 36} ${cy - 8}, ${rx + 36} ${cy + 8}, ${rx + 12} ${cy + 8}`,
          fill: 'none', stroke: t.line, 'stroke-width': 2, ...dashAttr,
        })
        root.appendChild(path)
        anim.push({ el: path, kind: drawKind })
        const head = arrowHead(rx + 2, cy + 8, 180, t.line)
        root.appendChild(head)
        anim.push({ el: head, kind: 'fade' })
        trackX(s.x, rx + 40)
        if (edge.label) {
          const txt = textEl(rx + 44, cy, edge.label, { color: t.textSecondary, size: 12, anchor: 'start' })
          labelLayer.appendChild(txt)
          anim.push({ el: txt, kind: 'fade' })
          trackX(s.x, rx + 44 + estimateTextWidth(edge.label, 12) + 6)
        }
      }
      edgeTargets.push({ anim, targetLayer: e.layer, sourceLayer: s.layer })
      continue
    }

    const placed = layout.edges[edgeCursor++]
    const pts = placed.points.map((p) => ({ x: p.x, y: p.y }))
    if (pts.length >= 2) {
      const sourceShape = nodeById.get(edge.from)?.shape ?? 'rounded'
      const targetShape = nodeById.get(edge.to)?.shape ?? 'rounded'
      const sourceCenter = { x: s.x + s.w / 2, y: s.y + s.h / 2 }
      const targetCenter = { x: e.x + e.w / 2, y: e.y + e.h / 2 }
      let first = pts[0]
      let last = pts[pts.length - 1]
      if (sourceShape === 'diamond') first = intersectDiamond(sourceCenter, s.w, s.h, pts[1])
      else if (sourceShape === 'circle') first = intersectCircle(sourceCenter, s.w / 2, pts[1])
      if (targetShape === 'diamond') last = intersectDiamond(targetCenter, e.w, e.h, pts[pts.length - 2])
      else if (targetShape === 'circle') last = intersectCircle(targetCenter, e.w / 2, pts[pts.length - 2])
      pts[0] = first
      pts[pts.length - 1] = last
    }

    const tip = pts[pts.length - 1]
    const prev = pts[pts.length - 2] ?? pts[0]
    const angle = (Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180) / Math.PI
    const dx = tip.x - prev.x
    const dy = tip.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    const trimmedEnd = { x: tip.x - (dx / len) * HEAD_LEN, y: tip.y - (dy / len) * HEAD_LEN }
    const pathPts = [...pts.slice(0, -1), trimmedEnd]

    const path = el('path', {
      d: smoothPath(pathPts),
      fill: 'none', stroke: t.line, 'stroke-width': 2, ...dashAttr,
    })
    root.appendChild(path)
    anim.push({ el: path, kind: drawKind })
    const head = arrowHead(tip.x, tip.y, angle, t.line)
    root.appendChild(head)
    anim.push({ el: head, kind: 'fade' })
    if (edge.label) {
      const mid = pts[Math.floor(pts.length / 2)]
      const mx = placed.label?.x ?? mid.x
      const my = placed.label?.y ?? mid.y
      const lw = estimateTextWidth(edge.label, 12) + 12
      const g = el('g', {}, [
        el('rect', { x: mx - lw / 2, y: my - 10, width: lw, height: 20, rx: 4, fill: t.background }),
        textEl(mx, my, edge.label, { color: t.textSecondary, size: 12 }),
      ])
      labelLayer.appendChild(g)
      anim.push({ el: g, kind: 'fade' })
    }
    edgeTargets.push({ anim, targetLayer: placed.targetLayer, sourceLayer: placed.sourceLayer })
  }

  // Node groups on top.
  const nodeAnimByLayer: AnimStep[] = layout.layers.map(() => [])
  for (const [id, p] of layout.nodes) {
    const n = nodeById.get(id)
    if (!n) continue
    const g = el('g', {}, [nodeShape(n, p, t)])
    g.appendChild(textEl(p.x + p.w / 2, p.y + p.h / 2, n.text, { color: t.text, size: 13 }))
    root.appendChild(g)
    nodeAnimByLayer[p.layer].push({ el: g, kind: 'scale' })
  }
  root.appendChild(labelLayer)

  // Interleave: L0 nodes, edges→L1, L1 nodes, ...; back/self-edges last.
  const steps: AnimStep[] = []
  const backEdges: AnimStep = []
  for (let layer = 0; layer < layout.layers.length; layer++) {
    if (layer > 0) {
      const into = edgeTargets.filter((e) => e.targetLayer === layer && e.sourceLayer < layer)
      if (into.length > 0) steps.push(into.flatMap((e) => e.anim))
    }
    steps.push(nodeAnimByLayer[layer])
  }
  for (const e of edgeTargets) {
    if (e.targetLayer <= e.sourceLayer) backEdges.push(...e.anim)
  }
  if (backEdges.length > 0) steps.push(backEdges)

  const pad = opts.padding
  const w = layout.width + extraLeft + extraRight + pad * 2
  const h = layout.height + extraTop + extraBottom + pad * 2
  const label = `Flowchart with ${config.nodes.length} nodes (${config.nodes
    .map((n) => n.text)
    .join(', ')}) and ${config.edges.length} edges`
  const svg = svgRoot(w, h, opts, label)
  root.setAttribute('transform', `translate(${pad + extraLeft},${pad + extraTop})`)
  svg.appendChild(root)

  return { svg, steps: steps.filter((st) => st.length > 0) }
}

export function flowchart(container: HTMLElement, config: FlowchartConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildFlowchartSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 0)
}
