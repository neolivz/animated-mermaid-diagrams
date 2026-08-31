import { describe, it, expect } from 'vitest'
import { graphLayout, type GraphGroupIn } from '../src/graph-layout'

const box = (id: string) => ({ id, w: 100, h: 40 })

describe('graphLayout', () => {
  it('ranks a chain into consecutive layers for all four directions', () => {
    const cases: { dir: 'TB' | 'BT' | 'LR' | 'RL'; check: (a: any, b: any, c: any) => void }[] = [
      {
        dir: 'TB',
        check: (a, b, c) => {
          expect(a.y).toBeLessThan(b.y)
          expect(b.y).toBeLessThan(c.y)
        },
      },
      {
        dir: 'BT',
        check: (a, b, c) => {
          expect(a.y).toBeGreaterThan(b.y)
          expect(b.y).toBeGreaterThan(c.y)
        },
      },
      {
        dir: 'LR',
        check: (a, b, c) => {
          expect(a.x).toBeLessThan(b.x)
          expect(b.x).toBeLessThan(c.x)
        },
      },
      {
        dir: 'RL',
        check: (a, b, c) => {
          expect(a.x).toBeGreaterThan(b.x)
          expect(b.x).toBeGreaterThan(c.x)
        },
      },
    ]
    for (const { dir, check } of cases) {
      const r = graphLayout(
        [box('a'), box('b'), box('c')],
        [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
        ],
        dir,
      )
      const [a, b, c] = ['a', 'b', 'c'].map((id) => r.nodes.get(id)!)
      check(a, b, c)
      expect(r.layers).toEqual([['a'], ['b'], ['c']])
    }
  })

  it('puts diamond-graph siblings on the same layer', () => {
    const r = graphLayout(
      [box('a'), box('b'), box('c'), box('d')],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
        { from: 'c', to: 'd' },
      ],
      'TB',
    )
    const [b, c] = ['b', 'c'].map((id) => r.nodes.get(id)!)
    expect(b.y).toBe(c.y)
    expect(b.x).not.toBe(c.x)
    expect(r.nodes.get('d')!.layer).toBe(2)
  })

  it('orders children under (near) their parents', () => {
    const r = graphLayout(
      [box('a'), box('b'), box('b1'), box('a1')],
      [
        { from: 'a', to: 'a1' },
        { from: 'b', to: 'b1' },
      ],
      'TB',
    )
    expect(r.layers[1]).toEqual(['a1', 'b1']) // declaration order was [b1, a1]
  })

  it('excludes self-edges from the routed edge list', () => {
    const r = graphLayout([box('a')], [{ from: 'a', to: 'a' }], 'TB')
    expect(r.edges).toHaveLength(0)
    expect(r.nodes.get('a')!.layer).toBe(0)
  })

  it('skips edges referencing unknown node ids', () => {
    const r = graphLayout([box('a')], [{ from: 'a', to: 'ghost' }], 'TB')
    expect(r.edges).toHaveLength(0)
  })

  it('keeps the first occurrence when duplicate ids are passed', () => {
    const r = graphLayout([box('a'), { id: 'a', w: 50, h: 20 }, box('b')], [{ from: 'a', to: 'b' }], 'TB')
    expect(r.nodes.size).toBe(2)
    expect(r.nodes.get('a')!.w).toBe(100)
  })

  it('routes a reverse pair (a→b, b→a) as distinct point sets', () => {
    const r = graphLayout([box('a'), box('b')], [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ], 'TB')
    const [e0, e1] = r.edges
    expect(e0.points).not.toEqual(e1.points)
  })

  it('returns a label position when label dimensions are given', () => {
    const r = graphLayout([box('a'), box('b')], [{ from: 'a', to: 'b', labelW: 40, labelH: 20 }], 'TB')
    expect(r.edges[0].label).toBeDefined()
    expect(r.edges[0].label!.y).toBeGreaterThan(0)
  })

  it('reports total width and height covering all nodes', () => {
    const r = graphLayout([box('a'), box('b'), box('c')], [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ], 'TB')
    expect(r.width).toBeGreaterThanOrEqual(100 * 2)
    expect(r.height).toBeGreaterThanOrEqual(40 * 2)
    for (const p of r.nodes.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns no clusters and unchanged layout when no groups are supplied', () => {
    const r = graphLayout([box('a'), box('b')], [{ from: 'a', to: 'b' }], 'TB')
    expect(r.clusters).toEqual([])
    const a = r.nodes.get('a')!
    const b = r.nodes.get('b')!
    expect(a.y).toBeLessThan(b.y)
  })

  const contains = (outer: { x: number; y: number; w: number; h: number }, inner: { x: number; y: number; w: number; h: number }) => {
    expect(outer.x).toBeLessThanOrEqual(inner.x)
    expect(outer.y).toBeLessThanOrEqual(inner.y)
    expect(outer.x + outer.w).toBeGreaterThanOrEqual(inner.x + inner.w)
    expect(outer.y + outer.h).toBeGreaterThanOrEqual(inner.y + inner.h)
  }

  it('groups two nodes into one cluster containing both node rects', () => {
    const groups: GraphGroupIn[] = [{ id: 'g1' }]
    const nodeGroup = new Map([
      ['a', 'g1'],
      ['b', 'g1'],
    ])
    const r = graphLayout([box('a'), box('b')], [{ from: 'a', to: 'b' }], 'TB', groups, nodeGroup)
    expect(r.clusters).toHaveLength(1)
    const cluster = r.clusters[0]
    expect(cluster.id).toBe('g1')
    contains(cluster, r.nodes.get('a')!)
    contains(cluster, r.nodes.get('b')!)
  })

  it('nests a child cluster geometrically inside its parent cluster', () => {
    const groups: GraphGroupIn[] = [{ id: 'g1' }, { id: 'g2', parent: 'g1' }]
    const nodeGroup = new Map([
      ['a', 'g1'],
      ['b', 'g1'],
      ['c', 'g2'],
    ])
    const r = graphLayout(
      [box('a'), box('b'), box('c')],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
      'TB',
      groups,
      nodeGroup,
    )
    const g1 = r.clusters.find((c) => c.id === 'g1')!
    const g2 = r.clusters.find((c) => c.id === 'g2')!
    expect(g1).toBeDefined()
    expect(g2).toBeDefined()
    contains(g1, g2)
    contains(g2, r.nodes.get('c')!)
  })

  it('sets cluster layer to the layer of its topmost member (recursive through nesting)', () => {
    const groups: GraphGroupIn[] = [{ id: 'g1' }, { id: 'g2', parent: 'g1' }]
    const nodeGroup = new Map([
      ['a', 'g1'],
      ['b', 'g1'],
      ['c', 'g2'],
    ])
    const r = graphLayout(
      [box('a'), box('b'), box('c')],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
      'TB',
      groups,
      nodeGroup,
    )
    const g1 = r.clusters.find((c) => c.id === 'g1')!
    const g2 = r.clusters.find((c) => c.id === 'g2')!
    const a = r.nodes.get('a')!
    const b = r.nodes.get('b')!
    const c = r.nodes.get('c')!
    expect(g1.layer).toBe(Math.min(a.layer, b.layer, c.layer))
    expect(g2.layer).toBe(c.layer)
  })

  it('drops an edge whose endpoint is a group id, without throwing', () => {
    const groups: GraphGroupIn[] = [{ id: 'g1' }]
    const nodeGroup = new Map([['b', 'g1']])
    expect(() =>
      graphLayout([box('a'), box('b')], [{ from: 'a', to: 'g1' }], 'TB', groups, nodeGroup),
    ).not.toThrow()
    const r = graphLayout([box('a'), box('b')], [{ from: 'a', to: 'g1' }], 'TB', groups, nodeGroup)
    expect(r.edges).toHaveLength(0)
  })

  it('ignores a group whose id collides with a node id, leaving its members parentless', () => {
    const groups: GraphGroupIn[] = [{ id: 'b' }] // collides with node 'b'
    const nodeGroup = new Map([['a', 'b']])
    const r = graphLayout([box('a'), box('b')], [{ from: 'a', to: 'b' }], 'TB', groups, nodeGroup)
    expect(r.clusters).toEqual([])
    expect(r.nodes.size).toBe(2)
  })
})
