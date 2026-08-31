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

export interface GraphGroupIn {
  id: string
  parent?: string
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

export interface PlacedCluster {
  id: string
  /** top-left corner */
  x: number
  y: number
  w: number
  h: number
  layer: number
}

export interface GraphLayoutResult {
  nodes: Map<string, PlacedNode>
  edges: PlacedEdge[]
  width: number
  height: number
  /** node ids per layer, in flow order (for animation grouping) */
  layers: string[][]
  /** compound cluster boxes; empty when no groups were supplied */
  clusters: PlacedCluster[]
}

const NODE_SEP = 48
const RANK_SEP = 64
// Clusters within this tolerance along the flow axis are treated as one layer.
const LAYER_TOLERANCE = 1

export function graphLayout(
  rawNodes: GraphNodeIn[],
  rawEdges: GraphEdgeIn[],
  direction: FlowDirection,
  groups?: GraphGroupIn[],
  nodeGroup?: Map<string, string>,
): GraphLayoutResult {
  // Defensive: duplicate ids would corrupt dagre's node map; first one wins.
  const seenIds = new Set<string>()
  const nodes = rawNodes.filter((n) => (seenIds.has(n.id) ? false : (seenIds.add(n.id), true)))
  const nodeIds = new Set(nodes.map((n) => n.id))

  // Defensive: a group id colliding with a node id is dropped, and any
  // nodeGroup memberships pointing at it are ignored (those nodes stay
  // parentless) — see spec Task 4.
  const validGroups = (groups ?? []).filter((gr) => !nodeIds.has(gr.id))
  const validGroupIds = new Set(validGroups.map((gr) => gr.id))
  // compound:true measurably perturbs dagre's rank spacing even for nodes
  // with no group at all (verified empirically), so it's only turned on
  // when there are groups to place — this keeps ungrouped layouts
  // byte-stable with pre-Task-4 output.
  const compound = validGroupIds.size > 0

  // Skip edges with unresolved endpoints. Self-edges are excluded from the
  // dagre graph entirely — renderers draw those with their own custom loop
  // path and only need the node's own layer for animation grouping. Edges
  // whose endpoint is a group id are dropped here too: group ids are never
  // in nodeIds, so this filter naturally excludes them (dagre throws if you
  // try to route an edge to a cluster — verified empirically).
  const edges = rawEdges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
  const graphEdges = edges.filter((e) => e.from !== e.to)

  if (nodes.length === 0) {
    return { nodes: new Map(), edges: [], width: 0, height: 0, layers: [], clusters: [] }
  }

  const g = new dagre.graphlib.Graph({ multigraph: true, compound })
  g.setGraph({ rankdir: direction, nodesep: NODE_SEP, ranksep: RANK_SEP, marginx: 0, marginy: 0 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of nodes) g.setNode(n.id, { width: n.w, height: n.h })

  if (compound) {
    for (const gr of validGroups) g.setNode(gr.id, {})
    if (nodeGroup) {
      for (const [nodeId, groupId] of nodeGroup) {
        if (nodeIds.has(nodeId) && validGroupIds.has(groupId)) g.setParent(nodeId, groupId)
      }
    }
    for (const gr of validGroups) {
      if (gr.parent && validGroupIds.has(gr.parent)) g.setParent(gr.id, gr.parent)
    }
  }

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

  // Cluster layer = min layer of member nodes, computed recursively through
  // nested groups (a parent group's layer = min over all descendant member
  // nodes).
  const childGroups = new Map<string, string[]>()
  for (const gr of validGroups) {
    if (gr.parent && validGroupIds.has(gr.parent)) {
      const siblings = childGroups.get(gr.parent) ?? []
      siblings.push(gr.id)
      childGroups.set(gr.parent, siblings)
    }
  }
  const directMembers = new Map<string, string[]>()
  if (nodeGroup) {
    for (const [nodeId, groupId] of nodeGroup) {
      if (nodeIds.has(nodeId) && validGroupIds.has(groupId)) {
        const members = directMembers.get(groupId) ?? []
        members.push(nodeId)
        directMembers.set(groupId, members)
      }
    }
  }
  const clusterLayerCache = new Map<string, number>()
  const clusterLayerOf = (groupId: string, seen: Set<string> = new Set()): number => {
    const cached = clusterLayerCache.get(groupId)
    if (cached !== undefined) return cached
    if (seen.has(groupId)) return 0 // defensive: guard against a parent cycle
    seen.add(groupId)
    let min = Infinity
    for (const nodeId of directMembers.get(groupId) ?? []) {
      const l = layerOf.get(nodeId)
      if (l !== undefined && l < min) min = l
    }
    for (const childId of childGroups.get(groupId) ?? []) {
      const l = clusterLayerOf(childId, seen)
      if (l < min) min = l
    }
    const result = min === Infinity ? 0 : min
    clusterLayerCache.set(groupId, result)
    return result
  }

  const placedClusters: PlacedCluster[] = compound
    ? validGroups.map((gr) => {
        const gn = g.node(gr.id)!
        const w = gn.width ?? 0
        const h = gn.height ?? 0
        return {
          id: gr.id,
          x: (gn.x ?? 0) - w / 2,
          y: (gn.y ?? 0) - h / 2,
          w,
          h,
          layer: clusterLayerOf(gr.id),
        }
      })
    : []

  const gl = g.graph()

  return {
    nodes: placedNodes,
    edges: placedEdges,
    width: gl.width ?? 0,
    height: gl.height ?? 0,
    layers,
    clusters: placedClusters,
  }
}
