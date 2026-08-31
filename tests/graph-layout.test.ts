import { describe, it, expect } from 'vitest'
import { graphLayout } from '../src/graph-layout'

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
})
