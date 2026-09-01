import { describe, it, expect } from 'vitest'
import { buildSankeySvg, layoutSankey, sankey } from '../src/sankey/render'
import { resolveOptions } from '../src/theme'
import type { SankeyConfig } from '../src/types'

const CFG: SankeyConfig = {
  type: 'sankey',
  links: [
    { source: 'Coal', target: 'Electricity', value: 30 },
    { source: 'Gas', target: 'Electricity', value: 20 },
    { source: 'Electricity', target: 'Homes', value: 35 },
    { source: 'Electricity', target: 'Industry', value: 15 },
    { source: 'Gas', target: 'Homes', value: 10, highlight: true },
  ],
}

const opts = resolveOptions({ theme: 'light', trigger: 'manual' })

describe('layoutSankey', () => {
  it('ranks nodes by longest path from sources', () => {
    const L = layoutSankey(CFG.links)
    const rank = (name: string) => L.nodes.find((n) => n.name === name)!.rank
    expect(rank('Coal')).toBe(0)
    expect(rank('Gas')).toBe(0)
    expect(rank('Electricity')).toBe(1)
    expect(rank('Homes')).toBe(2)
    expect(rank('Industry')).toBe(2)
  })

  it('sizes node heights proportionally to throughput', () => {
    const L = layoutSankey(CFG.links)
    const h = (name: string) => L.nodes.find((n) => n.name === name)!.h
    expect(h('Electricity')).toBeGreaterThan(h('Industry'))
    expect(h('Coal')).toBeGreaterThan(h('Gas') / 2)
  })

  it('drops links that would create a cycle, keeping the rest', () => {
    const L = layoutSankey([
      { source: 'A', target: 'B', value: 5 },
      { source: 'B', target: 'A', value: 3 },
      { source: 'B', target: 'C', value: 2 },
    ])
    expect(L.keptLinks.map((l) => [l.source, l.target])).toEqual([
      ['A', 'B'],
      ['B', 'C'],
    ])
  })

  it('handles empty links without NaN', () => {
    const L = layoutSankey([])
    expect(L.nodes).toHaveLength(0)
    expect(Number.isFinite(L.width)).toBe(true)
  })
})

describe('buildSankeySvg', () => {
  it('renders every node label', () => {
    const { svg } = buildSankeySvg(CFG, opts)
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    for (const label of ['Coal', 'Gas', 'Electricity', 'Homes', 'Industry']) {
      expect(texts).toContain(label)
    }
  })

  it('emits 1 intro step (all nodes) + one step per kept link', () => {
    const { steps } = buildSankeySvg(CFG, opts)
    expect(steps).toHaveLength(1 + 5)
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })

  it('draws one ribbon path per link with fill-opacity', () => {
    const { svg } = buildSankeySvg(CFG, opts)
    const ribbons = [...svg.querySelectorAll('path')].filter((p) => p.getAttribute('fill-opacity'))
    expect(ribbons).toHaveLength(5)
  })

  it('clamps non-finite hand-config values instead of emitting NaN', () => {
    const { svg } = buildSankeySvg(
      { links: [{ source: 'A', target: 'B', value: Number.NaN }, { source: 'B', target: 'C', value: 5 }] },
      opts,
    )
    expect(svg.innerHTML).not.toContain('NaN')
  })

  it('renders without NaN even with zero-value links', () => {
    const { svg } = buildSankeySvg(
      { links: [{ source: 'A', target: 'B', value: 0 }] },
      opts,
    )
    expect(svg.innerHTML).not.toContain('NaN')
  })
})

describe('sankey()', () => {
  it('returns a controller and renders everything with animate:false', () => {
    const container = document.createElement('div')
    const ctrl = sankey(container, { ...CFG, options: { animate: false } })
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Industry')
    ctrl.destroy()
  })

  it('describes the diagram in the svg aria-label', () => {
    const container = document.createElement('div')
    const ctrl = sankey(container, { ...CFG, options: { animate: false } })
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/sankey/i)
    expect(label).toContain('5')
    ctrl.destroy()
  })
})
