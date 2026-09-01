import { describe, it, expect } from 'vitest'
import { buildJourneySvg, journey, layoutJourney } from '../src/journey/render'
import { resolveOptions, lightTheme } from '../src/theme'
import type { JourneyConfig } from '../src/types'

const CFG: JourneyConfig = {
  type: 'journey',
  title: 'My working day',
  sections: [
    {
      title: 'Go to work',
      tasks: [
        { name: 'Make tea', score: 5, actors: ['Me'] },
        { name: 'Do work', score: 1, actors: ['Me', 'Cat'] },
      ],
    },
    {
      title: 'Go home',
      tasks: [{ name: 'Sit down', score: 7, actors: ['Me'], highlight: true }],
    },
  ],
}

const opts = resolveOptions({ theme: 'light', trigger: 'manual' })

describe('layoutJourney', () => {
  it('positions higher scores higher on the plot (smaller y)', () => {
    const L = layoutJourney(CFG)
    const yOf = (name: string) => L.tasks.find((t) => t.task.name === name)!.y
    expect(yOf('Sit down')).toBeLessThan(yOf('Make tea'))
    expect(yOf('Make tea')).toBeLessThan(yOf('Do work'))
  })

  it('lays sections out left to right without overlap', () => {
    const L = layoutJourney(CFG)
    expect(L.sections[0].x2).toBeLessThanOrEqual(L.sections[1].x1)
    expect(L.width).toBeGreaterThanOrEqual(L.sections[1].x2)
  })

  it('reserves title space only when a title exists', () => {
    const withTitle = layoutJourney(CFG)
    const without = layoutJourney({ ...CFG, title: undefined })
    expect(without.height).toBeLessThan(withTitle.height)
  })
})

describe('buildJourneySvg', () => {
  it('renders title, section titles, task names, and actor lines', () => {
    const { svg } = buildJourneySvg(CFG, opts)
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('My working day')
    expect(texts).toContain('Go to work')
    expect(texts).toContain('Go home')
    expect(texts).toContain('Make tea')
    expect(texts).toContain('Me, Cat')
  })

  it('emits 1 intro step + one step per task', () => {
    const { steps } = buildJourneySvg(CFG, opts)
    expect(steps).toHaveLength(1 + 3)
    expect(steps[0].length).toBeGreaterThan(0) // intro never empty, even untitled
  })

  it('colors faces by score band: happy=highlight, sad=highlightRed, neutral=nodeBackground', () => {
    const cfg: JourneyConfig = {
      sections: [
        {
          tasks: [
            { name: 'Happy', score: 6 },
            { name: 'Meh', score: 3 },
            { name: 'Sad', score: 2 },
          ],
        },
      ],
    }
    const { svg } = buildJourneySvg(cfg, opts)
    const fills = [...svg.querySelectorAll('circle')]
      .map((c) => c.getAttribute('fill'))
      .filter((f) => f !== 'none')
    expect(fills).toContain(lightTheme.highlight)
    expect(fills).toContain(lightTheme.highlightRed)
    expect(fills).toContain(lightTheme.nodeBackground)
  })

  it('draws a highlight ring for highlighted tasks', () => {
    const { svg } = buildJourneySvg(CFG, opts)
    const rings = [...svg.querySelectorAll('circle')].filter(
      (c) => c.getAttribute('fill') === 'none' && c.getAttribute('stroke') === lightTheme.highlight,
    )
    expect(rings).toHaveLength(1)
  })

  it('draws connector lines between consecutive tasks', () => {
    const { svg } = buildJourneySvg(CFG, opts)
    // 3 tasks → 2 connectors; plus 1 baseline axis line
    expect(svg.querySelectorAll('line').length).toBeGreaterThanOrEqual(3)
  })

  it('trims connectors to the face borders instead of starting at the center', () => {
    const { svg } = buildJourneySvg(CFG, opts)
    const L = layoutJourney(CFG)
    const connectors = [...svg.querySelectorAll('line')].filter(
      (l) => l.getAttribute('stroke-width') === '2',
    )
    expect(connectors.length).toBeGreaterThanOrEqual(2)
    for (const line of connectors) {
      const x1 = Number(line.getAttribute('x1'))
      const y1 = Number(line.getAttribute('y1'))
      // No connector endpoint may sit at (i.e. inside) any face center.
      for (const task of L.tasks) {
        const d = Math.hypot(x1 - task.x, y1 - task.y)
        expect(d).toBeGreaterThanOrEqual(14) // FACE_R
      }
    }
  })
})

describe('buildJourneySvg hand-config hardening', () => {
  it('renders configs with empty sections without crashing or mis-attaching bands', () => {
    const cfg: JourneyConfig = {
      sections: [
        { title: 'Leading empty', tasks: [] },
        { title: 'Full', tasks: [{ name: 'A', score: 4 }] },
        { title: 'Trailing empty', tasks: [] },
      ],
    }
    const { svg, steps } = buildJourneySvg(cfg, opts)
    expect(steps).toHaveLength(2) // intro + one task
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Full')
    // Empty sections draw no band (they have no step to appear with)
    expect(texts).not.toContain('Leading empty')
    expect(texts).not.toContain('Trailing empty')
  })

  it('treats a non-finite score as the 4 midpoint instead of emitting NaN coordinates', () => {
    const { svg } = buildJourneySvg(
      { sections: [{ tasks: [{ name: 'A', score: Number.NaN }] }] },
      opts,
    )
    expect(svg.innerHTML).not.toContain('NaN')
  })
})

describe('journey()', () => {
  it('returns a controller and renders everything with animate:false', () => {
    const container = document.createElement('div')
    const ctrl = journey(container, { ...CFG, options: { animate: false } })
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Sit down')
    ctrl.destroy()
  })

  it('describes the diagram in the svg aria-label', () => {
    const container = document.createElement('div')
    const ctrl = journey(container, { ...CFG, options: { animate: false } })
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/journey/i)
    expect(label).toContain('3')
    ctrl.destroy()
  })
})
