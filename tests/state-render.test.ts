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

  it('staggers labels of same-source fan-outs', () => {
    const { svg: zsvg } = buildStateSvg(CONFIG, opts)
    const yOf = (label: string): string | null =>
      [...zsvg.querySelectorAll('text')].find((n) => n.textContent === label)!.getAttribute('y')
    expect(yOf('success')).not.toBe(yOf('failure'))
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
