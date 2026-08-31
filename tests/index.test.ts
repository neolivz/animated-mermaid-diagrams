import { describe, it, expect, vi } from 'vitest'
import { detectType } from '../src/detect'
import { render, init, sequence, flowchart, stateDiagram, lightTheme } from '../src/index'
// The public type surface is imported through the package entry (not ../src/types)
// on purpose: `npm run typecheck` covers this file, so anything dropped from
// index.ts's `export type` block fails the build here rather than silently
// disappearing from dist/index.d.ts.
import type {
  DiagramConfig,
  DiagramController,
  DiagramGroup,
  DiagramOptions,
  FlowchartConfig,
  FlowchartGroup,
  FlowDirection,
  FlowEdge,
  FlowNode,
  FlowShape,
  SequenceActivation,
  SequenceActor,
  SequenceConfig,
  SequenceFrame,
  SequenceFrameSection,
  SequenceStep,
  StateConfig,
  StateNode,
  StateTransition,
  ThemeTokens,
} from '../src/index'

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

  it('isolates failures: a bad diagram restores its pre and the rest render', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    document.body.innerHTML = `
      <pre class="animated-mermaid-diagrams">pie
"a": 1</pre>
      <pre class="animated-mermaid-diagrams">sequenceDiagram
A->>B: Hi</pre>`
    const controllers = init()
    expect(controllers).toHaveLength(1)
    expect(document.querySelectorAll('pre.animated-mermaid-diagrams')).toHaveLength(1) // bad one restored
    expect(document.querySelector('svg')).not.toBeNull()
    controllers.forEach((c) => c.destroy())
    document.body.innerHTML = ''
    spy.mockRestore()
  })

  it('renders a data-animated-mermaid attribute on any element (not just pre)', () => {
    document.body.innerHTML = `
      <div data-animated-mermaid>sequenceDiagram
A->>B: Hi</div>`
    const controllers = init()
    expect(controllers).toHaveLength(1)
    expect(document.querySelector('[data-animated-mermaid]')).toBeNull()
    expect(document.querySelector('svg')).not.toBeNull()
    controllers.forEach((c) => c.destroy())
    document.body.innerHTML = ''
  })

  it('processes a mixed page: class-form pre + data-form div + unmarked pre', () => {
    document.body.innerHTML = `
      <pre class="animated-mermaid-diagrams">sequenceDiagram
A->>B: Hi</pre>
      <div data-animated-mermaid>sequenceDiagram
A->>B: Hi</div>
      <pre class="other">not me</pre>`
    const controllers = init()
    expect(controllers).toHaveLength(2)
    expect(document.querySelector('pre.other')).not.toBeNull()
    controllers.forEach((c) => c.destroy())
    document.body.innerHTML = ''
  })

  it('renders exactly once when an element carries both the class and the attribute', () => {
    document.body.innerHTML = `
      <pre class="animated-mermaid-diagrams" data-animated-mermaid>sequenceDiagram
A->>B: Hi</pre>`
    const controllers = init()
    expect(controllers).toHaveLength(1)
    controllers.forEach((c) => c.destroy())
    document.body.innerHTML = ''
  })

  it('isolates failures for the data-attribute form too', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    document.body.innerHTML = `
      <div data-animated-mermaid>pie
"a": 1</div>
      <div data-animated-mermaid>sequenceDiagram
A->>B: Hi</div>`
    const controllers = init()
    expect(controllers).toHaveLength(1)
    expect(document.querySelectorAll('[data-animated-mermaid]')).toHaveLength(1) // bad one restored
    expect(document.querySelector('svg')).not.toBeNull()
    controllers.forEach((c) => c.destroy())
    document.body.innerHTML = ''
    spy.mockRestore()
  })
})

describe('render config validation', () => {
  it('throws a clear error for configs missing required arrays', () => {
    const container = document.createElement('div')
    expect(() => render(container, { type: 'sequence', steps: [] } as never)).toThrow(/actors/)
    expect(() =>
      render(container, { type: 'flowchart', nodes: [{ id: 'a', text: 'A' }] } as never),
    ).toThrow(/edges/)
  })
})

describe('public exports', () => {
  it('exposes the three direct renderers', () => {
    expect(typeof sequence).toBe('function')
    expect(typeof flowchart).toBe('function')
    expect(typeof stateDiagram).toBe('function')
  })

  // Every v1.1 config field must be nameable from the package entry, not just
  // structurally assignable — a consumer building frames/activations/groups in
  // a helper function needs the type to annotate it with.
  it('exposes every config type needed to hand-build a v1.1 diagram', () => {
    const section: SequenceFrameSection = { label: 'no links', fromStep: 1 }
    const frame: SequenceFrame = {
      kind: 'alt',
      label: 'item has links',
      fromStep: 0,
      toStep: 1,
      sections: [section],
      depth: 0,
    }
    const activation: SequenceActivation = { actor: 'b', fromStep: 0, toStep: 1, level: 0 }
    const actor: SequenceActor = { id: 'a', label: 'A', type: 'actor' }
    const step: SequenceStep = { from: 'a', to: 'b', text: 'x', type: 'request' }
    const seqCfg: SequenceConfig = {
      type: 'sequence',
      actors: [actor, { id: 'b', label: 'B' }],
      steps: [step, { from: 'b', to: 'a', text: 'y', type: 'response' }],
      frames: [frame],
      activations: [activation],
    }

    const group: DiagramGroup = { id: 'g', title: 'Group' }
    const flowGroup: FlowchartGroup = { id: 'inner', title: 'Inner', parent: 'g' }
    const shape: FlowShape = 'stadium'
    const direction: FlowDirection = 'LR'
    const node: FlowNode = { id: 'n1', text: 'N1', shape, group: 'inner' }
    const edge: FlowEdge = { from: 'n1', to: 'n2', label: 'e', type: 'dashed' }
    const flowCfg: FlowchartConfig = {
      type: 'flowchart',
      nodes: [node, { id: 'n2', text: 'N2', group: 'inner' }],
      edges: [edge],
      direction,
      groups: [group, flowGroup],
    }

    const stateNode: StateNode = { id: 's1', text: 'S1', highlight: 'red', group: 'g' }
    const transition: StateTransition = { from: 's1', to: 's2', label: 't' }
    const stateCfg: StateConfig = {
      type: 'state',
      states: [stateNode, { id: 's2', text: 'S2', group: 'g' }],
      transitions: [transition],
      initial: 's1',
      groups: [group],
    }

    const theme: ThemeTokens = { ...lightTheme }
    const options: DiagramOptions = { theme, trigger: 'manual', animate: false }
    const configs: DiagramConfig[] = [seqCfg, flowCfg, stateCfg]

    const controllers: DiagramController[] = configs.map((cfg) =>
      render(document.createElement('div'), cfg, options),
    )
    expect(controllers).toHaveLength(3)
    controllers.forEach((c) => c.destroy())
  })

  it('renders the container chrome from hand-built groups (no Mermaid text)', () => {
    const container = document.createElement('div')
    const cfg: FlowchartConfig = {
      type: 'flowchart',
      nodes: [
        { id: 'a', text: 'A', group: 'val' },
        { id: 'b', text: 'B', group: 'val' },
      ],
      edges: [{ from: 'a', to: 'b' }],
      groups: [{ id: 'val', title: 'Validation' }],
      options: { animate: false },
    }
    const ctrl = flowchart(container, cfg)
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Validation')
    ctrl.destroy()
  })
})
