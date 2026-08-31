import { describe, it, expect } from 'vitest'
import { buildStateSvg, stateDiagram } from '../src/state/render'
import { resolveOptions, lightTheme } from '../src/theme'
import { estimateTextWidth } from '../src/svg'
import type { StateConfig } from '../src/types'

const CONFIG: StateConfig = {
  states: [
    { id: 'idle', text: 'Idle' },
    { id: 'loading', text: 'Loading' },
    { id: 'ready', text: 'Ready' },
    { id: 'error', text: 'Error', highlight: 'red' },
  ],
  transitions: [
    { from: 'idle', to: 'loading', label: 'fetch()' },
    { from: 'loading', to: 'ready', label: 'success' },
    { from: 'loading', to: 'error', label: 'failure' },
    { from: 'error', to: 'loading', label: 'retry()' },
    { from: 'ready', to: 'idle', label: 'reset()' },
  ],
  initial: 'idle',
}

const opts = resolveOptions({ theme: 'light' })

describe('buildStateSvg', () => {
  const { svg, steps } = buildStateSvg(CONFIG, opts)

  it('renders a filled start circle', () => {
    const dots = [...svg.querySelectorAll('circle')].filter(
      (c) => c.getAttribute('fill') === lightTheme.nodeBorder,
    )
    expect(dots.length).toBeGreaterThan(0)
  })

  it('renders every state text and transition label', () => {
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    for (const s of CONFIG.states) expect(texts).toContain(s.text)
    for (const tr of CONFIG.transitions) expect(texts).toContain(tr.label)
  })

  it('renders one path per transition (plus the start connector)', () => {
    const paths = [...svg.querySelectorAll('path')].filter(
      (p) => p.getAttribute('fill') === 'none',
    )
    expect(paths.length).toBe(CONFIG.transitions.length + 1)
  })

  it('red-highlighted states use highlightRed stroke', () => {
    const red = [...svg.querySelectorAll('rect')].filter(
      (r) => r.getAttribute('stroke') === lightTheme.highlightRed,
    )
    expect(red).toHaveLength(1)
  })

  it('animates intro + one step per transition', () => {
    expect(steps).toHaveLength(1 + CONFIG.transitions.length)
  })

  it('BFS order: transitions from the initial state animate before deeper ones', () => {
    const texts = (step: typeof steps[number]) =>
      step.map((t) => t.el.textContent ?? '').join(' ')
    expect(texts(steps[1])).toContain('fetch()')
  })

  it('renders an end state as circle-in-circle when present', () => {
    const cfg: StateConfig = {
      states: [
        { id: 'a', text: 'A' },
        { id: '__end', text: '', type: 'end' },
      ],
      transitions: [{ from: 'a', to: '__end' }],
      initial: 'a',
    }
    const { svg: endSvg } = buildStateSvg(cfg, opts)
    const rings = [...endSvg.querySelectorAll('circle')].filter(
      (c) => c.getAttribute('fill') === 'none' && c.getAttribute('stroke') === lightTheme.nodeBorder,
    )
    expect(rings.length).toBeGreaterThan(0)
  })

  it('renders self-transitions as a loop path', () => {
    const cfg: StateConfig = {
      states: [{ id: 'a', text: 'A' }],
      transitions: [{ from: 'a', to: 'a', label: 'tick' }],
      initial: 'a',
    }
    const { svg: loopSvg, steps: loopSteps } = buildStateSvg(cfg, opts)
    expect([...loopSvg.querySelectorAll('text')].map((t) => t.textContent)).toContain('tick')
    expect(loopSteps).toHaveLength(2)
  })

  it('sets an aria-label', () => {
    expect(svg.getAttribute('aria-label')).toContain('State diagram')
    expect(svg.getAttribute('aria-label')).toContain('Idle')
  })

  it('bows bidirectional transition pairs apart', () => {
    const pills = [...svg.querySelectorAll('rect')].filter((r) => r.getAttribute('rx') === '4')
    const coords = pills.map((r) => `${r.getAttribute('x')},${r.getAttribute('y')}`)
    expect(new Set(coords).size).toBe(coords.length)
  })

  it('grows the canvas for long transition labels', () => {
    const long = 'transition when the user clicks retry'
    const cfg: StateConfig = {
      states: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      transitions: [{ from: 'a', to: 'b', label: long }],
      initial: 'a',
    }
    const { svg: s } = buildStateSvg(cfg, opts)
    const [, , vw] = (s.getAttribute('viewBox') ?? '').split(' ').map(Number)
    expect(vw).toBeGreaterThanOrEqual(estimateTextWidth(long, 12) + 12 + 80)
  })

  it('keeps top-row self-loops in bounds under small padding', () => {
    const cfg: StateConfig = {
      states: [{ id: 'a', text: 'A' }],
      transitions: [{ from: 'a', to: 'a', label: 'tick' }],
    }
    const { svg: s } = buildStateSvg(cfg, resolveOptions({ theme: 'light', padding: 10 }))
    const m = (s.querySelector('g')?.getAttribute('transform') ?? '').match(/translate\([\d.-]+,\s*([\d.-]+)\)/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(44) // 10 pad + 34 loop + 10 label overhang → shifted down
  })

  it('filters out empty animation steps for unresolvable transitions', () => {
    const cfg: StateConfig = {
      states: [{ id: 'a', text: 'A' }],
      transitions: [{ from: 'a', to: 'ghost' }],
      initial: 'a',
    }
    const { steps: st } = buildStateSvg(cfg, opts)
    for (const step of st) expect(step.length).toBeGreaterThan(0)
  })

  it('renders transition labels above state boxes (label layer last)', () => {
    const { svg: zsvg } = buildStateSvg(CONFIG, opts)
    const root = zsvg.querySelector('g')!
    const last = root.lastElementChild!
    expect([...last.querySelectorAll('text')].map((t) => t.textContent)).toContain('fetch()')
  })

  it('parks long back-edge labels clear of intermediate state boxes', () => {
    const { svg: zsvg } = buildStateSvg(CONFIG, opts)
    const findRectFor = (label: string): SVGRectElement => {
      const t = [...zsvg.querySelectorAll('text')].find((n) => n.textContent === label)!
      return t.previousElementSibling as SVGRectElement
    }
    const pill = findRectFor('reset()')
    const box = findRectFor('Loading')
    const a = { x: +pill.getAttribute('x')!, y: +pill.getAttribute('y')!, w: +pill.getAttribute('width')!, h: +pill.getAttribute('height')! }
    const b = { x: +box.getAttribute('x')!, y: +box.getAttribute('y')!, w: +box.getAttribute('width')!, h: +box.getAttribute('height')! }
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    expect(overlap).toBe(false)
  })

  it('places same-source fan-out labels at distinct positions (dagre routes each edge separately)', () => {
    // Previously a manual fanDy offset staggered same-y labels apart; dagre
    // now gives 'success' (loading→ready) and 'failure' (loading→error) each
    // their own edge route, so their label centers land at different x even
    // though both sit at the same rank midpoint y — assert the full position
    // differs rather than assuming which axis dagre will vary.
    const { svg: zsvg } = buildStateSvg(CONFIG, opts)
    const posOf = (label: string): string => {
      const t = [...zsvg.querySelectorAll('text')].find((n) => n.textContent === label)!
      return `${t.getAttribute('x')},${t.getAttribute('y')}`
    }
    expect(posOf('success')).not.toBe(posOf('failure'))
  })

  it('transition paths terminate at the arrowhead base', () => {
    const { svg: tsvg } = buildStateSvg(CONFIG, opts)
    const paths = [...tsvg.querySelectorAll('path')].filter((p) => p.getAttribute('fill') === 'none')
    const heads = [...tsvg.querySelectorAll('polygon')]
    const endY = Number((paths[0].getAttribute('d') ?? '').trim().split(/[\s,]+/).pop())
    const tipY = Number((heads[0].getAttribute('transform') ?? '').match(/translate\([\d.e+-]+,([\d.e+-]+)\)/)![1])
    expect(Math.abs(tipY - endY)).toBeCloseTo(10, 5)
  })

  it('draws no start dot when no initial is declared, and BFS starts from the first in-flow state', () => {
    const cfg: StateConfig = {
      states: [
        { id: 'orphan', text: 'Orphan' },
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      transitions: [{ from: 'a', to: 'b', label: 'go' }],
    }
    const { svg: s, steps: st } = buildStateSvg(cfg, opts)
    const dots = [...s.querySelectorAll('circle')].filter(
      (c) => c.getAttribute('fill') === lightTheme.nodeBorder && c.getAttribute('r') === '7',
    )
    expect(dots).toHaveLength(0)
    expect(st[0].some((t) => t.el.textContent?.includes('A'))).toBe(true)
  })
})

describe('buildStateSvg — composite state containers', () => {
  const COMPOSITE_CONFIG: StateConfig = {
    states: [
      { id: 'idle', text: 'Idle' },
      { id: 'inner', text: 'Inner', group: 'Active' },
      { id: 'done', text: 'Done', group: 'Active' },
    ],
    transitions: [
      { from: 'idle', to: 'inner' },
      { from: 'inner', to: 'done' },
    ],
    initial: 'idle',
    groups: [{ id: 'Active', title: 'Active' }],
  }

  it('renders a cluster rect that contains its member state rects, plus the title', () => {
    const { svg } = buildStateSvg(COMPOSITE_CONFIG, opts)
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Active')

    const titleText = [...svg.querySelectorAll('text')].find((t) => t.textContent === 'Active')!
    const clusterG = titleText.closest('g')!
    const clusterRect = clusterG.querySelector('rect')!
    const cluster = {
      x: +clusterRect.getAttribute('x')!,
      y: +clusterRect.getAttribute('y')!,
      w: +clusterRect.getAttribute('width')!,
      h: +clusterRect.getAttribute('height')!,
    }

    const innerText = [...svg.querySelectorAll('text')].find((t) => t.textContent === 'Inner')!
    const innerRect = innerText.previousElementSibling as SVGRectElement
    const inner = {
      x: +innerRect.getAttribute('x')!,
      y: +innerRect.getAttribute('y')!,
      w: +innerRect.getAttribute('width')!,
      h: +innerRect.getAttribute('height')!,
    }
    expect(cluster.x).toBeLessThanOrEqual(inner.x)
    expect(cluster.y).toBeLessThanOrEqual(inner.y)
    expect(cluster.x + cluster.w).toBeGreaterThanOrEqual(inner.x + inner.w)
    expect(cluster.y + cluster.h).toBeGreaterThanOrEqual(inner.y + inner.h)
  })

  it('keeps the anim step count equal to intro + one per transition, unchanged by grouping', () => {
    const { steps } = buildStateSvg(COMPOSITE_CONFIG, opts)
    expect(steps).toHaveLength(1 + COMPOSITE_CONFIG.transitions.length)
  })

  it('places the cluster chrome in the anim step where its first member state first appears', () => {
    const { steps } = buildStateSvg(COMPOSITE_CONFIG, opts)
    // 'inner' first appears in the step that carries the idle->inner transition.
    const stepWithInner = steps.findIndex((st) => st.some((item) => item.el.textContent === 'Inner'))
    expect(stepWithInner).toBeGreaterThanOrEqual(0)
    const clusterStep = steps.findIndex((st) => st.some((item) => item.el.textContent === 'Active'))
    expect(clusterStep).toBe(stepWithInner)
  })

  it('never groups the synthetic __start node even when the initial state is inside a group', () => {
    const cfg: StateConfig = {
      states: [{ id: 'inner', text: 'Inner', group: 'Active' }],
      transitions: [],
      initial: 'inner',
      groups: [{ id: 'Active', title: 'Active' }],
    }
    const { svg } = buildStateSvg(cfg, opts)
    const startDot = [...svg.querySelectorAll('circle')].find(
      (c) => c.getAttribute('fill') === lightTheme.nodeBorder && c.getAttribute('r') === '7',
    )!
    const titleText = [...svg.querySelectorAll('text')].find((t) => t.textContent === 'Active')!
    const clusterRect = titleText.closest('g')!.querySelector('rect')!
    const cluster = {
      x: +clusterRect.getAttribute('x')!,
      y: +clusterRect.getAttribute('y')!,
      w: +clusterRect.getAttribute('width')!,
      h: +clusterRect.getAttribute('height')!,
    }
    const cx = +startDot.getAttribute('cx')!
    const cy = +startDot.getAttribute('cy')!
    const inside = cx >= cluster.x && cx <= cluster.x + cluster.w && cy >= cluster.y && cy <= cluster.y + cluster.h
    expect(inside).toBe(false)
  })
})

describe('stateDiagram()', () => {
  it('mounts and returns a controller', () => {
    const container = document.createElement('div')
    const ctrl = stateDiagram(container, { ...CONFIG, options: { trigger: 'manual' } })
    expect(container.querySelector('svg')).not.toBeNull()
    ctrl.destroy()
    expect(container.querySelector('svg')).toBeNull()
  })
})
