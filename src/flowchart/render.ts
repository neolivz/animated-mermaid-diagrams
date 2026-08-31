import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { layeredLayout, type PlacedItem } from '../layered'
import { resolveOptions } from '../theme'
import { arrowHead, el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type {
  DiagramController,
  FlowchartConfig,
  FlowNode,
  FlowShape,
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

// Arrowhead polygon length (see arrowHead in svg.ts) — edge paths stop this far
// short of the border so the line flows into the head instead of under it.
const HEAD_LEN = 10

function anchors(
  s: PlacedItem,
  e: PlacedItem,
  horizontal: boolean,
  sShape?: FlowShape,
  eShape?: FlowShape,
): EdgeAnchor {
  if (horizontal) {
    const forward = e.x >= s.x + s.w
    let { x1, y1, x2, y2, angle } = forward
      ? { x1: s.x + s.w, y1: s.y + s.h / 2, x2: e.x, y2: e.y + e.h / 2, angle: 0 }
      : { x1: s.x, y1: s.y + s.h / 2, x2: e.x + e.w, y2: e.y + e.h / 2, angle: 180 }
    const dy = e.y + e.h / 2 - (s.y + s.h / 2)
    if (sShape === 'diamond' && dy !== 0) {
      y1 += Math.sign(dy) * s.h * 0.25
      x1 += (forward ? -1 : 1) * s.w * 0.25
    }
    if (eShape === 'diamond' && dy !== 0) {
      y2 -= Math.sign(dy) * e.h * 0.25
      x2 += (forward ? 1 : -1) * e.w * 0.25
    }
    return { x1, y1, x2, y2, angle }
  }
  const forward = e.y >= s.y + s.h
  let { x1, y1, x2, y2, angle } = forward
    ? { x1: s.x + s.w / 2, y1: s.y + s.h, x2: e.x + e.w / 2, y2: e.y, angle: 90 }
    : { x1: s.x + s.w / 2, y1: s.y, x2: e.x + e.w / 2, y2: e.y + e.h, angle: 270 }
  const dx = e.x + e.w / 2 - (s.x + s.w / 2)
  if (sShape === 'diamond' && dx !== 0) {
    x1 += Math.sign(dx) * s.w * 0.25
    y1 += (forward ? -1 : 1) * s.h * 0.25
  }
  if (eShape === 'diamond' && dx !== 0) {
    x2 -= Math.sign(dx) * e.w * 0.25
    y2 += (forward ? 1 : -1) * e.h * 0.25
  }
  return { x1, y1, x2, y2, angle }
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
  const nodeById = new Map(config.nodes.map((n) => [n.id, n]))
  const root = el('g')
  const labelLayer = el('g')

  // Content hanging outside the node layout (label pills, self-loops) grows the
  // canvas instead of clipping; the content group shifts right by extraLeft.
  let extraLeft = 0
  let extraRight = 0
  let extraBottom = 0
  const trackX = (x1: number, x2: number): void => {
    extraLeft = Math.max(extraLeft, -x1)
    extraRight = Math.max(extraRight, x2 - layout.width)
  }

  // Edge elements first (paths render under nodes).
  const edgeTargets: { anim: AnimStep; targetLayer: number; sourceLayer: number }[] = []
  for (const edge of config.edges) {
    const s = layout.items.get(edge.from)
    const e = layout.items.get(edge.to)
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

    const a = anchors(s, e, horizontal, nodeById.get(edge.from)?.shape, nodeById.get(edge.to)?.shape)
    // Stop the path at the arrowhead's base so the line flows into the arrow,
    // not underneath it into the box (head length = 10).
    const trimmed: EdgeAnchor = { ...a }
    if (horizontal) trimmed.x2 += a.angle === 0 ? -HEAD_LEN : HEAD_LEN
    else trimmed.y2 += a.angle === 90 ? -HEAD_LEN : HEAD_LEN
    const path = el('path', {
      d: edgePath(trimmed, horizontal),
      fill: 'none', stroke: t.line, 'stroke-width': 2, ...dashAttr,
    })
    root.appendChild(path)
    anim.push({ el: path, kind: drawKind })
    const head = arrowHead(a.x2, a.y2, a.angle, t.line)
    root.appendChild(head)
    anim.push({ el: head, kind: 'fade' })
    if (edge.label) {
      const mx = (a.x1 + a.x2) / 2
      const my = (a.y1 + a.y2) / 2
      const lw = estimateTextWidth(edge.label, 12) + 12
      trackX(mx - lw / 2, mx + lw / 2)
      const g = el('g', {}, [
        el('rect', { x: mx - lw / 2, y: my - 10, width: lw, height: 20, rx: 4, fill: t.background }),
        textEl(mx, my, edge.label, { color: t.textSecondary, size: 12 }),
      ])
      labelLayer.appendChild(g)
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
  const h = layout.height + extraBottom + pad * 2
  const label = `Flowchart with ${config.nodes.length} nodes (${config.nodes
    .map((n) => n.text)
    .join(', ')}) and ${config.edges.length} edges`
  const svg = svgRoot(w, h, opts, label)
  root.setAttribute('transform', `translate(${pad + extraLeft},${pad})`)
  svg.appendChild(root)

  return { svg, steps: steps.filter((st) => st.length > 0) }
}

export function flowchart(container: HTMLElement, config: FlowchartConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildFlowchartSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 0)
}
