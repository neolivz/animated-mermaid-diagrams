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
    { over: 'app', text: 'Router intercepts', type: 'note' },
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

  it('renders failed messages with a cross mark instead of an arrowhead', () => {
    const cfg: SequenceConfig = {
      actors: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      steps: [{ from: 'a', to: 'b', text: 'nope', failed: true }],
    }
    const { svg: fsvg } = buildSequenceSvg(cfg, opts)
    expect(fsvg.querySelectorAll('polygon')).toHaveLength(0)
    const cross = [...fsvg.querySelectorAll('path')].filter((p) => /M .* M /.test(p.getAttribute('d') ?? ''))
    expect(cross).toHaveLength(1)
  })

  it('rotates arrowheads to match message direction', () => {
    const cfg: SequenceConfig = {
      actors: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      steps: [
        { from: 'a', to: 'b', text: 'right' },
        { from: 'b', to: 'a', text: 'left' },
      ],
    }
    const { svg: dsvg } = buildSequenceSvg(cfg, opts)
    const rotations = [...dsvg.querySelectorAll('polygon')].map((p) => p.getAttribute('transform') ?? '')
    expect(rotations[0]).toContain('rotate(0)')
    expect(rotations[1]).toContain('rotate(180)')
  })

  it('message lines terminate at the arrowhead base', () => {
    const { svg: tsvg } = buildSequenceSvg(CONFIG, opts)
    const lines = [...tsvg.querySelectorAll('line')].filter(
      (l) => l.getAttribute('stroke') !== lightTheme.lifeline,
    )
    const heads = [...tsvg.querySelectorAll('polygon')]
    const lineEndX = Number(lines[0].getAttribute('x2'))
    const tipX = Number((heads[0].getAttribute('transform') ?? '').match(/translate\(([\d.e+-]+),/)![1])
    expect(Math.abs(tipX - lineEndX)).toBeCloseTo(10, 5)
  })

  it('skips steps referencing unknown actor ids without drawing at x=0', () => {
    const cfg: SequenceConfig = {
      actors: [{ id: 'a', label: 'A' }],
      steps: [
        { over: ['ghost'], text: 'lost note', type: 'note' },
        { from: 'a', to: 'ghost', text: 'lost msg' },
      ],
    }
    const { svg: gsvg, steps: gsteps } = buildSequenceSvg(cfg, opts)
    expect(gsteps).toHaveLength(3)
    const texts = [...gsvg.querySelectorAll('text')].map((n) => n.textContent)
    expect(texts).not.toContain('lost note')
    expect(texts).not.toContain('lost msg')
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

describe("advance: 'click'", () => {
  it('reveals the intro immediately and waits for a click to advance to the first message', () => {
    const container = document.createElement('div')
    const ctrl = sequence(container, { ...CONFIG, options: { advance: 'click', trigger: 'immediate' } })
    const svg = container.querySelector('svg')!

    const userText = [...svg.querySelectorAll('text')].find((t) => t.textContent === 'User')!
    const userGroup = userText.closest('g') as SVGGElement
    expect(userGroup.style.opacity).toBe('') // intro revealed immediately

    const firstMsgText = [...svg.querySelectorAll('text')].find((t) => t.textContent === CONFIG.steps[0].text)!
    expect(firstMsgText.style.opacity).toBe('0') // first message waits for a click

    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(firstMsgText.style.opacity).toBe('')

    ctrl.destroy()
  })
})
