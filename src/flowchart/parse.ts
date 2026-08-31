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

  const ensure = (token: string): string | null => {
    const m = token.trim().match(NODE_RE)
    if (!m) return null
    const id = m[1]
    const shape = m[2] ? SHAPE_BY_OPEN[m[2]] : undefined
    const rawText = m[3]
    const nodeText = rawText?.replace(/^"(.*)"$/, '$1')
    const existing = nodes.find((n) => n.id === id)
    if (!existing) {
      nodes.push({ id, text: nodeText ?? id, shape: shape ?? 'rounded' })
    } else if (nodeText !== undefined) {
      existing.text = nodeText
      if (shape) existing.shape = shape
    }
    return id
  }

  for (const line of lines.slice(1)) {
    if (/^subgraph\b/.test(line) || line === 'end') continue // v1: grouping ignored
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

  return { type: 'flowchart', nodes, edges, direction }
}
