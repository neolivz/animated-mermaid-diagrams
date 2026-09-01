import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { paletteColor } from '../palette'
import { highlightColor, resolveOptions } from '../theme'
import { el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type { DiagramController, ResolvedOptions, SankeyConfig, SankeyLink } from '../types'

const NODE_W = 16
const NODE_GAP = 12
const MAX_COL_H = 260
const MIN_NODE_H = 6
const LABEL_FONT = 12

export interface SankeyNodeBox {
  name: string
  index: number
  rank: number
  /** top-left */
  x: number
  y: number
  h: number
  throughput: number
}

export interface SankeyLayout {
  nodes: SankeyNodeBox[]
  /** links that survived cycle-dropping, in document order */
  keptLinks: SankeyLink[]
  /** px per unit of value */
  scale: number
  width: number
  height: number
}

/** Hand-config values may be non-finite or negative — clamp like the parser
 *  does, so render math never sees a poisoned number (journey/pie convention). */
function valueOf(link: SankeyLink): number {
  return Number.isFinite(link.value) && link.value > 0 ? link.value : 0
}

export function layoutSankey(links: SankeyLink[]): SankeyLayout {
  // Node registry in first-mention order.
  const names: string[] = []
  const indexOf = new Map<string, number>()
  const ensure = (name: string): number => {
    let i = indexOf.get(name)
    if (i === undefined) {
      i = names.length
      names.push(name)
      indexOf.set(name, i)
    }
    return i
  }

  // Keep links unless they would create a cycle among already-kept links.
  const kept: SankeyLink[] = []
  const adj = new Map<string, Set<string>>()
  const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (from === to) return true
    if (seen.has(from)) return false
    seen.add(from)
    for (const next of adj.get(from) ?? []) if (reaches(next, to, seen)) return true
    return false
  }
  for (const link of links) {
    ensure(link.source)
    ensure(link.target)
    if (link.source === link.target || reaches(link.target, link.source)) continue
    kept.push(link)
    const outs = adj.get(link.source) ?? new Set()
    outs.add(link.target)
    adj.set(link.source, outs)
  }

  if (names.length === 0) {
    return { nodes: [], keptLinks: [], scale: 1, width: 0, height: 0 }
  }

  // Rank = longest path from any source (graph is acyclic by construction).
  const rankOf = new Map<string, number>()
  const rank = (name: string, seen = new Set<string>()): number => {
    const cached = rankOf.get(name)
    if (cached !== undefined) return cached
    if (seen.has(name)) return 0
    seen.add(name)
    let r = 0
    for (const link of kept) {
      if (link.target === name) r = Math.max(r, rank(link.source, seen) + 1)
    }
    rankOf.set(name, r)
    return r
  }
  for (const name of names) rank(name)

  const throughputOf = (name: string): number => {
    let inSum = 0
    let outSum = 0
    for (const l of kept) {
      if (l.target === name) inSum += valueOf(l)
      if (l.source === name) outSum += valueOf(l)
    }
    return Math.max(inSum, outSum)
  }

  // Scale so the busiest column fits MAX_COL_H.
  const ranks = new Map<number, string[]>()
  for (const name of names) {
    const r = rankOf.get(name) ?? 0
    const col = ranks.get(r) ?? []
    col.push(name)
    ranks.set(r, col)
  }
  let scale = Infinity
  for (const col of ranks.values()) {
    const sum = col.reduce((a, n) => a + throughputOf(n), 0)
    const avail = MAX_COL_H - (col.length - 1) * NODE_GAP
    if (sum > 0) scale = Math.min(scale, avail / sum)
  }
  if (!Number.isFinite(scale)) scale = 1

  // Column x positions: each column advances by node width + its own label
  // span + breathing room for the ribbons.
  const maxRank = Math.max(...names.map((n) => rankOf.get(n) ?? 0))
  const colX: number[] = []
  let cursor = 0
  for (let r = 0; r <= maxRank; r++) {
    colX[r] = cursor
    const col = ranks.get(r) ?? []
    const labelW = col.reduce((m, n) => Math.max(m, estimateTextWidth(n, LABEL_FONT)), 0)
    cursor += NODE_W + 8 + labelW + 72
  }
  const width = cursor - 72 + 8

  // Stack nodes per column, columns vertically centered on the tallest.
  const nodes: SankeyNodeBox[] = []
  const colHeights = new Map<number, number>()
  for (const [r, col] of ranks) {
    const h = col.reduce((a, n) => a + Math.max(MIN_NODE_H, throughputOf(n) * scale), 0) + (col.length - 1) * NODE_GAP
    colHeights.set(r, h)
  }
  const tallest = Math.max(...colHeights.values())
  for (const [r, col] of ranks) {
    let y = (tallest - colHeights.get(r)!) / 2
    for (const name of col) {
      const throughput = throughputOf(name)
      const h = Math.max(MIN_NODE_H, throughput * scale)
      nodes.push({ name, index: indexOf.get(name)!, rank: r, x: colX[r], y, h, throughput })
      y += h + NODE_GAP
    }
  }

  return { nodes, keptLinks: kept, scale, width, height: tallest }
}

export function buildSankeySvg(
  config: SankeyConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const L = layoutSankey(config.links)
  const pad = opts.padding
  const w = L.width + pad * 2
  const h = Math.max(L.height, 40) + pad * 2
  const label = `Sankey diagram with ${L.nodes.length} nodes and ${L.keptLinks.length} flows`
  const svg = svgRoot(w, h, opts, label)
  const root = el('g', { transform: `translate(${pad},${pad})` })
  svg.appendChild(root)

  const nodeByName = new Map(L.nodes.map((n) => [n.name, n]))
  const ribbonLayer = el('g')
  root.appendChild(ribbonLayer)

  // Intro: every node rect + label (ribbons then flow between them).
  const intro: AnimStep = []
  for (const n of L.nodes) {
    const g = el('g', {}, [
      el('rect', {
        x: n.x,
        y: n.y,
        width: NODE_W,
        height: n.h,
        rx: 3,
        fill: paletteColor(n.index),
      }),
      textEl(n.x + NODE_W + 8, n.y + n.h / 2, n.name, {
        color: t.text,
        size: LABEL_FONT,
        anchor: 'start',
      }),
    ])
    root.appendChild(g)
    intro.push({ el: g, kind: 'fade' })
  }
  if (intro.length === 0) {
    const empty = textEl(0, 10, 'empty sankey', { color: t.textSecondary, size: 12, anchor: 'start' })
    root.appendChild(empty)
    intro.push({ el: empty, kind: 'fade' })
  }
  const animSteps: AnimStep[] = [intro]

  // Ribbons: thickness ∝ value, stacked at each node side in link order.
  const outCursor = new Map<string, number>()
  const inCursor = new Map<string, number>()
  for (const link of L.keptLinks) {
    const s = nodeByName.get(link.source)!
    const e = nodeByName.get(link.target)!
    const th = Math.max(1, valueOf(link) * L.scale)
    const sy = s.y + (outCursor.get(link.source) ?? 0)
    const ty = e.y + (inCursor.get(link.target) ?? 0)
    outCursor.set(link.source, (outCursor.get(link.source) ?? 0) + th)
    inCursor.set(link.target, (inCursor.get(link.target) ?? 0) + th)
    const sx = s.x + NODE_W
    const tx = e.x
    const mx = (sx + tx) / 2
    const hl = highlightColor(link.highlight, t)
    const ribbon = el('path', {
      d: `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty} L ${tx} ${ty + th} C ${mx} ${ty + th}, ${mx} ${sy + th}, ${sx} ${sy + th} Z`,
      fill: hl ?? paletteColor(s.index),
      'fill-opacity': hl ? 0.55 : 0.35,
    })
    ribbonLayer.appendChild(ribbon)
    animSteps.push([{ el: ribbon, kind: 'fade' }])
  }

  return { svg, steps: animSteps }
}

export function sankey(container: HTMLElement, config: SankeyConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildSankeySvg(config, opts)
  return createDiagram(container, svg, steps, opts, 1)
}
