import { describe, it, expect } from 'vitest'
import { buildPieSvg, pie, PALETTE } from '../src/pie/render'
import { resolveOptions, lightTheme } from '../src/theme'
import type { PieConfig } from '../src/types'

const CFG: PieConfig = {
  type: 'pie',
  title: 'Key elements',
  showData: true,
  slices: [
    { label: 'Calcium', value: 42.96 },
    { label: 'Potassium', value: 50.05 },
    { label: 'Magnesium', value: 10.01, highlight: true },
  ],
}

const opts = resolveOptions({ theme: 'light', trigger: 'manual' })

describe('buildPieSvg', () => {
  it('renders title, legend labels with values (showData), and percentage labels', () => {
    const { svg } = buildPieSvg(CFG, opts)
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Key elements')
    expect(texts).toContain('Calcium — 42.96')
    expect(texts.some((t) => /49%|48\.\d%/.test(t ?? ''))).toBe(true) // potassium ≈ 48.6%
  })

  it('legend omits values without showData', () => {
    const { svg } = buildPieSvg({ ...CFG, showData: undefined }, opts)
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Calcium')
    expect(texts).not.toContain('Calcium — 42.96')
  })

  it('draws one filled arc per non-zero slice, colored from the palette', () => {
    const { svg } = buildPieSvg(CFG, opts)
    const arcs = [...svg.querySelectorAll('path')].filter((p) =>
      PALETTE.includes(p.getAttribute('fill') ?? ''),
    )
    expect(arcs).toHaveLength(3)
  })

  it('emits 1 intro step + one step per slice', () => {
    const { steps } = buildPieSvg(CFG, opts)
    expect(steps).toHaveLength(1 + 3)
    expect(steps[0].length).toBeGreaterThan(0)
  })

  it('strokes highlighted slices with the highlight color', () => {
    const { svg } = buildPieSvg(CFG, opts)
    const highlighted = [...svg.querySelectorAll('path')].filter(
      (p) => p.getAttribute('stroke') === lightTheme.highlight,
    )
    expect(highlighted).toHaveLength(1)
  })

  it('renders a single 100% slice as a full circle without NaN', () => {
    const { svg } = buildPieSvg({ slices: [{ label: 'All', value: 5 }] }, opts)
    expect(svg.innerHTML).not.toContain('NaN')
    const full = [...svg.querySelectorAll('circle')].filter(
      (c) => PALETTE.includes(c.getAttribute('fill') ?? ''),
    )
    expect(full).toHaveLength(1)
  })

  it('gives 9 slices no adjacent duplicate colors at the palette wrap', () => {
    const { svg } = buildPieSvg(
      { slices: Array.from({ length: 9 }, (_, i) => ({ label: `S${i}`, value: 1 })) },
      opts,
    )
    const fills = [...svg.querySelectorAll('path')]
      .map((p) => p.getAttribute('fill'))
      .filter((f) => PALETTE.includes(f ?? ''))
    expect(fills[8]).not.toBe(fills[0]) // slice 9 sits next to slice 1 at 12 o'clock
    expect(fills[8]).not.toBe(fills[7])
  })

  it('draws no radius seam for a sliver slice next to a ~100% slice', () => {
    const { svg } = buildPieSvg(
      { slices: [{ label: 'Big', value: 1e16 }, { label: 'Tiny', value: 1 }] },
      opts,
    )
    const arcs = [...svg.querySelectorAll('path')].filter((p) =>
      PALETTE.includes(p.getAttribute('fill') ?? ''),
    )
    expect(arcs).toHaveLength(0) // big renders as a circle, sliver draws nothing
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Tiny') // legend row survives
  })

  it('renders a zero-total config with legend only and no NaN', () => {
    const { svg, steps } = buildPieSvg(
      { slices: [{ label: 'A', value: 0 }, { label: 'B', value: 0 }] },
      opts,
    )
    expect(svg.innerHTML).not.toContain('NaN')
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('A')
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })
})

describe('pie()', () => {
  it('returns a controller and renders everything with animate:false', () => {
    const container = document.createElement('div')
    const ctrl = pie(container, { ...CFG, options: { animate: false } })
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Key elements')
    ctrl.destroy()
  })

  it('describes the chart in the svg aria-label', () => {
    const container = document.createElement('div')
    const ctrl = pie(container, { ...CFG, options: { animate: false } })
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/pie chart/i)
    expect(label).toContain('3')
    ctrl.destroy()
  })
})
