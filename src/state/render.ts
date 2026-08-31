import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { layeredLayout, type PlacedItem } from '../layered'
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

function stateGroup(s: StateNode, p: PlacedItem, t: ThemeTokens): SVGGElement {
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
  const layoutEdges = [
    ...(hasStart ? [{ from: START_ID, to: config.initial! }] : []),
    ...config.transitions,
  ]
  const layout = layeredLayout(
    layoutStates.map((s) => ({ id: s.id, ...stateSize(s) })),
    layoutEdges,
    'TB',
  )
  const root = el('g')
  const labelLayer = el('g')

  // Content hanging outside the state layout (label pills, self-loops) grows
  // the canvas instead of clipping (same pattern as the flowchart renderer).
  let extraLeft = 0
  let extraRight = 0
  let extraTop = 0
  const trackX = (x1: number, x2: number): void => {
    extraLeft = Math.max(extraLeft, -x1)
    extraRight = Math.max(extraRight, x2 - layout.width)
  }

  const stateById = new Map(layoutStates.map((s) => [s.id, s]))

  // Transition elements (under states).
  const transitionAnims: AnimStep[] = config.transitions.map((tr) => {
    const s = layout.items.get(tr.from)
    const e = layout.items.get(tr.to)
    const anim: AnimStep = []
    if (!s || !e) return anim
    if (tr.from === tr.to) {
      // self-loop above the state
      const cx = s.x + s.w / 2
      const path = el('path', {
        d: `M ${cx + 12} ${s.y} C ${cx + 44} ${s.y - 34}, ${cx - 44} ${s.y - 34}, ${cx - 12} ${s.y}`,
        fill: 'none', stroke: t.line, 'stroke-width': 2,
      })
      root.appendChild(path)
      anim.push({ el: path, kind: 'draw' })
      const head = arrowHead(cx - 12, s.y, 70, t.line)
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
    const down = e.y >= s.y + s.h
    const x1 = s.x + s.w / 2
    const y1 = down ? s.y + s.h : s.y
    const x2 = e.x + e.w / 2
    const y2 = down ? e.y : e.y + e.h
    const mid = (y2 - y1) / 2
    // Bow bidirectional pairs to opposite sides so their curves and labels
    // don't render on top of each other (e.g. failure / retry()).
    const hasReverse = config.transitions.some(
      (o) => o !== tr && o.from === tr.to && o.to === tr.from,
    )
    const bow = hasReverse ? (tr.from < tr.to ? 28 : -28) : 0
    const labelDy = hasReverse ? (tr.from < tr.to ? -8 : 8) : 0
    const path = el('path', {
      d: `M ${x1} ${y1} C ${x1 + bow} ${y1 + mid}, ${x2 + bow} ${y2 - mid}, ${x2} ${y2}`,
      fill: 'none', stroke: t.line, 'stroke-width': 2,
    })
    root.appendChild(path)
    anim.push({ el: path, kind: 'draw' })
    const head = arrowHead(x2, y2, down ? 90 : 270, t.line)
    root.appendChild(head)
    anim.push({ el: head, kind: 'fade' })
    if (tr.label) {
      const mx = (x1 + x2) / 2 + bow
      const my = (y1 + y2) / 2 + labelDy
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

  // Start connector (from start dot to initial state).
  let startConnector: AnimStep = []
  if (hasStart) {
    const s = layout.items.get(START_ID)!
    const e = layout.items.get(config.initial!)
    if (e) {
      const x1 = s.x + s.w / 2
      const y1 = s.y + s.h
      const x2 = e.x + e.w / 2
      const y2 = e.y
      const mid = (y2 - y1) / 2
      const path = el('path', {
        d: `M ${x1} ${y1} C ${x1} ${y1 + mid}, ${x2} ${y2 - mid}, ${x2} ${y2}`,
        fill: 'none', stroke: t.line, 'stroke-width': 2,
      })
      root.appendChild(path)
      const head = arrowHead(x2, y2, 90, t.line)
      root.appendChild(head)
      startConnector = [
        { el: path, kind: 'draw' },
        { el: head, kind: 'fade' },
      ]
    }
  }

  // State groups on top.
  const groupById = new Map<string, SVGGElement>()
  for (const [id, p] of layout.items) {
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
  const firstState = config.initial ?? config.states[0]?.id
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
  const label = `State diagram with ${config.states.length} states and ${config.transitions.length} transitions`
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
