import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { paletteColor } from '../palette'
import { highlightColor, resolveOptions } from '../theme'
import { el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type {
  DiagramController,
  MindmapConfig,
  MindmapNode,
  ResolvedOptions,
  ThemeTokens,
} from '../types'

const ROW_H = 38
const LEVEL_GAP = 46
const NODE_H = 30

export interface PlacedMindmapNode {
  node: MindmapNode
  parent?: PlacedMindmapNode
  depth: number
  /** index of the depth-1 branch this node belongs to (root: -1) */
  branchIndex: number
  /** center coordinates */
  x: number
  y: number
  w: number
  h: number
  /** document order among non-root nodes, for step sequencing */
  order: number
}

export interface MindmapLayout {
  placed: PlacedMindmapNode[]
  width: number
  height: number
}

function fontFor(depth: number): number {
  return depth === 0 ? 14 : depth === 1 ? 13 : 12
}

function nodeSize(node: MindmapNode, depth: number): { w: number; h: number } {
  const tw = estimateTextWidth(node.text, fontFor(depth))
  if (node.shape === 'circle' || node.shape === 'bang') {
    const d = Math.max(tw + 24, 48)
    return { w: d, h: d }
  }
  const h = depth === 0 ? NODE_H + 6 : NODE_H
  return { w: tw + 24, h }
}

/** Two-sided tidy tree: depth-1 branches alternate right/left in document
 *  order; within a side, leaves stack ROW_H apart and parents center on
 *  their children. Coordinates come back centered on the root, then get
 *  shifted into positive space. */
export function layoutMindmap(root: MindmapNode): MindmapLayout {
  const placed: PlacedMindmapNode[] = []
  let order = 0

  const rootSize = nodeSize(root, 0)
  const rootPlaced: PlacedMindmapNode = {
    node: root,
    depth: 0,
    branchIndex: -1,
    x: 0,
    y: 0,
    ...rootSize,
    order: -1,
  }
  placed.push(rootPlaced)

  interface SideState {
    /** max node width per depth (1-based) on this side */
    colW: number[]
    /** next free leaf row (in ROW_H units) */
    leafCursor: number
    sign: 1 | -1
  }
  const sides: Record<'R' | 'L', SideState> = {
    R: { colW: [], leafCursor: 0, sign: 1 },
    L: { colW: [], leafCursor: 0, sign: -1 },
  }

  // First pass: measure column widths per side.
  const measure = (node: MindmapNode, depth: number, side: SideState): void => {
    const { w } = nodeSize(node, depth)
    side.colW[depth] = Math.max(side.colW[depth] ?? 0, w)
    for (const child of node.children ?? []) measure(child, depth + 1, side)
  }
  ;(root.children ?? []).forEach((branch, i) => {
    measure(branch, 1, i % 2 === 0 ? sides.R : sides.L)
  })

  // Second pass: place. Returns the subtree's center row.
  const place = (
    node: MindmapNode,
    depth: number,
    side: SideState,
    branchIndex: number,
    parent: PlacedMindmapNode,
  ): PlacedMindmapNode => {
    const size = nodeSize(node, depth)
    const p: PlacedMindmapNode = {
      node,
      parent,
      depth,
      branchIndex,
      x: 0,
      y: 0,
      ...size,
      order: order++,
    }
    placed.push(p)
    const children = node.children ?? []
    if (children.length === 0) {
      p.y = side.leafCursor * ROW_H
      side.leafCursor += 1
    } else {
      const placedChildren = children.map((c) => place(c, depth + 1, side, branchIndex, p))
      p.y = (placedChildren[0].y + placedChildren[placedChildren.length - 1].y) / 2
    }
    // x: center of this depth's column on this side.
    let edge = rootSize.w / 2
    for (let d = 1; d < depth; d++) edge += (side.colW[d] ?? 0) + LEVEL_GAP
    p.x = side.sign * (edge + LEVEL_GAP + (side.colW[depth] ?? size.w) / 2)
    return p
  }
  ;(root.children ?? []).forEach((branch, i) => {
    place(branch, 1, i % 2 === 0 ? sides.R : sides.L, i, rootPlaced)
  })

  // Vertically center each side's block on the root.
  for (const side of [sides.R, sides.L]) {
    const mine = placed.filter((p) => p.depth > 0 && Math.sign(p.x) === side.sign)
    if (mine.length === 0) continue
    const minY = Math.min(...mine.map((p) => p.y))
    const maxY = Math.max(...mine.map((p) => p.y))
    const shift = (minY + maxY) / 2
    for (const p of mine) p.y -= shift
  }

  // Shift everything into positive space.
  const minX = Math.min(...placed.map((p) => p.x - p.w / 2))
  const minY = Math.min(...placed.map((p) => p.y - p.h / 2))
  for (const p of placed) {
    p.x -= minX
    p.y -= minY
  }
  const width = Math.max(...placed.map((p) => p.x + p.w / 2))
  const height = Math.max(...placed.map((p) => p.y + p.h / 2))
  return { placed, width, height }
}

/** Mermaid-style solid nodes: every node is FILLED with its branch color
 *  (the root with the border token), text in the background color for
 *  contrast. Highlight adds an accent outline. */
function nodeChrome(p: PlacedMindmapNode, color: string, t: ThemeTokens): SVGElement {
  const ring = highlightColor(p.node.highlight, t)
  const common = {
    fill: color,
    stroke: ring ?? color,
    'stroke-width': ring ? 3 : 0,
  }
  const x = p.x - p.w / 2
  const y = p.y - p.h / 2
  switch (p.node.shape) {
    case 'circle':
      return el('circle', { cx: p.x, cy: p.y, r: p.w / 2, ...common })
    case 'bang':
      return el('circle', {
        cx: p.x, cy: p.y, r: p.w / 2, ...common,
        stroke: ring ?? t.background, 'stroke-width': ring ? 3 : 2, 'stroke-dasharray': '6 4',
      })
    case 'square':
      return el('rect', { x, y, width: p.w, height: p.h, rx: 2, ...common })
    case 'cloud':
      return el('rect', { x, y, width: p.w, height: p.h, rx: p.h / 2, ...common })
    case 'hexagon': {
      const c = 8
      return el('polygon', {
        points: `${x + c},${y} ${x + p.w - c},${y} ${x + p.w},${p.y} ${x + p.w - c},${y + p.h} ${x + c},${y + p.h} ${x},${p.y}`,
        ...common,
      })
    }
    // 'rounded' and the default plain node both render as Mermaid's filled
    // rounded box — that IS Mermaid's default mindmap node.
    default:
      return el('rect', { x, y, width: p.w, height: p.h, rx: 8, ...common })
  }
}

export function buildMindmapSvg(
  config: MindmapConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const L = layoutMindmap(config.root)
  const pad = opts.padding
  const w = L.width + pad * 2
  const h = L.height + pad * 2
  const label = `Mind map "${config.root.text}" with ${L.placed.length} nodes`
  const svg = svgRoot(w, h, opts, label)
  const root = el('g', { transform: `translate(${pad},${pad})` })
  svg.appendChild(root)

  const animSteps: AnimStep[] = []
  const nodeGroups = new Map<PlacedMindmapNode, SVGGElement>()

  // Build node groups (chrome + text); appended after edges for z-order, so
  // collect them first.
  for (const p of L.placed) {
    const color = p.depth === 0 ? t.nodeBorder : paletteColor(p.branchIndex)
    const g = el('g')
    g.appendChild(nodeChrome(p, color, t))
    g.appendChild(
      textEl(p.x, p.y, p.node.text, {
        color: t.background,
        size: fontFor(p.depth),
        weight: p.depth <= 1 ? '600' : undefined,
      }),
    )
    nodeGroups.set(p, g)
  }

  // Edges under nodes.
  const edgeFor = new Map<PlacedMindmapNode, SVGPathElement>()
  for (const p of L.placed) {
    if (!p.parent) continue
    const from = p.parent
    const sign = Math.sign(p.x - from.x) || 1
    const x0 = from.x + (sign * from.w) / 2
    const x1 = p.x - (sign * p.w) / 2
    const midX = (x0 + x1) / 2
    const path = el('path', {
      d: `M ${x0} ${from.y} C ${midX} ${from.y}, ${midX} ${p.y}, ${x1} ${p.y}`,
      fill: 'none',
      stroke: paletteColor(p.branchIndex),
      'stroke-width': p.depth === 1 ? 2.5 : 2,
      'stroke-linecap': 'round',
    })
    root.appendChild(path)
    edgeFor.set(p, path)
  }
  for (const p of L.placed) root.appendChild(nodeGroups.get(p)!)

  // Intro: the root pops. Then document (DFS pre-)order: edge + node per step.
  const rootPlaced = L.placed[0]
  animSteps.push([{ el: nodeGroups.get(rootPlaced)!, kind: 'scale' }])
  const ordered = L.placed.filter((p) => p.depth > 0).sort((a, b) => a.order - b.order)
  for (const p of ordered) {
    const step: AnimStep = []
    const edge = edgeFor.get(p)
    if (edge) step.push({ el: edge, kind: 'draw' })
    step.push({ el: nodeGroups.get(p)!, kind: 'scale' })
    animSteps.push(step)
  }

  return { svg, steps: animSteps }
}

export function mindmap(container: HTMLElement, config: MindmapConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildMindmapSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 1)
}
