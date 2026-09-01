import { describe, it, expect, vi } from 'vitest'
import { detectType } from '../src/detect'
import {
  render,
  init,
  sequence,
  flowchart,
  stateDiagram,
  journey,
  timeline,
  classDiagram,
  erDiagram,
  pie,
  gantt,
  lightTheme,
  darkTheme,
} from '../src/index'
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
  JourneyConfig,
  JourneySection,
  JourneyTask,
  TimelineConfig,
  TimelineSection,
  TimelinePeriod,
  ClassConfig,
  ClassNode,
  ClassRelation,
  ClassRelationType,
  ErConfig,
  ErEntity,
  ErAttribute,
  ErRelationship,
  ErCardinality,
  ErKey,
  PieConfig,
  PieSlice,
  GanttConfig,
  GanttSection,
  GanttTask,
  GanttStatus,
  ThemeTokens,
} from '../src/index'

describe('detectType', () => {
  it('detects pie and gantt headers', () => {
    expect(detectType('pie showData\ntitle X\n"A" : 1')).toBe('pie')
    expect(detectType('gantt\ntitle X')).toBe('gantt')
  })

  it('detects all seven pre-0.5 types', () => {
    expect(detectType('sequenceDiagram\nA->>B: x')).toBe('sequence')
    expect(detectType('  flowchart TD\n  a-->b')).toBe('flowchart')
    expect(detectType('graph LR\n a-->b')).toBe('flowchart')
    expect(detectType('stateDiagram-v2\nA --> B')).toBe('state')
    expect(detectType('journey\ntitle Day\nsection S\nA: 4: Me')).toBe('journey')
    expect(detectType('timeline\ntitle History\n2002 : LinkedIn')).toBe('timeline')
    expect(detectType('classDiagram\nA <|-- B')).toBe('class')
    expect(detectType('erDiagram\nA ||--o{ B : has')).toBe('er')
  })

  it('skips comments and blank lines before the header', () => {
    expect(detectType('\n%% hello\n\nsequenceDiagram\nA->>B: x')).toBe('sequence')
  })

  it('throws on unknown input', () => {
    expect(() => detectType('mindmap\nroot')).toThrow(/Unsupported|Unknown/)
  })
})

describe('render with mermaid text', () => {
  it.each([
    ['sequenceDiagram\nA->>B: hello', 'sequence'],
    ['flowchart TD\na[Start] --> b[End]', 'flowchart'],
    ['stateDiagram-v2\n[*] --> Idle\nIdle --> Done', 'state'],
    ['journey\ntitle Day\nsection S\nWake: 3: Me', 'journey'],
    ['timeline\ntitle History\n2002 : LinkedIn', 'timeline'],
    ['classDiagram\nAnimal <|-- Duck\nAnimal : +int age', 'class'],
    ['erDiagram\nCUSTOMER ||--o{ ORDER : places', 'er'],
    ['pie\ntitle P\n"A" : 1\n"B" : 2', 'pie'],
    ['gantt\ndateFormat YYYY-MM-DD\nsection S\nT : 2024-01-01, 2d', 'gantt'],
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

  it('routes a mixed-section config by its first section without crashing', () => {
    const container = document.createElement('div')
    // Deliberately not a valid DiagramConfig (mixed section shapes) — the
    // point is that runtime routing stays graceful, hence the cast.
    const ctrl = render(container, {
      sections: [
        { periods: [{ label: '2020', events: ['x'] }] },
        { tasks: [{ name: 'stray', score: 4 }] },
      ],
      options: { animate: false },
    } as unknown as DiagramConfig)
    // First section is periods-shaped → timeline; the tasks-shaped section is
    // tolerated as empty rather than crashing the renderer.
    const texts = [...container.querySelectorAll('text')].map((e) => e.textContent)
    expect(texts).toContain('2020')
    expect(texts).not.toContain('stray')
    ctrl.destroy()
  })

  it('tells journey and gantt apart by the first task fields when type is missing', () => {
    const cj = document.createElement('div')
    const j = render(cj, {
      sections: [{ tasks: [{ name: 'Scored', score: 5 }] }],
      options: { animate: false },
    })
    // journey renders actor/score plot; its task label is present
    expect([...cj.querySelectorAll('text')].map((e) => e.textContent)).toContain('Scored')

    const cg = document.createElement('div')
    const g = render(cg, {
      sections: [{ tasks: [{ name: 'Timed', start: '2024-01-01', durationDays: 2 }] }],
      options: { animate: false },
    })
    // gantt renders a date axis — tick labels like "01-01" only exist there
    const ganttTexts = [...cg.querySelectorAll('text')].map((e) => e.textContent)
    expect(ganttTexts).toContain('Timed')
    expect(ganttTexts.some((t) => /^\d{2}-\d{2}$/.test(t ?? ''))).toBe(true)
    j.destroy()
    g.destroy()
  })

  it('tells journey and timeline apart by section contents when type is missing', () => {
    const j = render(document.createElement('div'), {
      sections: [{ tasks: [{ name: 'A', score: 4 }] }],
      options: { animate: false },
    })
    const containerT = document.createElement('div')
    const t = render(containerT, {
      sections: [{ periods: [{ label: '2020', events: ['x'] }] }],
      options: { animate: false },
    })
    expect([...containerT.querySelectorAll('text')].map((e) => e.textContent)).toContain('2020')
    j.destroy()
    t.destroy()
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
      <pre class="animated-mermaid-diagrams">mindmap
root</pre>
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
      <div data-animated-mermaid>mindmap
root</div>
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

describe('init() declarative per-element options (data-amd-*)', () => {
  it('data-amd-animate="false" renders final state immediately', () => {
    document.body.innerHTML = `
      <div data-animated-mermaid data-amd-animate="false">sequenceDiagram
A->>B: hello</div>`
    const controllers = init()
    const texts = [...document.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('hello')
    controllers.forEach((c) => c.destroy())
    document.body.innerHTML = ''
  })

  it('data-amd-trigger="manual" stays hidden until the returned controller plays it', () => {
    document.body.innerHTML = `
      <div data-animated-mermaid data-amd-trigger="manual">sequenceDiagram
A->>B: hello</div>`
    const controllers = init()
    expect(controllers).toHaveLength(1)
    const svg = document.querySelector('svg')!
    const rootGroup = svg.querySelector('g')!
    const firstTarget = rootGroup.querySelector('g') as SVGGElement
    expect(firstTarget.style.opacity).toBe('0')
    controllers[0].play()
    expect(firstTarget.style.opacity).toBe('')
    controllers.forEach((c) => c.destroy())
    document.body.innerHTML = ''
  })

  it('marker shorthand data-animated-mermaid="click" advances one step per click; explicit data-amd-advance="auto" overrides the shorthand', () => {
    document.body.innerHTML = `
      <div data-animated-mermaid="click">sequenceDiagram
A->>B: one
A->>B: two</div>
      <div data-animated-mermaid="click" data-amd-advance="auto">sequenceDiagram
A->>B: one
A->>B: two</div>`
    const controllers = init()
    expect(controllers).toHaveLength(2)
    const [clickSvg, autoSvg] = [...document.querySelectorAll('svg')]

    // shorthand alone → click mode: svg is a slider, advances one step per click
    expect(clickSvg.getAttribute('role')).toBe('slider')
    expect(clickSvg.getAttribute('aria-valuenow')).toBe('0')
    clickSvg.dispatchEvent(new Event('click'))
    expect(clickSvg.getAttribute('aria-valuenow')).toBe('1')

    // explicit data-amd-advance="auto" wins over the shorthand → not click mode
    expect(autoSvg.getAttribute('role')).not.toBe('slider')

    controllers.forEach((c) => c.destroy())
    document.body.innerHTML = ''
  })

  it('numeric option data-amd-step-duration="5" is accepted without crashing', () => {
    document.body.innerHTML = `
      <div data-animated-mermaid data-amd-step-duration="5">sequenceDiagram
A->>B: hello</div>`
    const controllers = init()
    expect(controllers).toHaveLength(1)
    expect(document.querySelector('svg')).not.toBeNull()
    controllers.forEach((c) => c.destroy())
    document.body.innerHTML = ''
  })

  it('invalid attribute values are silently ignored, falling back to defaults', () => {
    document.body.innerHTML = `
      <div data-animated-mermaid data-amd-trigger="bogus" data-amd-step-delay="abc">sequenceDiagram
A->>B: hello</div>`
    expect(() => init()).not.toThrow()
    expect(document.querySelector('svg')).not.toBeNull()
    document.querySelectorAll('svg').forEach((s) => s.remove())
    document.body.innerHTML = ''
  })

  it('class-form pre with data-amd-theme="dark" uses the dark theme background token', () => {
    document.body.innerHTML = `
      <pre class="animated-mermaid-diagrams" data-amd-theme="dark">sequenceDiagram
A->>B: hello</pre>`
    const controllers = init()
    const rect = document.querySelector('svg rect')
    expect(rect?.getAttribute('fill')).toBe(darkTheme.background)
    controllers.forEach((c) => c.destroy())
    document.body.innerHTML = ''
  })

  it('init(document, defaults) applies defaults, overridden per-element by data-amd-trigger', () => {
    document.body.innerHTML = `
      <div data-animated-mermaid>sequenceDiagram
A->>B: hello</div>
      <div data-animated-mermaid data-amd-trigger="immediate">sequenceDiagram
A->>B: hello</div>`
    const controllers = init(document, { trigger: 'manual' })
    expect(controllers).toHaveLength(2)
    const [manualSvg, immediateSvg] = [...document.querySelectorAll('svg')]

    // default applies: stays hidden
    const manualFirstTarget = manualSvg.querySelector('g')!.querySelector('g') as SVGGElement
    expect(manualFirstTarget.style.opacity).toBe('0')

    // per-element attribute overrides the default: plays immediately
    const immediateFirstTarget = immediateSvg.querySelector('g')!.querySelector('g') as SVGGElement
    expect(immediateFirstTarget.style.opacity).toBe('')

    controllers.forEach((c) => c.destroy())
    document.body.innerHTML = ''
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
  it('exposes the nine direct renderers', () => {
    expect(typeof sequence).toBe('function')
    expect(typeof flowchart).toBe('function')
    expect(typeof stateDiagram).toBe('function')
    expect(typeof journey).toBe('function')
    expect(typeof timeline).toBe('function')
    expect(typeof classDiagram).toBe('function')
    expect(typeof erDiagram).toBe('function')
    expect(typeof pie).toBe('function')
    expect(typeof gantt).toBe('function')
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

    const task: JourneyTask = { name: 'Make tea', score: 5, actors: ['Me'], highlight: 'green' }
    const journeySection: JourneySection = { title: 'Morning', tasks: [task] }
    const journeyCfg: JourneyConfig = { type: 'journey', title: 'Day', sections: [journeySection] }

    const period: TimelinePeriod = { label: '2002', events: ['LinkedIn'], highlight: 'red' }
    const timelineSection: TimelineSection = { title: '2000s', periods: [period] }
    const timelineCfg: TimelineConfig = {
      type: 'timeline',
      title: 'History',
      sections: [timelineSection],
    }

    const relType: ClassRelationType = 'inheritance'
    const classNode: ClassNode = {
      id: 'Animal',
      annotation: '<<abstract>>',
      attributes: ['+int age'],
      methods: ['+eat() void'],
      highlight: 'green',
    }
    const relation: ClassRelation = {
      from: 'Duck',
      to: 'Animal',
      type: relType,
      label: 'is a',
      fromCardinality: '1',
      toCardinality: '1',
    }
    const classCfg: ClassConfig = {
      type: 'class',
      classes: [classNode, { id: 'Duck' }],
      relations: [relation],
      direction: 'LR',
    }

    const erKey: ErKey = 'PK'
    const erAttr: ErAttribute = { type: 'string', name: 'id', keys: [erKey], comment: 'row id' }
    const cardinality: ErCardinality = 'zero-or-more'
    const entity: ErEntity = { id: 'CUSTOMER', label: 'Customer', attributes: [erAttr], highlight: 'red' }
    const relationship: ErRelationship = {
      from: 'CUSTOMER',
      to: 'ORDER',
      fromCardinality: 'exactly-one',
      toCardinality: cardinality,
      identifying: false,
      label: 'places',
    }
    const erCfg: ErConfig = {
      type: 'er',
      entities: [entity, { id: 'ORDER' }],
      relationships: [relationship],
    }

    const slice: PieSlice = { label: 'A', value: 3, highlight: 'green' }
    const pieCfg: PieConfig = { type: 'pie', title: 'P', showData: true, slices: [slice, { label: 'B', value: 1 }] }

    const status: GanttStatus = 'active'
    const ganttTask: GanttTask = {
      name: 'Build',
      id: 'b',
      start: '2024-01-01',
      durationDays: 3,
      status,
      highlight: 'red',
    }
    const ganttSection: GanttSection = {
      title: 'S',
      tasks: [ganttTask, { name: 'Ship', after: 'b', milestone: true }],
    }
    const ganttCfg: GanttConfig = { type: 'gantt', title: 'G', sections: [ganttSection] }

    const theme: ThemeTokens = { ...lightTheme }
    const options: DiagramOptions = { theme, trigger: 'manual', animate: false }
    const configs: DiagramConfig[] = [
      seqCfg, flowCfg, stateCfg, journeyCfg, timelineCfg, classCfg, erCfg, pieCfg, ganttCfg,
    ]

    const controllers: DiagramController[] = configs.map((cfg) =>
      render(document.createElement('div'), cfg, options),
    )
    expect(controllers).toHaveLength(9)
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
