import { describe, it, expect } from 'vitest'
import { architecture, buildArchitectureSvg, layoutArchitecture } from '../src/architecture/render'
import { resolveOptions, lightTheme } from '../src/theme'
import type { ArchitectureConfig } from '../src/types'

const CFG: ArchitectureConfig = {
  type: 'architecture',
  groups: [{ id: 'api', icon: 'cloud', title: 'API' }],
  services: [
    { id: 'db', icon: 'database', label: 'Database', group: 'api' },
    { id: 'disk1', icon: 'disk', label: 'Storage', group: 'api' },
    { id: 'server', icon: 'server', label: 'Server', group: 'api', highlight: true },
    { id: 'net', icon: 'internet', label: 'Gateway' },
  ],
  edges: [
    { from: 'db', to: 'server', fromSide: 'L', toSide: 'R' },
    { from: 'disk1', to: 'db', fromSide: 'T', toSide: 'B' },
    { from: 'net', to: 'server' },
  ],
}

const opts = resolveOptions({ theme: 'light', trigger: 'manual' })

describe('layoutArchitecture', () => {
  it('places every service and wraps grouped services in their group box', () => {
    const L = layoutArchitecture(CFG)
    expect(L.cards).toHaveLength(4)
    const box = L.groupBoxes[0]
    const grouped = L.cards.filter((c) => c.service.group === 'api')
    for (const c of grouped) {
      expect(c.x).toBeGreaterThanOrEqual(box.x)
      expect(c.x + c.w).toBeLessThanOrEqual(box.x + box.w)
      expect(c.y).toBeGreaterThanOrEqual(box.y)
      expect(c.y + c.h).toBeLessThanOrEqual(box.y + box.h)
    }
  })

  it('keeps cards from overlapping', () => {
    const L = layoutArchitecture(CFG)
    for (const a of L.cards) {
      for (const b of L.cards) {
        if (a === b) continue
        const apart =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
        expect(apart).toBe(true)
      }
    }
  })

  it('handles a config with no groups', () => {
    const L = layoutArchitecture({ services: [{ id: 'a' }, { id: 'b' }], edges: [] })
    expect(L.groupBoxes).toHaveLength(0)
    expect(L.cards).toHaveLength(2)
  })
})

describe('buildArchitectureSvg', () => {
  it('renders group titles and service labels', () => {
    const { svg } = buildArchitectureSvg(CFG, opts)
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('API')
    expect(texts).toContain('Database')
    expect(texts).toContain('Gateway')
  })

  it('emits 1 intro step + one per service + one per resolvable edge', () => {
    const { steps } = buildArchitectureSvg(CFG, opts)
    expect(steps).toHaveLength(1 + 4 + 3)
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })

  it('skips edges referencing unknown services', () => {
    const { steps } = buildArchitectureSvg(
      { services: [{ id: 'a' }], edges: [{ from: 'a', to: 'ghost' }] },
      opts,
    )
    expect(steps).toHaveLength(1 + 1) // intro + one service, no edge step
  })

  it('strokes highlighted service cards with the highlight color', () => {
    const { svg } = buildArchitectureSvg(CFG, opts)
    const highlighted = [...svg.querySelectorAll('rect')].filter(
      (r) => r.getAttribute('stroke') === lightTheme.highlight,
    )
    expect(highlighted.length).toBeGreaterThanOrEqual(1)
  })

  it('renders without NaN for an empty config', () => {
    const { svg, steps } = buildArchitectureSvg({ services: [], edges: [] }, opts)
    expect(svg.innerHTML).not.toContain('NaN')
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })
})

describe('architecture()', () => {
  it('returns a controller and renders everything with animate:false', () => {
    const container = document.createElement('div')
    const ctrl = architecture(container, { ...CFG, options: { animate: false } })
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Storage')
    ctrl.destroy()
  })

  it('describes the diagram in the svg aria-label', () => {
    const container = document.createElement('div')
    const ctrl = architecture(container, { ...CFG, options: { animate: false } })
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/architecture/i)
    expect(label).toContain('4')
    ctrl.destroy()
  })
})
