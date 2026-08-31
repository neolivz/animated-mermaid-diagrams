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
  rawItems: LayeredItem[],
  edges: LayeredEdgeIn[],
  direction: FlowDirection,
): LayeredResult {
  // Defensive: duplicate ids would corrupt the ranking maps; first one wins.
  const seenIds = new Set<string>()
  const items = rawItems.filter((i) => (seenIds.has(i.id) ? false : (seenIds.add(i.id), true)))

  // 1) Longest-path ranking via Kahn's algorithm. When a cycle starves the queue,
  //    force the lowest-declared already-reached node into its current rank
  //    (breaking one back edge) and continue, so downstream nodes still group
  //    by longest path instead of degrading to declaration order.
  const rank = new Map<string, number>()
  const incoming = new Map<string, number>(items.map((i) => [i.id, 0]))
  const out = new Map<string, string[]>(items.map((i) => [i.id, []]))
  for (const e of edges) {
    if (e.from === e.to || !incoming.has(e.from) || !incoming.has(e.to)) continue
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1)
    out.get(e.from)!.push(e.to)
  }
  const processed = new Set<string>()
  const queue = items.filter((i) => incoming.get(i.id) === 0).map((i) => i.id)
  for (const id of queue) rank.set(id, 0)
  while (processed.size < items.length) {
    let id: string | undefined = queue.shift()
    if (id === undefined) {
      const stuck =
        items.find((i) => !processed.has(i.id) && rank.has(i.id)) ??
        items.find((i) => !processed.has(i.id))!
      id = stuck.id
      if (!rank.has(id)) rank.set(id, 0)
    }
    if (processed.has(id)) continue
    processed.add(id)
    for (const next of out.get(id) ?? []) {
      if (processed.has(next)) continue // back edge into an already-placed node
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1))
      incoming.set(next, incoming.get(next)! - 1)
      if (incoming.get(next) === 0) queue.push(next)
    }
  }
  const maxRank = rank.size > 0 ? Math.max(...rank.values()) : -1

  // 2) Group into layers (dropping any empty ones), reverse for BT/RL.
  const layerCount = maxRank >= 0 ? Math.max(...rank.values()) + 1 : 0
  const raw: string[][] = Array.from({ length: layerCount }, () => [])
  for (const i of items) raw[rank.get(i.id)!].push(i.id)
  let layers = raw.filter((l) => l.length > 0)
  if (direction === 'BT' || direction === 'RL') layers = [...layers].reverse()

  // Barycenter ordering: place each node near the mean position of its
  // neighbors in the adjacent layer to reduce edge crossings (3 sweeps).
  const layerOf = new Map<string, number>()
  const indexIn = new Map<string, number>()
  layers.forEach((ids, li) => ids.forEach((id, i) => { layerOf.set(id, li); indexIn.set(id, i) }))
  const adjacency = new Map<string, string[]>(items.map((i) => [i.id, []]))
  for (const e of edges) {
    if (e.from === e.to || !adjacency.has(e.from) || !adjacency.has(e.to)) continue
    adjacency.get(e.from)!.push(e.to)
    adjacency.get(e.to)!.push(e.from)
  }
  for (let sweep = 0; sweep < 3; sweep++) {
    const downward = sweep % 2 === 0
    const indices = downward
      ? Array.from({ length: layers.length - 1 }, (_, k) => k + 1)
      : Array.from({ length: layers.length - 1 }, (_, k) => layers.length - 2 - k)
    for (const li of indices) {
      const ref = downward ? li - 1 : li + 1
      const scored = layers[li].map((id, i) => {
        const ns = (adjacency.get(id) ?? []).filter((n) => layerOf.get(n) === ref)
        const score = ns.length === 0 ? i : ns.reduce((sum, n) => sum + indexIn.get(n)!, 0) / ns.length
        return { id, score, i }
      })
      scored.sort((a, b) => a.score - b.score || a.i - b.i)
      layers[li] = scored.map((x) => x.id)
      layers[li].forEach((id, i) => indexIn.set(id, i))
    }
  }

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
