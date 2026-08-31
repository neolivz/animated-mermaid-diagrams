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
