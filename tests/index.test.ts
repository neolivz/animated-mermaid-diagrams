import { describe, it, expect } from 'vitest'
import { detectType } from '../src/detect'
import { render, init, sequence, flowchart, stateDiagram } from '../src/index'

describe('detectType', () => {
  it('detects all three v1 types', () => {
    expect(detectType('sequenceDiagram\nA->>B: x')).toBe('sequence')
    expect(detectType('  flowchart TD\n  a-->b')).toBe('flowchart')
    expect(detectType('graph LR\n a-->b')).toBe('flowchart')
    expect(detectType('stateDiagram-v2\nA --> B')).toBe('state')
  })

  it('skips comments and blank lines before the header', () => {
    expect(detectType('\n%% hello\n\nsequenceDiagram\nA->>B: x')).toBe('sequence')
  })

  it('throws on unknown input', () => {
    expect(() => detectType('pie\n"a": 1')).toThrow(/Unsupported|Unknown/)
  })
})

describe('render with mermaid text', () => {
  it.each([
    ['sequenceDiagram\nA->>B: hello', 'sequence'],
    ['flowchart TD\na[Start] --> b[End]', 'flowchart'],
    ['stateDiagram-v2\n[*] --> Idle\nIdle --> Done', 'state'],
  ])('renders %s → svg', (text) => {
    const container = document.createElement('div')
    const ctrl = render(container, text, { trigger: 'manual' })
    expect(container.querySelector('svg')).not.toBeNull()
    ctrl.destroy()
  })

  it('passes options through (animate:false renders final state)', () => {
    const container = document.createElement('div')
    render(container, 'sequenceDiagram\nA->>B: hello', { animate: false })
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('hello')
  })
})

describe('render with JS config', () => {
  it('dispatches on type field', () => {
    const container = document.createElement('div')
    const ctrl = render(container, {
      type: 'flowchart',
      nodes: [{ id: 'a', text: 'A' }],
      edges: [],
      options: { trigger: 'manual' },
    })
    expect(container.querySelector('svg')).not.toBeNull()
    ctrl.destroy()
  })

  it('second-arg options override config options', () => {
    const container = document.createElement('div')
    let called = false
    render(
      container,
      {
        type: 'sequence',
        actors: [{ id: 'a', label: 'A' }],
        steps: [{ from: 'a', to: 'a', text: 'x' }],
        options: { trigger: 'onScroll' },
      },
      { trigger: 'immediate', animate: false, onComplete: () => { called = true } },
    )
    // animate:false + immediate → content visible without scrolling
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('x')
    expect(called).toBe(false) // showAll path does not fire onComplete
  })

  it('infers type from shape when type field is missing', () => {
    const container = document.createElement('div')
    const ctrl = render(container, {
      states: [{ id: 'a', text: 'A' }],
      transitions: [],
      options: { trigger: 'manual' },
    })
    expect(container.querySelector('svg')).not.toBeNull()
    ctrl.destroy()
  })
})

describe('init()', () => {
  it('replaces pre.animated-mermaid-diagrams elements with rendered diagrams', () => {
    document.body.innerHTML = `
      <pre class="animated-mermaid-diagrams">sequenceDiagram
A->>B: Hi</pre>
      <pre class="other">not me</pre>`
    const controllers = init()
    expect(controllers).toHaveLength(1)
    expect(document.querySelectorAll('pre.animated-mermaid-diagrams')).toHaveLength(0)
    expect(document.querySelector('svg')).not.toBeNull()
    expect(document.querySelector('pre.other')).not.toBeNull()
    controllers.forEach((c) => c.destroy())
    document.body.innerHTML = ''
  })
})

describe('public exports', () => {
  it('exposes the three direct renderers', () => {
    expect(typeof sequence).toBe('function')
    expect(typeof flowchart).toBe('function')
    expect(typeof stateDiagram).toBe('function')
  })
})
