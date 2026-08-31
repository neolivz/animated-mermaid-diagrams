import type { FlowDirection } from './types'

export interface LayeredItem {
  id: string
  w: number
  h: number
}

export interface LayeredEdgeIn {
  from: string
  to: string
}

export interface PlacedItem {
  id: string
  /** top-left corner */
  x: number
  y: number
  w: number
  h: number
  layer: number
}

export interface LayeredResult {
  items: Map<string, PlacedItem>
  width: number
  height: number
  /** node ids per layer, in flow order */
  layers: string[][]
}

const GAP_MAIN = 64
const GAP_CROSS = 48

export function layeredLayout(
  items: LayeredItem[],
  edges: LayeredEdgeIn[],
  direction: FlowDirection,
): LayeredResult {
  // 1) Longest-path ranking via Kahn's algorithm; cycle leftovers appended below.
  const rank = new Map<string, number>()
  const incoming = new Map<string, number>(items.map((i) => [i.id, 0]))
  const out = new Map<string, string[]>(items.map((i) => [i.id, []]))
  for (const e of edges) {
    if (e.from === e.to || !incoming.has(e.from) || !incoming.has(e.to)) continue
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1)
    out.get(e.from)!.push(e.to)
  }
  const queue = items.filter((i) => incoming.get(i.id) === 0).map((i) => i.id)
  for (const id of queue) rank.set(id, 0)
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const next of out.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1))
      incoming.set(next, incoming.get(next)! - 1)
      if (incoming.get(next) === 0) queue.push(next)
    }
  }
  let maxRank = rank.size > 0 ? Math.max(...rank.values()) : -1
  for (const i of items) if (!rank.has(i.id)) rank.set(i.id, ++maxRank)

  // 2) Group into layers (dropping any empty ones), reverse for BT/RL.
  const layerCount = maxRank >= 0 ? Math.max(...rank.values()) + 1 : 0
  const raw: string[][] = Array.from({ length: layerCount }, () => [])
  for (const i of items) raw[rank.get(i.id)!].push(i.id)
  let layers = raw.filter((l) => l.length > 0)
  if (direction === 'BT' || direction === 'RL') layers = [...layers].reverse()
  const horizontal = direction === 'LR' || direction === 'RL'
  const size = new Map(items.map((i) => [i.id, i]))

  // 3) Place: main axis follows flow, cross axis is centered per layer.
  const crossExtent = (ids: string[]): number =>
    ids.reduce((s, id) => s + (horizontal ? size.get(id)!.h : size.get(id)!.w), 0) +
    GAP_CROSS * (ids.length - 1)
  const totalCross = layers.length > 0 ? Math.max(...layers.map(crossExtent)) : 0

  const placed = new Map<string, PlacedItem>()
  let main = 0
  layers.forEach((ids, layerIndex) => {
    const mainSize = Math.max(...ids.map((id) => (horizontal ? size.get(id)!.w : size.get(id)!.h)))
    let cross = (totalCross - crossExtent(ids)) / 2
    for (const id of ids) {
      const s = size.get(id)!
      placed.set(id, {
        id,
        x: horizontal ? main + (mainSize - s.w) / 2 : cross,
        y: horizontal ? cross : main + (mainSize - s.h) / 2,
        w: s.w,
        h: s.h,
        layer: layerIndex,
      })
      cross += (horizontal ? s.h : s.w) + GAP_CROSS
    }
    main += mainSize + GAP_MAIN
  })
  const totalMain = Math.max(main - GAP_MAIN, 0)

  return {
    items: placed,
    width: horizontal ? totalMain : totalCross,
    height: horizontal ? totalCross : totalMain,
    layers,
  }
}
