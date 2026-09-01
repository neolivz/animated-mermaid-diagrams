import { describe, it, expect } from 'vitest'
import { buildErSvg, erDiagram, erEntitySize } from '../src/er/render'
import { resolveOptions, lightTheme } from '../src/theme'
import type { ErConfig } from '../src/types'

const CFG: ErConfig = {
  type: 'er',
  entities: [
    {
      id: 'CUSTOMER',
      attributes: [
        { type: 'string', name: 'name' },
        { type: 'string', name: 'custNumber', keys: ['PK'] },
      ],
    },
    { id: 'ORDER', attributes: [{ type: 'int', name: 'orderNumber', keys: ['PK'] }], highlight: true },
    { id: 'LINE_ITEM' },
  ],
  relationships: [
    { from: 'CUSTOMER', to: 'ORDER', fromCardinality: 'exactly-one', toCardinality: 'zero-or-more', label: 'places' },
    { from: 'ORDER', to: 'LINE_ITEM', fromCardinality: 'exactly-one', toCardinality: 'one-or-more', identifying: false, label: 'contains' },
  ],
}

const opts = resolveOptions({ theme: 'light', trigger: 'manual' })

describe('erEntitySize', () => {
  it('grows with attribute count and content width', () => {
    const bare = erEntitySize({ id: 'A' })
    const tall = erEntitySize({
      id: 'A',
      attributes: [
        { type: 'string', name: 'x' },
        { type: 'string', name: 'y' },
      ],
    })
    const wide = erEntitySize({
      id: 'A',
      attributes: [{ type: 'varchar(255)', name: 'aVeryLongColumnName', keys: ['PK', 'FK'] }],
    })
    expect(tall.h).toBeGreaterThan(bare.h)
    expect(wide.w).toBeGreaterThan(bare.w)
  })
})

describe('buildErSvg', () => {
  it('renders entity titles, attribute rows, keys, and relationship labels', () => {
    const { svg } = buildErSvg(CFG, opts)
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('CUSTOMER')
    expect(texts).toContain('custNumber')
    expect(texts).toContain('PK')
    expect(texts).toContain('places')
    expect(texts).toContain('contains')
  })

  it('renders crow-foot glyph groups at both ends of each relationship', () => {
    const { svg } = buildErSvg(CFG, opts)
    // Each relationship gets two marker groups tagged with a data attribute.
    expect(svg.querySelectorAll('[data-er-marker]')).toHaveLength(4)
  })

  it('renders non-identifying relationships dashed', () => {
    const { svg } = buildErSvg(CFG, opts)
    const dashed = [...svg.querySelectorAll('path')].filter((p) => p.getAttribute('stroke-dasharray'))
    expect(dashed.length).toBeGreaterThanOrEqual(1)
  })

  it('strokes highlighted entities with the highlight color', () => {
    const { svg } = buildErSvg(CFG, opts)
    const highlighted = [...svg.querySelectorAll('rect')].filter(
      (r) => r.getAttribute('stroke') === lightTheme.highlight,
    )
    expect(highlighted.length).toBeGreaterThanOrEqual(1)
  })

  it('emits interleaved steps and never an empty one', () => {
    const { steps } = buildErSvg(CFG, opts)
    expect(steps.length).toBeGreaterThanOrEqual(3)
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })

  it('renders an entity with no attributes and a self-relationship without crashing', () => {
    const { steps } = buildErSvg(
      {
        entities: [{ id: 'EMP' }],
        relationships: [{ from: 'EMP', to: 'EMP', label: 'manages' }],
      },
      opts,
    )
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })
})

describe('erDiagram()', () => {
  it('returns a controller and renders everything with animate:false', () => {
    const container = document.createElement('div')
    const ctrl = erDiagram(container, { ...CFG, options: { animate: false } })
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('LINE_ITEM')
    ctrl.destroy()
  })

  it('describes the diagram in the svg aria-label', () => {
    const container = document.createElement('div')
    const ctrl = erDiagram(container, { ...CFG, options: { animate: false } })
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/entity.relationship/i)
    expect(label).toContain('3')
    ctrl.destroy()
  })
})
