import dagre from '@dagrejs/dagre'
import type { FlowDirection } from './types'

export interface GraphNodeIn {
  id: string
  w: number
  h: number
}

export interface GraphEdgeIn {
  from: string
  to: string
  labelW?: number
  labelH?: number
}

export interface PlacedNode {
  id: string
  /** top-left corner */
  x: number
  y: number
  w: number
  h: number
  layer: number
}

export interface PlacedEdge {
  from: string
  to: string
  /** waypoints including both endpoints, in dagre's node-border-clipped form */
  points: { x: number; y: number }[]
  /** label center, present only when labelW/labelH were supplied for this edge */
  label?: { x: number; y: number }
  sourceLayer: number
  targetLayer: number
}

export interface GraphLayoutResult {
  nodes: Map<string, PlacedNode>
  edges: PlacedEdge[]
  width: number
  height: number
  /** node ids per layer, in flow order (for animation grouping) */
  layers: string[][]
}

const NODE_SEP = 48
const RANK_SEP = 64
// Clusters within this tolerance along the flow axis are treated as one layer.
const LAYER_TOLERANCE = 1

export function graphLayout(
  rawNodes: GraphNodeIn[],
  rawEdges: GraphEdgeIn[],
  direction: FlowDirection,
): GraphLayoutResult {
  // Defensive: duplicate ids would corrupt dagre's node map; first one wins.
  const seenIds = new Set<string>()
  const nodes = rawNodes.filter((n) => (seenIds.has(n.id) ? false : (seenIds.add(n.id), true)))
  const nodeIds = new Set(nodes.map((n) => n.id))

  // Skip edges with unresolved endpoints. Self-edges are excluded from the
  // dagre graph entirely — renderers draw those with their own custom loop
  // path and only need the node's own layer for animation grouping.
  const edges = rawEdges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
  const graphEdges = edges.filter((e) => e.from !== e.to)

  if (nodes.length === 0) {
    return { nodes: new Map(), edges: [], width: 0, height: 0, layers: [] }
  }

  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({ rankdir: direction, nodesep: NODE_SEP, ranksep: RANK_SEP, marginx: 0, marginy: 0 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of nodes) g.setNode(n.id, { width: n.w, height: n.h })
  // Unique multigraph name per edge (`e${i}`) so parallel and reverse pairs
  // each get their own dagre routing — empirically verified (scratch check)
  // that dagre already routes a→b and b→a as non-overlapping point sets, so
  // no manual perpendicular offset is needed on top of this.
  graphEdges.forEach((e, i) => {
    g.setEdge(e.from, e.to, { width: e.labelW ?? 0, height: e.labelH ?? 0, labelpos: 'c' }, `e${i}`)
  })

  dagre.layout(g)

  const horizontal = direction === 'LR' || direction === 'RL'

  // Cluster node centers along the flow axis to derive layers, then order
  // clusters in flow direction: dagre's own coordinates already put the
  // source before the target along that axis for every rankdir (verified:
  // TB/LR ascending, BT/RL descending), so a single ascending sort plus a
  // conditional reverse recovers flow order.
  const centers = nodes.map((n) => {
    const gn = g.node(n.id)!
    return { id: n.id, main: horizontal ? gn.x : gn.y, cross: horizontal ? gn.y : gn.x }
  })
  // Sort by main axis first (which cluster), then cross axis (order within
  // the cluster) — dagre's own cross-axis placement already reads in visual
  // order, so this recovers left-to-right / top-to-bottom reading order.
  const sorted = [...centers].sort((a, b) => a.main - b.main || a.cross - b.cross)
  const clusters: { main: number; ids: string[] }[] = []
  for (const c of sorted) {
    const last = clusters[clusters.length - 1]
    if (last && Math.abs(c.main - last.main) <= LAYER_TOLERANCE) last.ids.push(c.id)
    else clusters.push({ main: c.main, ids: [c.id] })
  }
  const orderedClusters = direction === 'BT' || direction === 'RL' ? [...clusters].reverse() : clusters
  const layerOf = new Map<string, number>()
  orderedClusters.forEach((cl, li) => cl.ids.forEach((id) => layerOf.set(id, li)))
  const layers = orderedClusters.map((cl) => cl.ids)

  const placedNodes = new Map<string, PlacedNode>()
  for (const n of nodes) {
    const gn = g.node(n.id)!
    placedNodes.set(n.id, {
      id: n.id,
      x: gn.x - n.w / 2,
      y: gn.y - n.h / 2,
      w: n.w,
      h: n.h,
      layer: layerOf.get(n.id) ?? 0,
    })
  }

  const placedEdges: PlacedEdge[] = graphEdges.map((e, i) => {
    const el = g.edge(e.from, e.to, `e${i}`)
    const label = e.labelW && e.labelH && el.x !== undefined && el.y !== undefined
      ? { x: el.x, y: el.y }
      : undefined
    return {
      from: e.from,
      to: e.to,
      points: (el.points ?? []).map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
      label,
      sourceLayer: layerOf.get(e.from) ?? 0,
      targetLayer: layerOf.get(e.to) ?? 0,
    }
  })

  const gl = g.graph()

  return {
    nodes: placedNodes,
    edges: placedEdges,
    width: gl.width ?? 0,
    height: gl.height ?? 0,
    layers,
  }
}
