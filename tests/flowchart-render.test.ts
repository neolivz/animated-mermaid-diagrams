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

  it('renders edge labels above node boxes (label layer last)', () => {
    const { svg: zsvg } = buildFlowchartSvg(CONFIG, opts)
    const root = zsvg.querySelector('g')!
    const last = root.lastElementChild!
    expect([...last.querySelectorAll('text')].map((t) => t.textContent)).toContain('yes')
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
    const curves = [...s.querySelectorAll('path')].filter((p) => (p.getAttribute('d') ?? '').includes('C'))
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
