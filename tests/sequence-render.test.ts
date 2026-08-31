import { describe, it, expect } from 'vitest'
import { buildSequenceSvg, sequence } from '../src/sequence/render'
import { parseSequence } from '../src/sequence/parse'
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

const FRAME_CONFIG: SequenceConfig = {
  actors: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  steps: [
    { from: 'a', to: 'b', text: 'first' },
    { from: 'b', to: 'a', text: 'second' },
  ],
  frames: [
    {
      kind: 'alt',
      label: 'happy path',
      fromStep: 0,
      toStep: 1,
      sections: [{ label: 'sad', fromStep: 1 }],
      depth: 0,
    },
  ],
  activations: [{ actor: 'b', fromStep: 0, toStep: 1, level: 0 }],
}

describe('buildSequenceSvg — frames and activations', () => {
  it('keeps the anim step count invariant at 1 + steps.length with frames and activations present', () => {
    const { steps } = buildSequenceSvg(FRAME_CONFIG, opts)
    expect(steps).toHaveLength(1 + FRAME_CONFIG.steps.length)
  })

  it('renders a frame rect and header tab with correct tokens and kind text', () => {
    const { svg } = buildSequenceSvg(FRAME_CONFIG, opts)
    const frameRect = [...svg.querySelectorAll('rect')].find(
      (r) =>
        r.getAttribute('fill') === 'none' &&
        r.getAttribute('stroke') === lightTheme.noteBorder &&
        r.getAttribute('rx') === '4',
    )
    expect(frameRect).toBeTruthy()

    const tabRect = [...svg.querySelectorAll('rect')].find(
      (r) =>
        r.getAttribute('fill') === lightTheme.noteBackground &&
        r.getAttribute('stroke') === lightTheme.noteBorder &&
        r.getAttribute('height') === '18',
    )
    expect(tabRect).toBeTruthy()

    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('alt')
    expect(texts.some((t) => (t ?? '').includes('happy path'))).toBe(true)
  })

  it('renders one section divider line per total sections', () => {
    const { svg } = buildSequenceSvg(FRAME_CONFIG, opts)
    const dividers = [...svg.querySelectorAll('line')].filter(
      (l) => l.getAttribute('stroke-dasharray') === '4 3',
    )
    expect(dividers).toHaveLength(1)
  })

  it('groups frame chrome into the anim step at fromStep + 1', () => {
    const { steps } = buildSequenceSvg(FRAME_CONFIG, opts)
    const group = steps[FRAME_CONFIG.frames![0].fromStep + 1]
    const hasAlt = group.some((item) => (item.el.textContent ?? '').includes('alt'))
    expect(hasAlt).toBe(true)
  })

  it('renders an activation bar with width 10 in its opening step group', () => {
    const { svg, steps } = buildSequenceSvg(FRAME_CONFIG, opts)
    const bar = [...svg.querySelectorAll('rect')].find((r) => r.getAttribute('width') === '10')
    expect(bar).toBeTruthy()

    const act = FRAME_CONFIG.activations![0]
    const group = steps[act.fromStep + 1]
    expect(group.some((item) => item.el === bar)).toBe(true)
  })

  it('paints nested frame chrome outermost-first so the outer <g> precedes the inner in document order', () => {
    const cfg = parseSequence(`sequenceDiagram
      A->>B: pre
      alt happy path
        B-->>A: ok
        opt logging
          B->>B: log
        end
      else sad
        B-->>A: fail
      end
      A->>B: post`)
    const { svg } = buildSequenceSvg(cfg, opts)
    const altText = [...svg.querySelectorAll('text')].find((t) => t.textContent === 'alt')!
    const optText = [...svg.querySelectorAll('text')].find((t) => t.textContent === 'opt')!
    const outerG = altText.closest('g') as SVGGElement
    const innerG = optText.closest('g') as SVGGElement
    expect(outerG.compareDocumentPosition(innerG) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
