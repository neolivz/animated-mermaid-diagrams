import type { FlowchartConfig, FlowDirection, FlowEdge, FlowNode, FlowShape } from '../types'

// Openers checked longest-first inside the regex alternation.
const NODE_RE = /^(\w+)(?:(\(\(|\(\[|\[|\(|\{)(.*?)(\)\)|\]\)|\]|\)|\}))?$/
const SHAPE_BY_OPEN: Record<string, FlowShape> = {
  '((': 'circle',
  '([': 'stadium',
  '[': 'rect',
  '(': 'rounded',
  '{': 'diamond',
}
// Two capture groups → String.split yields [node, arrow, label, node, arrow, label, node, ...]
const EDGE_SPLIT = /\s*(-\.->|==>|-->|---)\s*(?:\|([^|]*)\|)?\s*/
// `subgraph id [Title]` (explicit id) or `subgraph Title Text` (bare title,
// possibly multi-word) — the bracket form is tried first since it's the more
// specific shape.
const SUBGRAPH = /^subgraph\s+(?:(\w+)\s*\[([^\]]*)\]|(.+))$/

export function parseFlowchart(text: string): FlowchartConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  const head = (lines[0] ?? '').match(/^(?:flowchart|graph)\b\s*(TD|TB|LR|BT|RL)?/)
  if (!head) throw new Error('Not a flowchart')
  const direction: FlowDirection =
    head[1] === undefined || head[1] === 'TD' ? 'TB' : (head[1] as FlowDirection)

  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []
  const groups: { id: string; title: string; parent?: string }[] = []
  const groupStack: string[] = []

  const ensure = (token: string): string | null => {
    const m = token.trim().match(NODE_RE)
    if (!m) return null
    const id = m[1]
    const shape = m[2] ? SHAPE_BY_OPEN[m[2]] : undefined
    const rawText = m[3]
    const nodeText = rawText?.replace(/^"(.*)"$/, '$1')
    const existing = nodes.find((n) => n.id === id)
    if (!existing) {
      // Only NEWLY created nodes are tagged with the current group — a node
      // first seen outside any subgraph keeps that (no) group even if it's
      // referenced again inside one later (first-wins, mirrors ensure()'s
      // existing upsert semantics elsewhere in the parser).
      const group = groupStack[groupStack.length - 1]
      nodes.push({ id, text: nodeText ?? id, shape: shape ?? 'rounded', ...(group ? { group } : {}) })
    } else if (nodeText !== undefined) {
      existing.text = nodeText
      if (shape) existing.shape = shape
    }
    return id
  }

  for (const line of lines.slice(1)) {
    const sub = line.match(SUBGRAPH)
    if (sub) {
      let id: string
      let title: string
      if (sub[1] !== undefined) {
        id = sub[1]
        title = sub[2]
      } else {
        title = sub[3]
        // A bare title that's a single word doubles as its own id (Mermaid
        // semantics); a multi-word title gets an auto-generated id.
        id = /^\w+$/.test(title) ? title : `sg${groups.length}`
      }
      const parent = groupStack[groupStack.length - 1]
      groups.push({ id, title, ...(parent ? { parent } : {}) })
      groupStack.push(id)
      continue
    }
    if (line === 'end') {
      groupStack.pop() // stray `end` with an empty stack is silently ignored
      continue
    }
    // Quoted labels are Mermaid's escape hatch for special characters — mask
    // them so an arrow or pipe inside quotes can never split the line, then
    // restore before node/label parsing. (Unquoted arrows inside brackets
    // remain unsupported: such lines drop silently, per the v1 contract.)
    const quoted: string[] = []
    const masked = line.replace(/"[^"]*"/g, (q) => {
      quoted.push(q)
      return '\u0000' + (quoted.length - 1) + '\u0000'
    })
    const unmask = (s: string): string =>
      s.replace(/\u0000(\d+)\u0000/g, (m, i: string) => quoted[Number(i)] ?? m)
    const parts = masked.split(EDGE_SPLIT)
    if (parts.length === 1) {
      ensure(unmask(parts[0]))
      continue
    }
    for (let i = 0; i + 3 < parts.length; i += 3) {
      const from = ensure(unmask(parts[i]))
      const arrow = parts[i + 1]
      const label = parts[i + 2] === undefined ? undefined : unmask(parts[i + 2])
      const to = ensure(unmask(parts[i + 3]))
      if (from !== null && to !== null && arrow !== undefined) {
        const edge: FlowEdge = { from, to, type: arrow === '-.->' ? 'dashed' : 'solid' }
        if (label) edge.label = label.replace(/^"(.*)"$/, '$1')
        edges.push(edge)
      }
    }
  }

  // Post-parse cleanup: a group id can be used as an edge endpoint (or plain
  // node-definition line) BEFORE or AFTER its `subgraph` line is reached, so
  // ensure() may have already registered a phantom node with that id. Strip
  // any such node and any edge referencing a group id — group ids never
  // resolve to real, renderable nodes.
  const groupIds = new Set(groups.map((g) => g.id))
  const cleanNodes = groupIds.size > 0 ? nodes.filter((n) => !groupIds.has(n.id)) : nodes
  const cleanEdges =
    groupIds.size > 0 ? edges.filter((e) => !groupIds.has(e.from) && !groupIds.has(e.to)) : edges

  return {
    type: 'flowchart',
    nodes: cleanNodes,
    edges: cleanEdges,
    direction,
    ...(groups.length > 0 ? { groups } : {}),
  }
}
