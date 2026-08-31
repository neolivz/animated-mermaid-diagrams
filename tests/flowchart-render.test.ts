import { describe, it, expect } from 'vitest'
import { buildFlowchartSvg, flowchart } from '../src/flowchart/render'
import { resolveOptions, lightTheme } from '../src/theme'
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
    // layers: [start], [check], [builder, legacy]
    // steps: L0 nodes, edges→L1, L1 nodes, edges→L2, L2 nodes
    expect(steps).toHaveLength(5)
    expect(steps[0]).toHaveLength(1) // start node group
    expect(steps[4]).toHaveLength(2) // builder + legacy node groups
  })

  it('sets an aria-label', () => {
    expect(svg.getAttribute('aria-label')).toContain('Flowchart')
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
