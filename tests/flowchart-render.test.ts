import { describe, it, expect } from 'vitest'
import { buildFlowchartSvg, flowchart } from '../src/flowchart/render'
import { resolveOptions, lightTheme } from '../src/theme'
import { estimateTextWidth } from '../src/svg'
import type { FlowchartConfig } from '../src/types'

const CONFIG: FlowchartConfig = {
  nodes: [
    { id: 'start', text: 'Navigate', shape: 'rounded' },
    { id: 'check', text: 'Editable?', shape: 'diamond' },
    { id: 'editor', text: 'Open editor', shape: 'rounded', highlight: true },
    { id: 'readonly', text: 'Show read-only view', shape: 'rounded' },
  ],
  edges: [
    { from: 'start', to: 'check' },
    { from: 'check', to: 'editor', label: 'yes' },
    { from: 'check', to: 'readonly', label: 'no' },
  ],
  direction: 'TB',
}

const opts = resolveOptions({ theme: 'light' })

describe('buildFlowchartSvg', () => {
  const { svg, steps } = buildFlowchartSvg(CONFIG, opts)

  it('renders every node text and edge label', () => {
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    for (const n of CONFIG.nodes) expect(texts).toContain(n.text)
    expect(texts).toContain('yes')
    expect(texts).toContain('no')
  })

  it('renders the diamond as a polygon', () => {
    // one arrowhead polygon per edge + one diamond
    expect(svg.querySelectorAll('polygon').length).toBe(CONFIG.edges.length + 1)
  })

  it('renders one connecting path per edge', () => {
    const curves = [...svg.querySelectorAll('path')].filter(
      (p) => p.getAttribute('fill') === 'none',
    )
    expect(curves).toHaveLength(3)
  })

  it('highlighted nodes use the highlight stroke', () => {
    const highlighted = [...svg.querySelectorAll('rect')].filter(
      (r) => r.getAttribute('stroke') === lightTheme.highlight,
    )
    expect(highlighted).toHaveLength(1)
  })

  it('animates layer by layer: nodes, then connecting edges, then next layer', () => {
    // layers: [start], [check], [editor, readonly]
    // steps: L0 nodes, edges→L1, L1 nodes, edges→L2, L2 nodes
    expect(steps).toHaveLength(5)
    expect(steps[0]).toHaveLength(1) // start node group
    expect(steps[4]).toHaveLength(2) // editor + readonly node groups
  })

  it('sets an aria-label', () => {
    expect(svg.getAttribute('aria-label')).toContain('Flowchart')
    expect(svg.getAttribute('aria-label')).toContain('Navigate')
  })

  it('diamond branch edges exit from distinct border points, not one vertex', () => {
    const { svg: dsvg } = buildFlowchartSvg(CONFIG, opts)
    const starts = [...dsvg.querySelectorAll('path')]
      .filter((p) => p.getAttribute('fill') === 'none')
      .map((p) => (p.getAttribute('d') ?? '').match(/^M ([\d.e+-]+) ([\d.e+-]+)/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => `${m[1]},${m[2]}`)
    expect(new Set(starts).size).toBe(starts.length)
  })

  it('renders edge labels above node boxes (label layer last)', () => {
    const { svg: zsvg } = buildFlowchartSvg(CONFIG, opts)
    const root = zsvg.querySelector('g')!
    const last = root.lastElementChild!
    expect([...last.querySelectorAll('text')].map((t) => t.textContent)).toContain('yes')
  })

  it('edge paths terminate at the arrowhead base, not under the tip', () => {
    const { svg: tsvg } = buildFlowchartSvg(CONFIG, opts)
    const paths = [...tsvg.querySelectorAll('path')].filter((p) => p.getAttribute('fill') === 'none')
    const heads = [...tsvg.querySelectorAll('polygon')].filter((p) => (p.getAttribute('transform') ?? '').includes('rotate'))
    // Waypoint-routed paths can arrive at any angle now (not just axis-aligned),
    // so measure straight-line distance between the path's last point and the
    // arrowhead's tip instead of a single-axis delta.
    const d = paths[0].getAttribute('d') ?? ''
    const nums = d.trim().split(/[\s,]+/).filter((s) => s !== 'M' && s !== 'L' && s !== 'Q').map(Number)
    const endX = nums[nums.length - 2]
    const endY = nums[nums.length - 1]
    const m = (heads[0].getAttribute('transform') ?? '').match(/translate\(([\d.e+-]+),([\d.e+-]+)\)/)!
    const tipX = Number(m[1])
    const tipY = Number(m[2])
    expect(Math.hypot(tipX - endX, tipY - endY)).toBeCloseTo(10, 1)
  })
})

describe('LR direction', () => {
  it('renders wider than tall for a chain', () => {
    const cfg: FlowchartConfig = {
      nodes: [
        { id: 'a', text: 'one' },
        { id: 'b', text: 'two' },
        { id: 'c', text: 'three' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
      direction: 'LR',
    }
    const { svg } = buildFlowchartSvg(cfg, opts)
    const [, , w, h] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number)
    expect(w).toBeGreaterThan(h)
  })
})

describe('flowchart()', () => {
  it('mounts and returns a controller', () => {
    const container = document.createElement('div')
    const ctrl = flowchart(container, { ...CONFIG, options: { trigger: 'manual' } })
    expect(container.querySelector('svg')).not.toBeNull()
    ctrl.destroy()
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('self-edges and label overflow', () => {
  it('renders self-edges as a visible loop with its label', () => {
    const cfg: FlowchartConfig = {
      nodes: [{ id: 'a', text: 'Retry' }, { id: 'b', text: 'Done' }],
      edges: [{ from: 'a', to: 'a', label: 'again' }, { from: 'a', to: 'b' }],
      direction: 'TB',
    }
    const { svg: s, steps: st } = buildFlowchartSvg(cfg, opts)
    // dagre may route a short a→b edge as a plain 2-point line (no 'C'), so
    // count all connecting paths rather than filtering for a curve command.
    const curves = [...s.querySelectorAll('path')].filter((p) => p.getAttribute('fill') === 'none')
    expect(curves).toHaveLength(2) // self-loop + normal edge
    expect([...s.querySelectorAll('text')].map((t) => t.textContent)).toContain('again')
    // self-loop animates in the final (back-edge) step
    expect(st[st.length - 1].length).toBeGreaterThan(0)
  })

  it('expands the canvas so long edge labels stay in bounds', () => {
    const label = 'this is a very long edge label indeed'
    const cfg: FlowchartConfig = {
      nodes: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      edges: [{ from: 'a', to: 'b', label }],
      direction: 'TB',
    }
    const { svg: s } = buildFlowchartSvg(cfg, opts)
    const [, , vw] = (s.getAttribute('viewBox') ?? '').split(' ').map(Number)
    expect(vw).toBeGreaterThanOrEqual(estimateTextWidth(label, 12) + 12 + 80)
  })
})

describe('multi-tier and bidirectional edge routing (dagre)', () => {
  it('routes a multi-tier edge around the intermediate node instead of through its box', () => {
    const cfg: FlowchartConfig = {
      nodes: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' }, // spans 2 layers, routes around b
      ],
      direction: 'TB',
    }
    const { svg: rsvg } = buildFlowchartSvg(cfg, opts)
    const paths = [...rsvg.querySelectorAll('path')].filter((p) => p.getAttribute('fill') === 'none')
    const long = paths[2].getAttribute('d')! // third edge, appended in config order
    const nums = long
      .trim()
      .split(/[\s,]+/)
      .filter((s) => s !== 'M' && s !== 'L' && s !== 'Q')
      .map(Number)
    const points: { x: number; y: number }[] = []
    for (let i = 0; i < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] })

    // Locate b's box by content rather than DOM order.
    const boxOf = (label: string): { x: number; y: number; w: number; h: number } => {
      const text = [...rsvg.querySelectorAll('text')].find((t) => t.textContent === label)!
      const r = text.previousElementSibling as SVGRectElement
      return {
        x: +r.getAttribute('x')!,
        y: +r.getAttribute('y')!,
        w: +r.getAttribute('width')!,
        h: +r.getAttribute('height')!,
      }
    }
    const b = boxOf('B')
    for (const p of points) {
      const inside = p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h
      expect(inside).toBe(false)
    }
  })

  it('routes a bidirectional edge pair as visually distinct paths', () => {
    const cfg: FlowchartConfig = {
      nodes: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a', type: 'dashed' },
      ],
      direction: 'TB',
    }
    const { svg: rsvg } = buildFlowchartSvg(cfg, opts)
    const ds = [...rsvg.querySelectorAll('path')]
      .filter((p) => p.getAttribute('fill') === 'none')
      .map((p) => p.getAttribute('d'))
    expect(ds[0]).not.toBe(ds[1])
    expect(new Set(ds).size).toBe(2)
  })
})

describe('subgraph clusters', () => {
  const GROUP_CONFIG: FlowchartConfig = {
    nodes: [
      { id: 'a', text: 'A', group: 'g1' },
      { id: 'b', text: 'B', group: 'g1' },
      { id: 'c', text: 'C' },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ],
    direction: 'TB',
    groups: [{ id: 'g1', title: 'Group One' }],
  }
  const NO_GROUP_CONFIG: FlowchartConfig = {
    nodes: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ],
    direction: 'TB',
  }

  it('renders a cluster rect containing its member node rects, plus the title text', () => {
    const { svg } = buildFlowchartSvg(GROUP_CONFIG, opts)
    const clusterRect = [...svg.querySelectorAll('rect')].find(
      (r) =>
        r.getAttribute('fill') === lightTheme.noteBackground &&
        r.getAttribute('fill-opacity') === '0.35' &&
        r.getAttribute('stroke') === lightTheme.noteBorder &&
        r.getAttribute('rx') === '6',
    )
    expect(clusterRect).toBeTruthy()
    const cx = +clusterRect!.getAttribute('x')!
    const cy = +clusterRect!.getAttribute('y')!
    const cw = +clusterRect!.getAttribute('width')!
    const ch = +clusterRect!.getAttribute('height')!

    const nodeRectOf = (text: string): { x: number; y: number; w: number; h: number } => {
      const t = [...svg.querySelectorAll('text')].find((el) => el.textContent === text)!
      const r = t.previousElementSibling as SVGRectElement
      return {
        x: +r.getAttribute('x')!,
        y: +r.getAttribute('y')!,
        w: +r.getAttribute('width')!,
        h: +r.getAttribute('height')!,
      }
    }
    for (const label of ['A', 'B']) {
      const n = nodeRectOf(label)
      expect(n.x).toBeGreaterThanOrEqual(cx)
      expect(n.y).toBeGreaterThanOrEqual(cy)
      expect(n.x + n.w).toBeLessThanOrEqual(cx + cw)
      expect(n.y + n.h).toBeLessThanOrEqual(cy + ch)
    }

    const titleText = [...svg.querySelectorAll('text')].find((t) => t.textContent === 'Group One')
    expect(titleText).toBeTruthy()
    expect(+titleText!.getAttribute('x')!).toBeCloseTo(cx + 10, 5)
    expect(+titleText!.getAttribute('y')!).toBeCloseTo(cy + 14, 5)
  })

  it('appends cluster chrome before all edges/nodes (bottom of z-order)', () => {
    const { svg } = buildFlowchartSvg(GROUP_CONFIG, opts)
    const root = svg.querySelector('g')!
    const clusterRect = [...svg.querySelectorAll('rect')].find(
      (r) => r.getAttribute('fill-opacity') === '0.35',
    )!
    // The cluster rect's own <g> (or itself) should be the first child under root.
    const firstChild = root.firstElementChild!
    expect(firstChild === clusterRect || firstChild.contains(clusterRect)).toBe(true)
  })

  it('keeps the anim step count unchanged vs the no-group equivalent (auto mode)', () => {
    const withGroup = buildFlowchartSvg(GROUP_CONFIG, opts)
    const noGroup = buildFlowchartSvg(NO_GROUP_CONFIG, opts)
    expect(withGroup.steps).toHaveLength(noGroup.steps.length)
  })

  it('places cluster chrome in the same anim group as its first member node (auto mode)', () => {
    const { svg, steps } = buildFlowchartSvg(GROUP_CONFIG, opts)
    const clusterRect = [...svg.querySelectorAll('rect')].find(
      (r) => r.getAttribute('fill-opacity') === '0.35',
    )!
    const aText = [...svg.querySelectorAll('text')].find((t) => t.textContent === 'A')!
    const aGroup = aText.closest('g') as SVGGElement

    const stepWithA = steps.findIndex((st) => st.some((item) => item.el === aGroup))
    const stepWithCluster = steps.findIndex(
      (st) => st.some((item) => item.el === clusterRect || item.el.contains(clusterRect)),
    )
    expect(stepWithCluster).toBe(stepWithA)
  })

  it('keeps the anim step count unchanged vs the no-group equivalent (click mode)', () => {
    const clickOpts = resolveOptions({ theme: 'light', advance: 'click' })
    const withGroup = buildFlowchartSvg(GROUP_CONFIG, clickOpts)
    const noGroup = buildFlowchartSvg(NO_GROUP_CONFIG, clickOpts)
    expect(withGroup.steps).toHaveLength(noGroup.steps.length)
  })

  it('places cluster chrome in the same anim group as its first member node (click mode)', () => {
    const clickOpts = resolveOptions({ theme: 'light', advance: 'click' })
    const { svg, steps } = buildFlowchartSvg(GROUP_CONFIG, clickOpts)
    const clusterRect = [...svg.querySelectorAll('rect')].find(
      (r) => r.getAttribute('fill-opacity') === '0.35',
    )!
    const aText = [...svg.querySelectorAll('text')].find((t) => t.textContent === 'A')!
    const aGroup = aText.closest('g') as SVGGElement

    const stepWithA = steps.findIndex((st) => st.some((item) => item.el === aGroup))
    const stepWithCluster = steps.findIndex(
      (st) => st.some((item) => item.el === clusterRect || item.el.contains(clusterRect)),
    )
    expect(stepWithCluster).toBe(stepWithA)
  })

  it('does not make cluster chrome a click target; click expansion still works with groups present', () => {
    const clickOpts = resolveOptions({ theme: 'light', advance: 'click' })
    const { clickTargets } = buildFlowchartSvg(GROUP_CONFIG, clickOpts)
    expect(clickTargets).toBeDefined()
    // Same click-target count as the ungrouped equivalent: a (expands to b), b (expands to c).
    expect(clickTargets).toHaveLength(2)
  })
})

describe("advance: 'click'", () => {
  const clickOpts = resolveOptions({ theme: 'light', advance: 'click' })

  it('step 0 contains only the root node(s)', () => {
    const { steps } = buildFlowchartSvg(CONFIG, clickOpts)
    expect(steps[0]).toHaveLength(1)
  })

  it('returns click targets with valid step indices', () => {
    const { steps, clickTargets } = buildFlowchartSvg(CONFIG, clickOpts)
    expect(clickTargets).toBeDefined()
    // start (expands to reveal `check`) and check (expands to reveal editor+readonly);
    // editor/readonly have no outgoing edges, so no click target of their own.
    expect(clickTargets).toHaveLength(2)
    for (const ct of clickTargets!) {
      expect(ct.revealsAt).toBeGreaterThanOrEqual(0)
      expect(ct.revealsAt).toBeLessThan(steps.length)
      expect(ct.expands).toBeGreaterThan(ct.revealsAt)
      expect(ct.expands).toBeLessThan(steps.length)
    }
  })

  it('clicking a revealed node expands its branch; clicking an unrevealed node is a no-op', () => {
    const container = document.createElement('div')
    const ctrl = flowchart(container, { ...CONFIG, options: { advance: 'click', trigger: 'immediate' } })
    const groupFor = (text: string): SVGGElement =>
      ([...container.querySelectorAll('text')].find((t) => t.textContent === text)!.closest('g') as SVGGElement)

    const startGroup = groupFor('Navigate')
    const checkGroup = groupFor('Editable?')
    const editorGroup = groupFor('Open editor')

    // Root revealed immediately; downstream nodes wait for a click.
    expect(startGroup.style.opacity).toBe('')
    expect(checkGroup.style.opacity).toBe('0')
    expect(editorGroup.style.opacity).toBe('0')

    // Clicking `check` before it's revealed does nothing.
    checkGroup.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(checkGroup.style.opacity).toBe('0')

    // Clicking the revealed root expands its outgoing edge + `check`.
    startGroup.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(checkGroup.style.opacity).toBe('')
    expect(editorGroup.style.opacity).toBe('0') // not expanded yet

    ctrl.destroy()
  })

  it('toggles cursor style on click targets as they become clickable/expanded', () => {
    const container = document.createElement('div')
    const ctrl = flowchart(container, { ...CONFIG, options: { advance: 'click', trigger: 'immediate' } })
    const groupFor = (text: string): SVGGElement =>
      ([...container.querySelectorAll('text')].find((t) => t.textContent === text)!.closest('g') as SVGGElement)
    const startGroup = groupFor('Navigate')
    const checkGroup = groupFor('Editable?')

    expect(startGroup.style.cursor).toBe('pointer')
    expect(checkGroup.style.cursor).toBe('')

    startGroup.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(startGroup.style.cursor).toBe('') // fully expanded now
    expect(checkGroup.style.cursor).toBe('pointer')

    ctrl.destroy()
  })

  it('a clickable node is a focusable button and loses that once expanded; Space reveals its branch', () => {
    const container = document.createElement('div')
    const ctrl = flowchart(container, { ...CONFIG, options: { advance: 'click', trigger: 'immediate' } })
    const groupFor = (text: string): SVGGElement =>
      ([...container.querySelectorAll('text')].find((t) => t.textContent === text)!.closest('g') as SVGGElement)
    const startGroup = groupFor('Navigate')
    const checkGroup = groupFor('Editable?')

    expect(startGroup.getAttribute('tabindex')).toBe('0')
    expect(startGroup.getAttribute('role')).toBe('button')
    expect(checkGroup.getAttribute('tabindex')).toBeNull() // not revealed yet

    // Space activates the focused root the same as a click.
    startGroup.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(checkGroup.style.opacity).toBe('')

    // Fully expanded now: no longer a button.
    expect(startGroup.getAttribute('tabindex')).toBeNull()
    expect(startGroup.getAttribute('role')).toBeNull()
    // `check` became clickable once revealed.
    expect(checkGroup.getAttribute('tabindex')).toBe('0')
    expect(checkGroup.getAttribute('role')).toBe('button')

    ctrl.destroy()
    checkGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    // no assertion needed beyond "doesn't throw" — destroy() removed the listener
  })
})
