import { describe, it, expect } from 'vitest'
import { parseFlowchart } from '../src/flowchart/parse'

describe('parseFlowchart', () => {
  it('parses the spec example', () => {
    const c = parseFlowchart(`
      flowchart TD
        A[Navigate to /items/id] --> B{Editable?}
        B -->|yes| C[Open editor]
        B -->|no| D[Show read-only view]
    `)
    expect(c.type).toBe('flowchart')
    expect(c.direction).toBe('TB')
    expect(c.nodes).toEqual([
      { id: 'A', text: 'Navigate to /items/id', shape: 'rect' },
      { id: 'B', text: 'Editable?', shape: 'diamond' },
      { id: 'C', text: 'Open editor', shape: 'rect' },
      { id: 'D', text: 'Show read-only view', shape: 'rect' },
    ])
    expect(c.edges).toEqual([
      { from: 'A', to: 'B', type: 'solid' },
      { from: 'B', to: 'C', label: 'yes', type: 'solid' },
      { from: 'B', to: 'D', label: 'no', type: 'solid' },
    ])
  })

  it('maps all bracket shapes', () => {
    const c = parseFlowchart(`flowchart LR
      a[rect] --> b(rounded)
      b --> c{diamond}
      c --> d([stadium])
      d --> e((circle))`)
    expect(c.nodes.map((n) => n.shape)).toEqual(['rect', 'rounded', 'diamond', 'stadium', 'circle'])
    expect(c.direction).toBe('LR')
  })

  it('parses edge styles', () => {
    const c = parseFlowchart(`flowchart TD
      a --> b
      b -.-> c
      c ==> d
      d --- e`)
    expect(c.edges.map((e) => e.type)).toEqual(['solid', 'dashed', 'solid', 'solid'])
  })

  it('parses chained edges', () => {
    const c = parseFlowchart('flowchart TD\n  a --> b --> c')
    expect(c.edges).toEqual([
      { from: 'a', to: 'b', type: 'solid' },
      { from: 'b', to: 'c', type: 'solid' },
    ])
  })

  it('strips quotes from quoted node text', () => {
    const c = parseFlowchart('flowchart TD\n  a["Some | tricky text"] --> b')
    expect(c.nodes[0].text).toBe('Some | tricky text')
  })

  it('registers standalone node definition lines', () => {
    const c = parseFlowchart('flowchart TD\n  lonely[I am alone]')
    expect(c.nodes).toEqual([{ id: 'lonely', text: 'I am alone', shape: 'rect' }])
    expect(c.edges).toEqual([])
  })

  it('silently ignores subgraph blocks but keeps their contents', () => {
    const c = parseFlowchart(`flowchart TD
      subgraph cluster one
        a --> b
      end
      b --> c`)
    expect(c.edges).toHaveLength(2)
  })

  it('defaults direction to TB when omitted or TD, supports graph keyword', () => {
    expect(parseFlowchart('graph TD\n a-->b').direction).toBe('TB')
    expect(parseFlowchart('flowchart\n a-->b').direction).toBe('TB')
  })

  it('throws on non-flowchart input', () => {
    expect(() => parseFlowchart('sequenceDiagram\nA->>B: x')).toThrow()
  })
})
