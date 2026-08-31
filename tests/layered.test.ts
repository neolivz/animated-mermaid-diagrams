import { describe, it, expect } from 'vitest'
import { layeredLayout } from '../src/layered'

const box = (id: string) => ({ id, w: 100, h: 40 })

describe('layeredLayout', () => {
  it('ranks a chain into consecutive layers (TB: increasing y)', () => {
    const r = layeredLayout([box('a'), box('b'), box('c')], [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ], 'TB')
    const [a, b, c] = ['a', 'b', 'c'].map((id) => r.items.get(id)!)
    expect(a.y).toBeLessThan(b.y)
    expect(b.y).toBeLessThan(c.y)
    expect(r.layers).toEqual([['a'], ['b'], ['c']])
  })

  it('puts diamond-graph siblings on the same layer', () => {
    const r = layeredLayout(
      [box('a'), box('b'), box('c'), box('d')],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
        { from: 'c', to: 'd' },
      ],
      'TB',
    )
    const [b, c] = ['b', 'c'].map((id) => r.items.get(id)!)
    expect(b.y).toBe(c.y)
    expect(b.x).not.toBe(c.x)
    expect(r.items.get('d')!.layer).toBe(2)
  })

  it('LR flows along x instead of y', () => {
    const r = layeredLayout([box('a'), box('b')], [{ from: 'a', to: 'b' }], 'LR')
    const [a, b] = ['a', 'b'].map((id) => r.items.get(id)!)
    expect(a.x).toBeLessThan(b.x)
    expect(a.y).toBe(b.y)
  })

  it('BT reverses layer order', () => {
    const r = layeredLayout([box('a'), box('b')], [{ from: 'a', to: 'b' }], 'BT')
    const [a, b] = ['a', 'b'].map((id) => r.items.get(id)!)
    expect(a.y).toBeGreaterThan(b.y)
  })

  it('terminates on cyclic graphs and places every node', () => {
    const r = layeredLayout([box('a'), box('b')], [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ], 'TB')
    expect(r.items.size).toBe(2)
  })

  it('reports total width and height covering all nodes', () => {
    const r = layeredLayout([box('a'), box('b'), box('c')], [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ], 'TB')
    expect(r.width).toBeGreaterThanOrEqual(100 * 2)
    expect(r.height).toBeGreaterThanOrEqual(40 * 2)
    for (const p of r.items.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
    }
  })
})
