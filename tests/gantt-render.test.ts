import { describe, it, expect } from 'vitest'
import { buildGanttSvg, gantt, resolveGanttRows } from '../src/gantt/render'
import { resolveOptions, lightTheme } from '../src/theme'
import type { GanttConfig } from '../src/types'

const CFG: GanttConfig = {
  type: 'gantt',
  title: 'Release plan',
  sections: [
    {
      title: 'Build',
      tasks: [
        { name: 'Design', id: 'd', start: '2024-01-01', durationDays: 5, status: 'done' },
        { name: 'Implement', id: 'i', after: 'd', durationDays: 10, status: 'active' },
      ],
    },
    {
      title: 'Ship',
      tasks: [
        { name: 'Test', after: 'i', durationDays: 4, status: 'crit' },
        { name: 'Launch', start: '2024-01-20', milestone: true },
      ],
    },
  ],
}

const opts = resolveOptions({ theme: 'light', trigger: 'manual' })

describe('resolveGanttRows', () => {
  it('resolves after-references and previous-end fallbacks in document order', () => {
    const rows = resolveGanttRows(CFG.sections)
    expect(rows.map((r) => r.startDay - rows[0].startDay)).toEqual([0, 5, 15, 19])
    expect(rows[3].durationDays).toBe(0) // milestone with no duration
  })

  it('resolves fractional-duration chains identically to the parser (ceil to whole days)', () => {
    const rows = resolveGanttRows([
      {
        tasks: [
          { name: 'A', id: 'a1', start: '2024-01-01', durationDays: 2.5 },
          { name: 'B', after: 'a1', durationDays: 3 },
        ],
      },
    ])
    expect(rows[1].startDay - rows[0].startDay).toBe(3)
  })

  it('skips unresolvable tasks and tolerates empty sections', () => {
    const rows = resolveGanttRows([
      { title: 'E', tasks: [] },
      { tasks: [{ name: 'Ghost', after: 'missing' }, { name: 'Real', start: '2024-02-01', durationDays: 2 }] },
    ])
    expect(rows.map((r) => r.task.name)).toEqual(['Real'])
  })
})

describe('buildGanttSvg', () => {
  it('renders title, section titles, task names, and axis tick dates', () => {
    const { svg } = buildGanttSvg(CFG, opts)
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Release plan')
    expect(texts).toContain('Build')
    expect(texts).toContain('Ship')
    expect(texts).toContain('Implement')
    expect(texts.some((t) => /01-0\d/.test(t ?? ''))).toBe(true)
  })

  it('emits 1 intro step + one step per resolved task', () => {
    const { steps } = buildGanttSvg(CFG, opts)
    expect(steps).toHaveLength(1 + 4)
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })

  it('colors bars by status: done=textSecondary, active=highlight, crit=highlightRed', () => {
    const { svg } = buildGanttSvg(CFG, opts)
    const strokes = [...svg.querySelectorAll('path')].map((p) => p.getAttribute('stroke'))
    expect(strokes).toContain(lightTheme.textSecondary)
    expect(strokes).toContain(lightTheme.highlight)
    expect(strokes).toContain(lightTheme.highlightRed)
  })

  it('renders milestones as diamonds, not bars', () => {
    const { svg } = buildGanttSvg(CFG, opts)
    expect(svg.querySelectorAll('polygon').length).toBeGreaterThanOrEqual(1)
  })

  it('renders a single-task config without NaN', () => {
    const { svg } = buildGanttSvg(
      { sections: [{ tasks: [{ name: 'Only', start: '2024-01-01', durationDays: 1 }] }] },
      opts,
    )
    expect(svg.innerHTML).not.toContain('NaN')
  })

  it('renders a config with zero resolvable tasks without crashing', () => {
    const { svg, steps } = buildGanttSvg({ title: 'Empty', sections: [{ tasks: [] }] }, opts)
    expect(svg.innerHTML).not.toContain('NaN')
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })
})

describe('gantt()', () => {
  it('returns a controller and renders everything with animate:false', () => {
    const container = document.createElement('div')
    const ctrl = gantt(container, { ...CFG, options: { animate: false } })
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Launch')
    ctrl.destroy()
  })

  it('describes the chart in the svg aria-label', () => {
    const container = document.createElement('div')
    const ctrl = gantt(container, { ...CFG, options: { animate: false } })
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/gantt/i)
    expect(label).toContain('4')
    ctrl.destroy()
  })
})
