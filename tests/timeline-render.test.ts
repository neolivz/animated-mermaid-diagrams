import { describe, it, expect } from 'vitest'
import { buildTimelineSvg, layoutTimeline, timeline } from '../src/timeline/render'
import { resolveOptions, lightTheme } from '../src/theme'
import type { TimelineConfig } from '../src/types'

const CFG: TimelineConfig = {
  type: 'timeline',
  title: 'History of Social Media',
  sections: [
    {
      title: '2000s',
      periods: [
        { label: '2002', events: ['LinkedIn'] },
        { label: '2004', events: ['Facebook', 'Google'], highlight: true },
      ],
    },
    {
      title: '2010s',
      periods: [{ label: '2011', events: ['Snapchat'] }],
    },
  ],
}

const opts = resolveOptions({ theme: 'light', trigger: 'manual' })

describe('layoutTimeline', () => {
  it('lays sections out left to right without overlap', () => {
    const L = layoutTimeline(CFG)
    expect(L.sections[0].x2).toBeLessThanOrEqual(L.sections[1].x1)
    expect(L.width).toBeGreaterThanOrEqual(L.sections[1].x2)
  })

  it('grows the height with the deepest event stack', () => {
    const one = layoutTimeline({ sections: [{ periods: [{ label: 'A', events: ['x'] }] }] })
    const three = layoutTimeline({
      sections: [{ periods: [{ label: 'A', events: ['x', 'y', 'z'] }] }],
    })
    expect(three.height).toBeGreaterThan(one.height)
  })

  it('reserves title space only when a title exists', () => {
    const withTitle = layoutTimeline(CFG)
    const without = layoutTimeline({ ...CFG, title: undefined })
    expect(without.height).toBeLessThan(withTitle.height)
  })
})

describe('buildTimelineSvg', () => {
  it('renders title, section titles, period labels, and events', () => {
    const { svg } = buildTimelineSvg(CFG, opts)
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('History of Social Media')
    expect(texts).toContain('2000s')
    expect(texts).toContain('2010s')
    expect(texts).toContain('2004')
    expect(texts).toContain('Facebook')
    expect(texts).toContain('Google')
    expect(texts).toContain('Snapchat')
  })

  it('emits 1 intro step + one step per period', () => {
    const { steps } = buildTimelineSvg(CFG, opts)
    expect(steps).toHaveLength(1 + 3)
    expect(steps[0].length).toBeGreaterThan(0)
  })

  it('strokes highlighted period boxes with the highlight color', () => {
    const { svg } = buildTimelineSvg(CFG, opts)
    const highlighted = [...svg.querySelectorAll('rect')].filter(
      (r) => r.getAttribute('stroke') === lightTheme.highlight,
    )
    expect(highlighted.length).toBeGreaterThanOrEqual(1)
  })

  it('renders a period with no events without crashing', () => {
    const { svg, steps } = buildTimelineSvg(
      { sections: [{ periods: [{ label: '2020', events: [] }] }] },
      opts,
    )
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('2020')
    expect(steps).toHaveLength(2)
  })
})

describe('buildTimelineSvg hand-config hardening', () => {
  it('renders configs with empty sections without crashing or mis-attaching bands', () => {
    const cfg: TimelineConfig = {
      sections: [
        { title: 'Leading empty', periods: [] },
        { title: 'Full', periods: [{ label: '2020', events: ['x'] }] },
        { title: 'Trailing empty', periods: [] },
      ],
    }
    const { svg, steps } = buildTimelineSvg(cfg, opts)
    expect(steps).toHaveLength(2) // intro + one period
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Full')
    expect(texts).not.toContain('Leading empty')
    expect(texts).not.toContain('Trailing empty')
  })
})

describe('timeline()', () => {
  it('returns a controller and renders everything with animate:false', () => {
    const container = document.createElement('div')
    const ctrl = timeline(container, { ...CFG, options: { animate: false } })
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Snapchat')
    ctrl.destroy()
  })

  it('describes the diagram in the svg aria-label', () => {
    const container = document.createElement('div')
    const ctrl = timeline(container, { ...CFG, options: { animate: false } })
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/timeline/i)
    expect(label).toContain('3')
    ctrl.destroy()
  })
}
)
