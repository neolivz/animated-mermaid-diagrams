import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { graphLayout, type PlacedNode } from '../graph-layout'
import { resolveOptions } from '../theme'
import { arrowHead, el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type {
  DiagramController,
  ResolvedOptions,
  StateConfig,
  StateNode,
  StateTransition,
  ThemeTokens,
} from '../types'

const START_ID = '__start'

// Arrowhead polygon length (see arrowHead in svg.ts) — transition paths stop
// this far short of the border so the line flows into the head, not under it.
const HEAD_LEN = 10

interface Pt {
  x: number
  y: number
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

function stateSize(s: StateNode): { w: number; h: number } {
  if (s.type === 'start') return { w: 16, h: 16 }
  if (s.type === 'end') return { w: 22, h: 22 }
  return { w: Math.max(estimateTextWidth(s.text) + 28, 64), h: 36 }
}

function strokeFor(s: StateNode, t: ThemeTokens): string {
  if (s.highlight === 'red') return t.highlightRed
  if (s.highlight) return t.highlight
  return t.nodeBorder
}

function stateGroup(s: StateNode, p: PlacedNode, t: ThemeTokens): SVGGElement {
  const g = el('g')
  const cx = p.x + p.w / 2
  const cy = p.y + p.h / 2
  if (s.type === 'start') {
    g.appendChild(el('circle', { cx, cy, r: 7, fill: t.nodeBorder }))
  } else if (s.type === 'end') {
    g.appendChild(el('circle', { cx, cy, r: 10, fill: 'none', stroke: t.nodeBorder, 'stroke-width': 2 }))
    g.appendChild(el('circle', { cx, cy, r: 5, fill: t.nodeBorder }))
  } else {
    g.appendChild(
      el('rect', {
        x: p.x, y: p.y, width: p.w, height: p.h, rx: 8,
        fill: t.nodeBackground, stroke: strokeFor(s, t),
        'stroke-width': s.highlight ? 2.5 : 1.5,
      }),
    )
    g.appendChild(textEl(cx, cy, s.text, { color: t.text, size: 13 }))
  }
  return g
}

/** Transitions ordered BFS from the initial state; unreachable ones appended in config order. */
export function orderTransitions(transitions: StateTransition[], initial?: string): number[] {
  const order: number[] = []
  const used = new Set<number>()
  if (initial !== undefined) {
    const queue = [initial]
    const visited = new Set<string>([initial])
    while (queue.length > 0) {
      const id = queue.shift()!
      transitions.forEach((tr, i) => {
        if (tr.from !== id || used.has(i)) return
        used.add(i)
        order.push(i)
        if (!visited.has(tr.to)) {
          visited.add(tr.to)
          queue.push(tr.to)
        }
      })
    }
  }
  transitions.forEach((_, i) => {
    if (!used.has(i)) order.push(i)
  })
  return order
}

export function buildStateSvg(
  config: StateConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const hasStart = config.initial !== undefined
  const layoutStates: StateNode[] = hasStart
    ? [{ id: START_ID, text: '', type: 'start' }, ...config.states]
    : [...config.states]
  // The start connector is a normal dagre edge like any transition (no label).
  const layoutEdges = [
    ...(hasStart ? [{ from: START_ID, to: config.initial! }] : []),
    ...config.transitions.map((tr) => ({
      from: tr.from,
      to: tr.to,
      ...(tr.label ? { labelW: estimateTextWidth(tr.label, 12) + 12, labelH: 20 } : {}),
    })),
  ]
  const layout = graphLayout(
    layoutStates.map((s) => ({ id: s.id, ...stateSize(s) })),
    layoutEdges,
    'TB',
  )
  const root = el('g')
  const labelLayer = el('g')

  // Self-loops hang outside the state layout (dagre never sees them) and grow
  // the canvas instead of clipping (same pattern as the flowchart renderer).
  let extraLeft = 0
  let extraRight = 0
  let extraTop = 0
  const trackX = (x1: number, x2: number): void => {
    extraLeft = Math.max(extraLeft, -x1)
    extraRight = Math.max(extraRight, x2 - layout.width)
  }

  const stateById = new Map(layoutStates.map((s) => [s.id, s]))

  // Placed (non-self) edges from graphLayout, in the same relative order as
  // the start connector (if present) followed by config.transitions.
  let edgeCursor = 0

  // Start connector (from start dot to initial state) — routed by dagre.
  let startConnector: AnimStep = []
  if (hasStart) {
    const s = layout.nodes.get(START_ID)!
    const e = layout.nodes.get(config.initial!)
    if (e) {
      const placed = layout.edges[edgeCursor++]
      const pts = placed.points.map((p) => ({ x: p.x, y: p.y }))
      const tip = pts[pts.length - 1]
      const prev = pts[pts.length - 2] ?? pts[0]
      const angle = (Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180) / Math.PI
      const dx = tip.x - prev.x
      const dy = tip.y - prev.y
      const len = Math.hypot(dx, dy) || 1
      const trimmedEnd = { x: tip.x - (dx / len) * HEAD_LEN, y: tip.y - (dy / len) * HEAD_LEN }
      const path = el('path', {
        d: smoothPath([...pts.slice(0, -1), trimmedEnd]),
        fill: 'none', stroke: t.line, 'stroke-width': 2,
      })
      root.appendChild(path)
      const head = arrowHead(tip.x, tip.y, angle, t.line)
      root.appendChild(head)
      startConnector = [
        { el: path, kind: 'draw' },
        { el: head, kind: 'fade' },
      ]
    }
  }

  // Transition elements (under states).
  const transitionAnims: AnimStep[] = config.transitions.map((tr) => {
    const s = layout.nodes.get(tr.from)
    const e = layout.nodes.get(tr.to)
    const anim: AnimStep = []
    if (!s || !e) return anim
    if (tr.from === tr.to) {
      // self-loop above the state
      const cx = s.x + s.w / 2
      // End tangent runs from control (cx-44, s.y-34) into (cx-12, s.y), direction
      // (32, 34) ≈ 47°; trim the path back ~HEAD_LEN along that tangent so the
      // line flows into the arrowhead instead of under it.
      const path = el('path', {
        d: `M ${cx + 12} ${s.y} C ${cx + 44} ${s.y - 34}, ${cx - 44} ${s.y - 34}, ${cx - 18.9} ${s.y - 7.3}`,
        fill: 'none', stroke: t.line, 'stroke-width': 2,
      })
      root.appendChild(path)
      anim.push({ el: path, kind: 'draw' })
      const head = arrowHead(cx - 12, s.y, 47, t.line)
      root.appendChild(head)
      anim.push({ el: head, kind: 'fade' })
      extraTop = Math.max(extraTop, -(s.y - 34))
      trackX(cx - 44, cx + 44)
      if (tr.label) {
        const txt = textEl(cx, s.y - 34, tr.label, { color: t.textSecondary, size: 12 })
        labelLayer.appendChild(txt)
        anim.push({ el: txt, kind: 'fade' })
        extraTop = Math.max(extraTop, -(s.y - 44))
        trackX(cx - estimateTextWidth(tr.label, 12) / 2, cx + estimateTextWidth(tr.label, 12) / 2)
      }
      return anim
    }

    const placed = layout.edges[edgeCursor++]
    const pts = placed.points.map((p) => ({ x: p.x, y: p.y }))
    const tip = pts[pts.length - 1]
    const prev = pts[pts.length - 2] ?? pts[0]
    const angle = (Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180) / Math.PI
    const dx = tip.x - prev.x
    const dy = tip.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    const trimmedEnd = { x: tip.x - (dx / len) * HEAD_LEN, y: tip.y - (dy / len) * HEAD_LEN }
    const path = el('path', {
      d: smoothPath([...pts.slice(0, -1), trimmedEnd]),
      fill: 'none', stroke: t.line, 'stroke-width': 2,
    })
    root.appendChild(path)
    anim.push({ el: path, kind: 'draw' })
    const head = arrowHead(tip.x, tip.y, angle, t.line)
    root.appendChild(head)
    anim.push({ el: head, kind: 'fade' })
    if (tr.label) {
      const mid = pts[Math.floor(pts.length / 2)]
      const mx = placed.label?.x ?? mid.x
      const my = placed.label?.y ?? mid.y
      const lw = estimateTextWidth(tr.label, 12) + 12
      trackX(mx - lw / 2, mx + lw / 2)
      const g = el('g', {}, [
        el('rect', { x: mx - lw / 2, y: my - 10, width: lw, height: 20, rx: 4, fill: t.background }),
        textEl(mx, my, tr.label, { color: t.textSecondary, size: 12 }),
      ])
      labelLayer.appendChild(g)
      anim.push({ el: g, kind: 'fade' })
    }
    return anim
  })

  // State groups on top.
  const groupById = new Map<string, SVGGElement>()
  for (const [id, p] of layout.nodes) {
    const s = stateById.get(id)
    if (!s) continue
    const g = stateGroup(s, p, t)
    root.appendChild(g)
    groupById.set(id, g)
  }
  root.appendChild(labelLayer)

  // Anim steps: intro (start dot + connector + initial state), then BFS transitions.
  const steps: AnimStep[] = []
  const shown = new Set<string>()
  const intro: AnimStep = []
  if (hasStart) {
    intro.push({ el: groupById.get(START_ID)!, kind: 'scale' }, ...startConnector)
    shown.add(START_ID)
  }
  // BFS entry when no explicit initial: first state participating in a
  // transition (an orphan declared state should not hijack the reveal order).
  const firstState =
    config.initial ??
    config.states.find((s) =>
      config.transitions.some((tr) => tr.from === s.id || tr.to === s.id),
    )?.id ??
    config.states[0]?.id
  if (firstState !== undefined && groupById.has(firstState)) {
    intro.push({ el: groupById.get(firstState)!, kind: 'scale' })
    shown.add(firstState)
  }
  steps.push(intro)

  for (const i of orderTransitions(config.transitions, firstState)) {
    const tr = config.transitions[i]
    const step: AnimStep = [...transitionAnims[i]]
    for (const id of [tr.from, tr.to]) {
      if (!shown.has(id) && groupById.has(id)) {
        shown.add(id)
        step.push({ el: groupById.get(id)!, kind: 'scale' })
      }
    }
    steps.push(step)
  }
  // States never touched by any transition still need to appear.
  const orphans: AnimStep = []
  for (const s of config.states) {
    if (!shown.has(s.id) && groupById.has(s.id)) orphans.push({ el: groupById.get(s.id)!, kind: 'scale' })
  }
  if (orphans.length > 0) steps.push(orphans)

  const finalSteps = steps.filter((st) => st.length > 0)

  const pad = opts.padding
  const w = layout.width + extraLeft + extraRight + pad * 2
  const h = layout.height + extraTop + pad * 2
  const label = `State diagram with ${config.states.length} states (${config.states
    .filter((s) => s.text.length > 0)
    .map((s) => s.text)
    .join(', ')}) and ${config.transitions.length} transitions`
  const svg = svgRoot(w, h, opts, label)
  root.setAttribute('transform', `translate(${pad + extraLeft},${pad + extraTop})`)
  svg.appendChild(root)

  return { svg, steps: finalSteps }
}

export function stateDiagram(container: HTMLElement, config: StateConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildStateSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 1)
}
