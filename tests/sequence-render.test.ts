import { describe, it, expect } from 'vitest'
import { buildSequenceSvg, sequence } from '../src/sequence/render'
import { resolveOptions, lightTheme } from '../src/theme'
import type { SequenceConfig } from '../src/types'

const CONFIG: SequenceConfig = {
  actors: [
    { id: 'user', label: 'User', type: 'actor' },
    { id: 'app', label: 'App' },
    { id: 'backend', label: 'Backend' },
  ],
  steps: [
    { from: 'user', to: 'app', text: 'Click delete' },
    { from: 'app', to: 'backend', text: 'GET usage' },
    { from: 'backend', to: 'app', text: 'Returns list', type: 'response' },
    { over: 'app', text: 'Route guard', type: 'note' },
    { from: 'app', to: 'app', text: 'self check' },
    { from: 'app', to: 'user', text: 'Done', type: 'response', highlight: true },
  ],
}

const opts = resolveOptions({ theme: 'light' })

describe('buildSequenceSvg', () => {
  const { svg, steps } = buildSequenceSvg(CONFIG, opts)

  it('produces one intro step plus one anim step per config step', () => {
    expect(steps).toHaveLength(1 + CONFIG.steps.length)
  })

  it('renders one lifeline per actor', () => {
    const lifelines = [...svg.querySelectorAll('line')].filter(
      (l) => l.getAttribute('stroke') === lightTheme.lifeline,
    )
    expect(lifelines).toHaveLength(3)
  })

  it('includes all message and note texts', () => {
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    for (const s of CONFIG.steps) expect(texts).toContain(s.text)
    expect(texts).toContain('User')
  })

  it('renders response messages with dashed stroke and response color', () => {
    const dashed = [...svg.querySelectorAll('line')].filter(
      (l) => l.getAttribute('stroke') === lightTheme.lineResponse,
    )
    expect(dashed.length).toBeGreaterThan(0)
    expect(dashed[0].getAttribute('stroke-dasharray')).toBe('6 4')
  })

  it('renders highlighted steps with the highlight color', () => {
    // lightTheme.highlight and lightTheme.lineResponse share the same hex,
    // so a built-in theme can't isolate the override — use a custom theme
    // whose highlight color is unique.
    const custom = { ...lightTheme, highlight: '#ff00aa' }
    const { svg: hsvg } = buildSequenceSvg(CONFIG, resolveOptions({ theme: custom }))
    const highlighted = [...hsvg.querySelectorAll('line')].filter(
      (l) => l.getAttribute('stroke') === '#ff00aa',
    )
    expect(highlighted).toHaveLength(1)
  })

  it('renders a note rect', () => {
    const notes = [...svg.querySelectorAll('rect')].filter(
      (r) => r.getAttribute('fill') === lightTheme.noteBackground,
    )
    expect(notes).toHaveLength(1)
  })

  it('renders self-messages as a curved path', () => {
    const curves = [...svg.querySelectorAll('path')].filter((p) =>
      (p.getAttribute('d') ?? '').includes('C'),
    )
    expect(curves.length).toBeGreaterThan(0)
  })

  it('has an aria-label describing the diagram', () => {
    expect(svg.getAttribute('aria-label')).toContain('Sequence diagram')
    expect(svg.getAttribute('aria-label')).toContain('User')
  })
})

describe('sequence()', () => {
  it('returns a controller and mounts into the container', () => {
    const container = document.createElement('div')
    const ctrl = sequence(container, { ...CONFIG, options: { trigger: 'manual' } })
    expect(container.querySelector('svg')).not.toBeNull()
    ctrl.destroy()
    expect(container.querySelector('svg')).toBeNull()
  })
})
