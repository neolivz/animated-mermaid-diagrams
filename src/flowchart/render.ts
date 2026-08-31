import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { layeredLayout, type PlacedItem } from '../layered'
import { resolveOptions } from '../theme'
import { arrowHead, el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type {
  DiagramController,
  FlowchartConfig,
  FlowNode,
  ResolvedOptions,
  ThemeTokens,
} from '../types'

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

function nodeShape(n: FlowNode, p: PlacedItem, t: ThemeTokens): SVGElement {
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

interface EdgeAnchor {
  x1: number
  y1: number
  x2: number
  y2: number
  angle: number
}

function anchors(s: PlacedItem, e: PlacedItem, horizontal: boolean): EdgeAnchor {
  if (horizontal) {
    const forward = e.x >= s.x + s.w
    return forward
      ? { x1: s.x + s.w, y1: s.y + s.h / 2, x2: e.x, y2: e.y + e.h / 2, angle: 0 }
      : { x1: s.x, y1: s.y + s.h / 2, x2: e.x + e.w, y2: e.y + e.h / 2, angle: 180 }
  }
  const forward = e.y >= s.y + s.h
  return forward
    ? { x1: s.x + s.w / 2, y1: s.y + s.h, x2: e.x + e.w / 2, y2: e.y, angle: 90 }
    : { x1: s.x + s.w / 2, y1: s.y, x2: e.x + e.w / 2, y2: e.y + e.h, angle: 270 }
}

function edgePath(a: EdgeAnchor, horizontal: boolean): string {
  if (horizontal) {
    const mid = (a.x2 - a.x1) / 2
    return `M ${a.x1} ${a.y1} C ${a.x1 + mid} ${a.y1}, ${a.x2 - mid} ${a.y2}, ${a.x2} ${a.y2}`
  }
  const mid = (a.y2 - a.y1) / 2
  return `M ${a.x1} ${a.y1} C ${a.x1} ${a.y1 + mid}, ${a.x2} ${a.y2 - mid}, ${a.x2} ${a.y2}`
}

export function buildFlowchartSvg(
  config: FlowchartConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const direction = config.direction ?? 'TB'
  const horizontal = direction === 'LR' || direction === 'RL'
  const layout = layeredLayout(
    config.nodes.map((n) => ({ id: n.id, ...nodeSize(n) })),
    config.edges,
    direction,
  )
  const pad = opts.padding
  const w = layout.width + pad * 2
  const h = layout.height + pad * 2
  const label = `Flowchart with ${config.nodes.length} nodes and ${config.edges.length} edges`
  const svg = svgRoot(w, h, opts, label)
  const root = el('g', { transform: `translate(${pad},${pad})` })
  svg.appendChild(root)

  const nodeById = new Map(config.nodes.map((n) => [n.id, n]))

  // Edge elements first (paths render under nodes).
  const edgeTargets: { anim: AnimStep; targetLayer: number; sourceLayer: number }[] = []
  for (const edge of config.edges) {
    const s = layout.items.get(edge.from)
    const e = layout.items.get(edge.to)
    if (!s || !e) continue
    const a = anchors(s, e, horizontal)
    const dashAttr: Record<string, string> = edge.type === 'dashed' ? { 'stroke-dasharray': '6 4' } : {}
    const path = el('path', {
      d: edgePath(a, horizontal),
      fill: 'none',
      stroke: t.line,
      'stroke-width': 2,
      ...dashAttr,
    })
    root.appendChild(path)
    const anim: AnimStep = [{ el: path, kind: edge.type === 'dashed' ? 'drawDash' : 'draw' }]
    const head = arrowHead(a.x2, a.y2, a.angle, t.line)
    root.appendChild(head)
    anim.push({ el: head, kind: 'fade' })
    if (edge.label) {
      const mx = (a.x1 + a.x2) / 2
      const my = (a.y1 + a.y2) / 2
      const lw = estimateTextWidth(edge.label, 12) + 12
      const g = el('g', {}, [
        el('rect', { x: mx - lw / 2, y: my - 10, width: lw, height: 20, rx: 4, fill: t.background }),
        textEl(mx, my, edge.label, { color: t.textSecondary, size: 12 }),
      ])
      root.appendChild(g)
      anim.push({ el: g, kind: 'fade' })
    }
    edgeTargets.push({ anim, targetLayer: e.layer, sourceLayer: s.layer })
  }

  // Node groups on top.
  const nodeAnimByLayer: AnimStep[] = layout.layers.map(() => [])
  for (const [id, p] of layout.items) {
    const n = nodeById.get(id)
    if (!n) continue
    const g = el('g', {}, [nodeShape(n, p, t)])
    g.appendChild(textEl(p.x + p.w / 2, p.y + p.h / 2, n.text, { color: t.text, size: 13 }))
    root.appendChild(g)
    nodeAnimByLayer[p.layer].push({ el: g, kind: 'scale' })
  }

  // Interleave: L0 nodes, edges→L1, L1 nodes, edges→L2, ...; back-edges last.
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

  return { svg, steps: steps.filter((s) => s.length > 0) }
}

export function flowchart(container: HTMLElement, config: FlowchartConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildFlowchartSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 0)
}
