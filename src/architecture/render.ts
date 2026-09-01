import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { highlightColor, resolveOptions } from '../theme'
import { el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type {
  ArchIcon,
  ArchService,
  ArchSide,
  ArchitectureConfig,
  DiagramController,
  ResolvedOptions,
  ThemeTokens,
} from '../types'

const CARD_W = 88
const CARD_H = 66
const CELL_W = 104
const CELL_H = 84
const GRID_COLS = 2
const GROUP_PAD = 14
const GROUP_TITLE_H = 22
const GROUP_GAP = 28
const GROUPS_PER_ROW = 3

export interface ArchCard {
  service: ArchService
  /** top-left */
  x: number
  y: number
  w: number
  h: number
}

export interface ArchGroupBox {
  id: string
  title?: string
  x: number
  y: number
  w: number
  h: number
}

export interface ArchLayout {
  cards: ArchCard[]
  groupBoxes: ArchGroupBox[]
  width: number
  height: number
}

const SIDE_DIR: Record<ArchSide, { dx: number; dy: number }> = {
  R: { dx: 1, dy: 0 },
  L: { dx: -1, dy: 0 },
  T: { dx: 0, dy: -1 },
  B: { dx: 0, dy: 1 },
}

/** Direction an edge pushes its `to` endpoint, from the side hints:
 *  `a:R -- L:b` means b sits to a's right; `a:B -- T:b` means b sits below a. */
function edgeDir(e: { fromSide?: ArchSide; toSide?: ArchSide }): { dx: number; dy: number } | undefined {
  if (e.fromSide) return SIDE_DIR[e.fromSide]
  if (e.toSide) {
    const d = SIDE_DIR[e.toSide]
    return { dx: -d.dx, dy: -d.dy }
  }
  return undefined
}

/** Constraint placement on an integer grid: each hinted edge places its
 *  unplaced endpoint adjacent to the placed one along the hinted direction
 *  (sliding further along it if the cell is taken). Unconstrained items fill
 *  the first free cells row-major. Returns 0-based grid positions. */
function constraintGrid<T>(
  items: T[],
  idOf: (item: T) => string,
  edges: { from: string; to: string; fromSide?: ArchSide; toSide?: ArchSide }[],
): { pos: Map<string, { x: number; y: number }>; cols: number; rows: number } {
  const pos = new Map<string, { x: number; y: number }>()
  const taken = new Set<string>()
  const key = (x: number, y: number): string => `${x},${y}`
  const put = (id: string, x: number, y: number): void => {
    pos.set(id, { x, y })
    taken.add(key(x, y))
  }
  const putAdjacent = (id: string, base: { x: number; y: number }, dir: { dx: number; dy: number }): void => {
    let x = base.x + dir.dx
    let y = base.y + dir.dy
    while (taken.has(key(x, y))) {
      x += dir.dx
      y += dir.dy
    }
    put(id, x, y)
  }
  const ids = new Set(items.map(idOf))
  if (items.length > 0) put(idOf(items[0]), 0, 0)

  // Multi-pass so chains place regardless of edge order.
  for (let pass = 0; pass < edges.length + 1; pass++) {
    let progressed = false
    for (const e of edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) continue
      const dir = edgeDir(e) ?? { dx: 1, dy: 0 }
      const fromPos = pos.get(e.from)
      const toPos = pos.get(e.to)
      if (fromPos && !toPos) {
        putAdjacent(e.to, fromPos, dir)
        progressed = true
      } else if (toPos && !fromPos) {
        putAdjacent(e.from, toPos, { dx: -dir.dx, dy: -dir.dy })
        progressed = true
      }
    }
    if (!progressed) break
  }

  // Anything untouched by constraints: first free cell, scanning row-major
  // from the current bounding box's origin.
  for (const item of items) {
    const id = idOf(item)
    if (pos.has(id)) continue
    outer: for (let y = 0; ; y++) {
      for (let x = 0; x < Math.max(GRID_COLS, y + 2); x++) {
        if (!taken.has(key(x, y))) {
          put(id, x, y)
          break outer
        }
      }
    }
  }

  // Normalize to 0-based.
  let minX = Infinity
  let minY = Infinity
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
  }
  let cols = 0
  let rows = 0
  for (const p of pos.values()) {
    p.x -= minX
    p.y -= minY
    cols = Math.max(cols, p.x + 1)
    rows = Math.max(rows, p.y + 1)
  }
  return { pos, cols, rows }
}

export function layoutArchitecture(config: ArchitectureConfig): ArchLayout {
  const declaredGroups = config.groups ?? []
  const groupIds = new Set(declaredGroups.map((g) => g.id))
  // Buckets: each declared group, plus one implicit bucket for ungrouped
  // services (services pointing at undeclared groups land there too).
  const buckets: { id?: string; title?: string; services: ArchService[] }[] = declaredGroups.map(
    (g) => ({ id: g.id, title: g.title, services: [] }),
  )
  const loose: ArchService[] = []
  const bucketOf = new Map<string, number>()
  for (const s of config.services) {
    if (s.group !== undefined && groupIds.has(s.group)) {
      const bi = buckets.findIndex((b) => b.id === s.group)
      buckets[bi].services.push(s)
      bucketOf.set(s.id, bi)
    } else {
      loose.push(s)
    }
  }
  if (loose.length > 0) {
    buckets.push({ services: loose })
    for (const s of loose) bucketOf.set(s.id, buckets.length - 1)
  }
  const activeBuckets = buckets.filter((b) => b.services.length > 0)

  // Pass 1: place services WITHIN each bucket from the side hints of its
  // internal edges (Mermaid treats `a:R -- L:b` as "b sits right of a").
  const bucketGrids = activeBuckets.map((bucket) => {
    const mine = new Set(bucket.services.map((s) => s.id))
    const internal = config.edges.filter((e) => mine.has(e.from) && mine.has(e.to))
    return constraintGrid(bucket.services, (s) => s.id, internal)
  })

  // Pass 2: place the buckets relative to each other from cross-bucket edges.
  const crossEdges = config.edges
    .map((e) => {
      const bf = bucketOf.get(e.from)
      const bt = bucketOf.get(e.to)
      if (bf === undefined || bt === undefined || bf === bt) return undefined
      const fi = activeBuckets.indexOf(buckets[bf])
      const ti = activeBuckets.indexOf(buckets[bt])
      return { from: `b${fi}`, to: `b${ti}`, fromSide: e.fromSide, toSide: e.toSide }
    })
    .filter((e): e is NonNullable<typeof e> => e !== undefined)
  const bucketGrid = constraintGrid(activeBuckets.map((_, i) => i), (i) => `b${i}`, crossEdges)

  // Pixel assembly: bucket-grid columns/rows sized to their largest bucket.
  const bucketDims = activeBuckets.map((bucket, i) => {
    const isBox = bucket.id !== undefined
    const w = bucketGrids[i].cols * CELL_W + (isBox ? GROUP_PAD * 2 : 0)
    const h = bucketGrids[i].rows * CELL_H + (isBox ? GROUP_PAD * 2 + GROUP_TITLE_H : 0)
    return { w, h }
  })
  const colW: number[] = []
  const rowH: number[] = []
  activeBuckets.forEach((_, i) => {
    const p = bucketGrid.pos.get(`b${i}`)!
    colW[p.x] = Math.max(colW[p.x] ?? 0, bucketDims[i].w)
    rowH[p.y] = Math.max(rowH[p.y] ?? 0, bucketDims[i].h)
  })
  const colX: number[] = []
  let acc = 0
  for (let c = 0; c < bucketGrid.cols; c++) {
    colX[c] = acc
    acc += (colW[c] ?? 0) + GROUP_GAP
  }
  const rowY: number[] = []
  acc = 0
  for (let r = 0; r < bucketGrid.rows; r++) {
    rowY[r] = acc
    acc += (rowH[r] ?? 0) + GROUP_GAP
  }

  const cards: ArchCard[] = []
  const groupBoxes: ArchGroupBox[] = []
  let width = 0
  let height = 0
  activeBuckets.forEach((bucket, i) => {
    const gp = bucketGrid.pos.get(`b${i}`)!
    const isBox = bucket.id !== undefined
    const bx = colX[gp.x]
    const by = rowY[gp.y]
    const { w, h } = bucketDims[i]
    width = Math.max(width, bx + w)
    height = Math.max(height, by + h)
    if (isBox) {
      groupBoxes.push({ id: bucket.id!, title: bucket.title, x: bx, y: by, w, h })
    }
    const originX = bx + (isBox ? GROUP_PAD : 0)
    const originY = by + (isBox ? GROUP_PAD + GROUP_TITLE_H : 0)
    for (const service of bucket.services) {
      const sp = bucketGrids[i].pos.get(service.id)!
      cards.push({
        service,
        x: originX + sp.x * CELL_W + (CELL_W - CARD_W) / 2,
        y: originY + sp.y * CELL_H + (CELL_H - CARD_H) / 2,
        w: CARD_W,
        h: CARD_H,
      })
    }
  })

  return { cards, groupBoxes, width, height }
}

/** Minimal icon glyphs, centered on (0,0) in a ~26px box. */
function iconGlyph(icon: ArchIcon | undefined, stroke: string, background: string): SVGGElement {
  const g = el('g')
  const s = { fill: background, stroke, 'stroke-width': 1.5 }
  switch (icon) {
    case 'database':
      g.appendChild(el('path', { d: 'M -11 -8 A 11 4 0 0 0 11 -8 L 11 8 A 11 4 0 0 1 -11 8 Z', ...s }))
      g.appendChild(el('ellipse', { cx: 0, cy: -8, rx: 11, ry: 4, ...s }))
      break
    case 'disk':
      g.appendChild(el('path', { d: 'M -12 -4 A 12 3.5 0 0 0 12 -4 L 12 4 A 12 3.5 0 0 1 -12 4 Z', ...s }))
      g.appendChild(el('ellipse', { cx: 0, cy: -4, rx: 12, ry: 3.5, ...s }))
      break
    case 'server':
      g.appendChild(el('rect', { x: -11, y: -11, width: 22, height: 22, rx: 3, ...s }))
      g.appendChild(el('line', { x1: -11, y1: -3.5, x2: 11, y2: -3.5, stroke, 'stroke-width': 1.5 }))
      g.appendChild(el('line', { x1: -11, y1: 4, x2: 11, y2: 4, stroke, 'stroke-width': 1.5 }))
      break
    case 'internet':
      g.appendChild(el('circle', { cx: 0, cy: 0, r: 11, ...s }))
      g.appendChild(el('line', { x1: -11, y1: 0, x2: 11, y2: 0, stroke, 'stroke-width': 1.2 }))
      g.appendChild(el('ellipse', { cx: 0, cy: 0, rx: 5, ry: 11, fill: 'none', stroke, 'stroke-width': 1.2 }))
      break
    case 'cloud':
      g.appendChild(el('circle', { cx: -6, cy: 2, r: 6, ...s }))
      g.appendChild(el('circle', { cx: 6, cy: 2, r: 6, ...s }))
      g.appendChild(el('circle', { cx: 0, cy: -4, r: 7, ...s }))
      g.appendChild(el('rect', { x: -6, y: 2, width: 12, height: 6, fill: background }))
      break
    default:
      g.appendChild(el('rect', { x: -10, y: -10, width: 20, height: 20, rx: 4, ...s }))
  }
  return g
}

function anchor(card: ArchCard, side: ArchSide): { x: number; y: number } {
  switch (side) {
    case 'L':
      return { x: card.x, y: card.y + card.h / 2 }
    case 'R':
      return { x: card.x + card.w, y: card.y + card.h / 2 }
    case 'T':
      return { x: card.x + card.w / 2, y: card.y }
    case 'B':
      return { x: card.x + card.w / 2, y: card.y + card.h }
  }
}

function defaultSides(a: ArchCard, b: ArchCard): [ArchSide, ArchSide] {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['R', 'L'] : ['L', 'R']
  return dy >= 0 ? ['B', 'T'] : ['T', 'B']
}

export function buildArchitectureSvg(
  config: ArchitectureConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const L = layoutArchitecture(config)
  const pad = opts.padding
  const w = Math.max(L.width, 40) + pad * 2
  const h = Math.max(L.height, 40) + pad * 2
  const label = `Architecture diagram with ${config.services.length} services and ${config.edges.length} connections`
  const svg = svgRoot(w, h, opts, label)
  const root = el('g', { transform: `translate(${pad},${pad})` })
  svg.appendChild(root)

  // Intro: group boxes (or a placeholder so the intro is never empty).
  const intro: AnimStep = []
  for (const box of L.groupBoxes) {
    const g = el('g', {}, [
      el('rect', {
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        rx: 8,
        fill: t.noteBackground,
        'fill-opacity': 0.5,
        stroke: t.noteBorder,
      }),
    ])
    if (box.title) {
      g.appendChild(
        textEl(box.x + 12, box.y + 14, box.title, { color: t.textSecondary, size: 12, weight: '600', anchor: 'start' }),
      )
    }
    root.appendChild(g)
    intro.push({ el: g, kind: 'fade' })
  }
  if (intro.length === 0) {
    const baseline = el('line', {
      x1: 0, y1: 0, x2: Math.max(L.width, 40), y2: 0,
      stroke: t.noteBorder, 'stroke-width': 1,
    })
    root.appendChild(baseline)
    intro.push({ el: baseline, kind: 'draw' })
  }
  const animSteps: AnimStep[] = [intro]

  const edgeLayer = el('g')
  root.appendChild(edgeLayer)

  // Service cards.
  const cardById = new Map(L.cards.map((c) => [c.service.id, c]))
  const serviceSteps: AnimStep[] = []
  for (const card of L.cards) {
    const stroke = highlightColor(card.service.highlight, t) ?? t.nodeBorder
    const g = el('g', {}, [
      el('rect', {
        x: card.x,
        y: card.y,
        width: card.w,
        height: card.h,
        rx: 8,
        fill: t.nodeBackground,
        stroke,
        'stroke-width': card.service.highlight ? 2.5 : 1.5,
      }),
    ])
    const icon = iconGlyph(card.service.icon, t.nodeBorder, t.nodeBackground)
    icon.setAttribute('transform', `translate(${card.x + card.w / 2},${card.y + 24})`)
    g.appendChild(icon)
    g.appendChild(
      textEl(card.x + card.w / 2, card.y + card.h - 14, card.service.label ?? card.service.id, {
        color: t.text,
        size: 11,
      }),
    )
    root.appendChild(g)
    serviceSteps.push([{ el: g, kind: 'scale' }])
  }

  // Edges after cards (cards must exist before wires connect them).
  const edgeSteps: AnimStep[] = []
  for (const edge of config.edges) {
    const a = cardById.get(edge.from)
    const b = cardById.get(edge.to)
    if (!a || !b) continue // unknown endpoint — skipped
    const [autoFrom, autoTo] = defaultSides(a, b)
    const p0 = anchor(a, edge.fromSide ?? autoFrom)
    const p1 = anchor(b, edge.toSide ?? autoTo)
    const line = el('line', {
      x1: p0.x,
      y1: p0.y,
      x2: p1.x,
      y2: p1.y,
      stroke: t.line,
      'stroke-width': 2,
    })
    edgeLayer.appendChild(line)
    edgeSteps.push([{ el: line, kind: 'draw' }])
  }

  animSteps.push(...serviceSteps, ...edgeSteps)
  return { svg, steps: animSteps }
}

export function architecture(container: HTMLElement, config: ArchitectureConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildArchitectureSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 1)
}
