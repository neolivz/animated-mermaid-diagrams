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

  it('captures subgraph blocks as groups and tags their inner nodes', () => {
    const c = parseFlowchart(`flowchart TD
      subgraph cluster one
        a --> b
      end
      b --> c`)
    expect(c.edges).toHaveLength(2)
    expect(c.groups).toEqual([{ id: 'sg0', title: 'cluster one' }])
    expect(c.nodes.find((n) => n.id === 'a')?.group).toBe('sg0')
    expect(c.nodes.find((n) => n.id === 'b')?.group).toBe('sg0')
    expect(c.nodes.find((n) => n.id === 'c')?.group).toBeUndefined()
  })

  it('parses "subgraph id [Title]" form with an explicit id distinct from its title', () => {
    const c = parseFlowchart(`flowchart TD
      subgraph sub1 [My Group]
        a --> b
      end`)
    expect(c.groups).toEqual([{ id: 'sub1', title: 'My Group' }])
    expect(c.nodes.find((n) => n.id === 'a')?.group).toBe('sub1')
  })

  it('uses a bare single-word subgraph title as both id and title', () => {
    const c = parseFlowchart(`flowchart TD
      subgraph Group1
        a --> b
      end`)
    expect(c.groups).toEqual([{ id: 'Group1', title: 'Group1' }])
    expect(c.nodes.find((n) => n.id === 'a')?.group).toBe('Group1')
  })

  it('nests subgraphs and records parent links', () => {
    const c = parseFlowchart(`flowchart TD
      subgraph Outer
        subgraph Inner
          a --> b
        end
        c --> a
      end`)
    expect(c.groups).toEqual([
      { id: 'Outer', title: 'Outer' },
      { id: 'Inner', title: 'Inner', parent: 'Outer' },
    ])
    expect(c.nodes.find((n) => n.id === 'a')?.group).toBe('Inner')
    expect(c.nodes.find((n) => n.id === 'b')?.group).toBe('Inner')
    expect(c.nodes.find((n) => n.id === 'c')?.group).toBe('Outer')
  })

  it('ignores a stray end with an empty group stack', () => {
    const c = parseFlowchart(`flowchart TD
      a --> b
      end
      b --> c`)
    expect(c.edges).toHaveLength(2)
    expect(c.groups).toBeUndefined()
  })

  it('assigns the group of a newly created node only — first-wins for repeat references', () => {
    const c = parseFlowchart(`flowchart TD
      a --> b
      subgraph Group1
        b --> c
      end`)
    // b was created outside any group on the first line, so it keeps no group
    // even though it's referenced again inside Group1.
    expect(c.nodes.find((n) => n.id === 'b')?.group).toBeUndefined()
    expect(c.nodes.find((n) => n.id === 'c')?.group).toBe('Group1')
  })

  it('does not emit a groups key when no subgraphs are present', () => {
    const c = parseFlowchart('flowchart TD\n a-->b')
    expect(c.groups).toBeUndefined()
  })

  it('post-parse: drops a node and its edges when a node id collides with a group id used before declaration', () => {
    const c = parseFlowchart(`flowchart TD
      a --> Group1
      subgraph Group1
        x --> y
      end`)
    // 'Group1' was used as an edge endpoint before its subgraph declared it as
    // a group id; ensure() would otherwise have created a phantom node for it.
    expect(c.nodes.find((n) => n.id === 'Group1')).toBeUndefined()
    expect(c.edges.some((e) => e.from === 'Group1' || e.to === 'Group1')).toBe(false)
    expect(c.groups).toEqual([{ id: 'Group1', title: 'Group1' }])
  })

  it('post-parse: strips an edge that references a group id declared earlier', () => {
    const c = parseFlowchart(`flowchart TD
      subgraph Group1
        x --> y
      end
      a --> Group1`)
    expect(c.edges.some((e) => e.from === 'Group1' || e.to === 'Group1')).toBe(false)
    expect(c.nodes.find((n) => n.id === 'Group1')).toBeUndefined()
  })

  it('defaults direction to TB when omitted or TD, supports graph keyword', () => {
    expect(parseFlowchart('graph TD\n a-->b').direction).toBe('TB')
    expect(parseFlowchart('flowchart\n a-->b').direction).toBe('TB')
  })

  it('throws on non-flowchart input', () => {
    expect(() => parseFlowchart('sequenceDiagram\nA->>B: x')).toThrow()
  })

  it('protects quoted labels containing arrows from the edge splitter', () => {
    const c = parseFlowchart('flowchart TD\n  a["go --> there"] --> b')
    expect(c.nodes[0]).toEqual({ id: 'a', text: 'go --> there', shape: 'rect' })
    expect(c.edges).toEqual([{ from: 'a', to: 'b', type: 'solid' }])
  })

  it('degrades safely on unsupported fan-out syntax (a --> b & c)', () => {
    const c = parseFlowchart('flowchart TD\n  a --> b & c')
    expect(c.nodes.map((n) => n.id)).toEqual(['a'])
    expect(c.edges).toEqual([])
  })

  it('does not corrupt node text containing literal NUL bytes around digits', () => {
    const nul = String.fromCharCode(0)
    const c = parseFlowchart(`flowchart TD\n  a[item ${nul}0${nul} ok] --> b`)
    expect(c.nodes[0].text).toBe(`item ${nul}0${nul} ok`)
  })

  it('strips surrounding quotes from edge labels', () => {
    const c = parseFlowchart('flowchart TD\n  a -->|"weird | label"| b')
    expect(c.edges[0]).toEqual({ from: 'a', to: 'b', label: 'weird | label', type: 'solid' })
  })
})
