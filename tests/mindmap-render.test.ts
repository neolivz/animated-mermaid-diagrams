import { describe, it, expect } from 'vitest'
import { buildMindmapSvg, layoutMindmap, mindmap } from '../src/mindmap/render'
import { resolveOptions, lightTheme } from '../src/theme'
import type { MindmapConfig } from '../src/types'

const CFG: MindmapConfig = {
  type: 'mindmap',
  root: {
    text: 'mindmap',
    shape: 'circle',
    children: [
      { text: 'Origins', children: [{ text: 'Long history' }, { text: 'Popularisation' }] },
      { text: 'Research', children: [{ text: 'On effectiveness' }] },
      { text: 'Tools', highlight: true, children: [{ text: 'Mermaid', shape: 'square' }] },
    ],
  },
}

const opts = resolveOptions({ theme: 'light', trigger: 'manual' })

describe('layoutMindmap', () => {
  it('alternates first-level branches right and left of the root', () => {
    const L = layoutMindmap(CFG.root)
    const rootX = L.placed[0].x
    const side = (name: string) => Math.sign(L.placed.find((p) => p.node.text === name)!.x - rootX)
    expect(side('Origins')).toBe(1)
    expect(side('Research')).toBe(-1)
    expect(side('Tools')).toBe(1)
    // Children follow their branch's side
    expect(side('Long history')).toBe(1)
    expect(side('On effectiveness')).toBe(-1)
  })

  it('gives no two nodes on the same side and depth overlapping rows', () => {
    const L = layoutMindmap(CFG.root)
    const rightDepth2 = L.placed.filter((p) => p.depth === 2 && p.x > L.placed[0].x)
    const ys = rightDepth2.map((p) => p.y).sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(30)
  })

  it('handles a childless root', () => {
    const L = layoutMindmap({ text: 'Solo' })
    expect(L.placed).toHaveLength(1)
    expect(Number.isFinite(L.width)).toBe(true)
  })
})

describe('buildMindmapSvg', () => {
  it('renders every node text', () => {
    const { svg } = buildMindmapSvg(CFG, opts)
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    for (const label of ['mindmap', 'Origins', 'Long history', 'Research', 'Tools', 'Mermaid']) {
      expect(texts).toContain(label)
    }
  })

  it('emits 1 root step + one step per non-root node (7 here)', () => {
    const { steps } = buildMindmapSvg(CFG, opts)
    expect(steps).toHaveLength(1 + 7)
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })

  it('draws highlighted nodes with the highlight stroke', () => {
    const { svg } = buildMindmapSvg(CFG, opts)
    const highlighted = [...svg.querySelectorAll('rect, circle, polygon, line')].filter(
      (e) => e.getAttribute('stroke') === lightTheme.highlight,
    )
    expect(highlighted.length).toBeGreaterThanOrEqual(1)
  })

  it('renders without NaN for deep single-chain maps', () => {
    const { svg } = buildMindmapSvg(
      { root: { text: 'a', children: [{ text: 'b', children: [{ text: 'c' }] }] } },
      opts,
    )
    expect(svg.innerHTML).not.toContain('NaN')
  })
})

describe('mindmap()', () => {
  it('returns a controller and renders everything with animate:false', () => {
    const container = document.createElement('div')
    const ctrl = mindmap(container, { ...CFG, options: { animate: false } })
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Popularisation')
    ctrl.destroy()
  })

  it('describes the diagram in the svg aria-label', () => {
    const container = document.createElement('div')
    const ctrl = mindmap(container, { ...CFG, options: { animate: false } })
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/mind map/i)
    expect(label).toContain('8')
    ctrl.destroy()
  })
})
