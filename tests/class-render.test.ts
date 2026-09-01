import { describe, it, expect } from 'vitest'
import { buildClassSvg, classDiagram, classNodeSize } from '../src/class/render'
import { resolveOptions, lightTheme } from '../src/theme'
import type { ClassConfig } from '../src/types'

const CFG: ClassConfig = {
  type: 'class',
  classes: [
    { id: 'Animal', attributes: ['+String name', '+int age'], methods: ['+isMammal() bool'] },
    { id: 'Duck', attributes: ['+String beakColor'], methods: ['+swim()'], highlight: true },
    { id: 'Fish', methods: ['+canEat() bool'] },
  ],
  relations: [
    { from: 'Duck', to: 'Animal', type: 'inheritance' },
    { from: 'Fish', to: 'Animal', type: 'inheritance', label: 'kind of' },
  ],
}

const opts = resolveOptions({ theme: 'light', trigger: 'manual' })
// A trimmed path start sits one marker-length from the triangle's anchor.
const MARKER_TOLERANCE = 15

describe('classNodeSize', () => {
  it('grows with member count and width', () => {
    const small = classNodeSize({ id: 'A' })
    const tall = classNodeSize({ id: 'A', attributes: ['+a', '+b'], methods: ['+m()'] })
    const wide = classNodeSize({ id: 'A', attributes: ['+aVeryLongAttributeName: String'] })
    expect(tall.h).toBeGreaterThan(small.h)
    expect(wide.w).toBeGreaterThan(small.w)
  })

  it('reserves a line for the annotation', () => {
    const plain = classNodeSize({ id: 'A' })
    const annotated = classNodeSize({ id: 'A', annotation: '<<interface>>' })
    expect(annotated.h).toBeGreaterThan(plain.h)
  })
})

describe('buildClassSvg', () => {
  it('renders class titles and member rows', () => {
    const { svg } = buildClassSvg(CFG, opts)
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Animal')
    expect(texts).toContain('+String name')
    expect(texts).toContain('+isMammal() bool')
    expect(texts).toContain('kind of')
  })

  it('draws a hollow triangle marker for inheritance (background fill)', () => {
    const { svg } = buildClassSvg(CFG, opts)
    const triangles = [...svg.querySelectorAll('polygon')].filter(
      (p) => p.getAttribute('fill') === lightTheme.background,
    )
    expect(triangles.length).toBe(2)
  })

  it('strokes highlighted classes with the highlight color', () => {
    const { svg } = buildClassSvg(CFG, opts)
    const highlighted = [...svg.querySelectorAll('rect')].filter(
      (r) => r.getAttribute('stroke') === lightTheme.highlight,
    )
    expect(highlighted.length).toBe(1)
  })

  it('emits interleaved steps and never an empty one', () => {
    const { steps } = buildClassSvg(CFG, opts)
    expect(steps.length).toBeGreaterThanOrEqual(3) // parents, edges, children at minimum
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })

  it('renders dashed lines for dependency/realization', () => {
    const { svg } = buildClassSvg(
      {
        classes: [{ id: 'A' }, { id: 'B' }],
        relations: [{ from: 'A', to: 'B', type: 'realization' }],
      },
      opts,
    )
    const dashed = [...svg.querySelectorAll('path')].filter((p) =>
      p.getAttribute('stroke-dasharray'),
    )
    expect(dashed.length).toBeGreaterThanOrEqual(1)
  })

  it('renders cardinality labels near the ends', () => {
    const { svg } = buildClassSvg(
      {
        classes: [{ id: 'A' }, { id: 'B' }],
        relations: [{ from: 'A', to: 'B', fromCardinality: '1', toCardinality: '*' }],
      },
      opts,
    )
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('1')
    expect(texts).toContain('*')
  })

  it('draws reversed (inheritance) relations out of the parent, marker at the parent end', () => {
    const { svg } = buildClassSvg(
      {
        classes: [{ id: 'Parent' }, { id: 'Child' }],
        relations: [{ from: 'Child', to: 'Parent', type: 'inheritance' }],
      },
      opts,
    )
    // Parent ranks above Child (TB): the path must START at the parent's
    // bottom border (smaller y) so the draw animation grows out of the
    // visible parent, and the hollow triangle sits at that same end.
    const path = [...svg.querySelectorAll('path')].find((p) => p.getAttribute('fill') === 'none')!
    const nums = (path.getAttribute('d') ?? '').match(/-?[\d.]+/g)!.map(Number)
    const startY = nums[1]
    const endY = nums[nums.length - 1]
    expect(startY).toBeLessThan(endY)
    const triangle = [...svg.querySelectorAll('polygon')].find(
      (p) => p.getAttribute('fill') === lightTheme.background,
    )!
    const ty = Number(triangle.getAttribute('transform')!.match(/translate\([\d.-]+,([\d.-]+)\)/)![1])
    expect(Math.abs(ty - startY)).toBeLessThan(MARKER_TOLERANCE)
  })

  it('handles a self-relation without crashing', () => {
    const { svg, steps } = buildClassSvg(
      { classes: [{ id: 'A' }], relations: [{ from: 'A', to: 'A', label: 'self' }] },
      opts,
    )
    expect(svg.querySelectorAll('path').length).toBeGreaterThanOrEqual(1)
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })
})

describe('classDiagram()', () => {
  it('returns a controller and renders everything with animate:false', () => {
    const container = document.createElement('div')
    const ctrl = classDiagram(container, { ...CFG, options: { animate: false } })
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Duck')
    ctrl.destroy()
  })

  it('describes the diagram in the svg aria-label', () => {
    const container = document.createElement('div')
    const ctrl = classDiagram(container, { ...CFG, options: { animate: false } })
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/class diagram/i)
    expect(label).toContain('3')
    ctrl.destroy()
  })
})
