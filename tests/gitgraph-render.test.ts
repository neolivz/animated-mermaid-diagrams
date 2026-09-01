import { describe, it, expect } from 'vitest'
import { buildGitGraphSvg, gitGraph, replayGitGraph } from '../src/gitgraph/render'
import { resolveOptions, lightTheme } from '../src/theme'
import type { GitGraphConfig } from '../src/types'

const CFG: GitGraphConfig = {
  type: 'gitgraph',
  operations: [
    { op: 'commit', id: 'Alpha' },
    { op: 'commit' },
    { op: 'branch', name: 'develop' },
    { op: 'checkout', name: 'develop' },
    { op: 'commit', id: 'Feature', highlight: true },
    { op: 'commit' },
    { op: 'checkout', name: 'main' },
    { op: 'merge', name: 'develop', tag: 'v1.0' },
    { op: 'commit' },
  ],
}

const opts = resolveOptions({ theme: 'light', trigger: 'manual' })

describe('replayGitGraph', () => {
  it('assigns lanes in branch-creation order and sequential columns', () => {
    const R = replayGitGraph(CFG.operations)
    expect(R.lanes).toEqual(['main', 'develop'])
    const cols = R.commits.map((c) => c.col)
    expect(cols).toEqual([0, 1, 2, 3, 4, 5])
    expect(R.commits[2].lane).toBe(1) // Feature on develop
    expect(R.commits[4].lane).toBe(0) // merge commit on main
    expect(R.commits[4].mergeFrom?.lane).toBe(1)
  })

  it('links the first commit of a branch to its fork-point commit', () => {
    const R = replayGitGraph(CFG.operations)
    const feature = R.commits[2]
    expect(feature.parent?.col).toBe(1) // branched after the second main commit
    expect(feature.parent?.lane).toBe(0)
  })

  it('branch implicitly checks out the new branch (Mermaid semantics)', () => {
    const R = replayGitGraph([
      { op: 'commit' },
      { op: 'branch', name: 'dev' }, // no explicit checkout
      { op: 'commit' },
      { op: 'checkout', name: 'main' },
      { op: 'merge', name: 'dev' },
    ])
    expect(R.commits[1].lane).toBe(1) // commit lands on dev
    expect(R.commits[2].mergeFrom?.lane).toBe(1) // merge sees dev's head
  })

  it('ignores merges of unknown branches and checkouts of unknown branches (lenient)', () => {
    const R = replayGitGraph([
      { op: 'commit' },
      { op: 'checkout', name: 'ghost' },
      { op: 'commit' },
      { op: 'merge', name: 'ghost' },
    ])
    expect(R.commits).toHaveLength(2)
    expect(R.commits.every((c) => c.lane === 0)).toBe(true)
  })

  it('creates an implicit initial commit lane for a merge with no prior commit on the branch', () => {
    const R = replayGitGraph([{ op: 'branch', name: 'dev' }, { op: 'checkout', name: 'dev' }, { op: 'commit' }])
    expect(R.lanes).toEqual(['main', 'dev'])
    expect(R.commits[0].lane).toBe(1)
    expect(R.commits[0].parent).toBeUndefined() // main had no commits to fork from
  })
})

describe('buildGitGraphSvg', () => {
  it('renders branch labels, commit ids, and tags', () => {
    const { svg } = buildGitGraphSvg(CFG, opts)
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('main')
    expect(texts).toContain('develop')
    expect(texts).toContain('Alpha')
    expect(texts).toContain('Feature')
    expect(texts).toContain('v1.0')
  })

  it('emits 1 intro step + one step per commit/merge (branch/checkout draw nothing)', () => {
    const { steps } = buildGitGraphSvg(CFG, opts)
    expect(steps).toHaveLength(1 + 6)
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })

  it('gives merge commits no auto number and draws a dotted guide per lane', () => {
    const R = replayGitGraph(CFG.operations)
    const merge = R.commits.find((c) => c.mergeFrom)!
    expect(merge.label).toBe('')
    const { svg } = buildGitGraphSvg(CFG, opts)
    const guides = [...svg.querySelectorAll('line')].filter((l) => l.getAttribute('stroke-dasharray'))
    expect(guides).toHaveLength(2) // one per lane
  })

  it('rings highlighted commits with the highlight color', () => {
    const { svg } = buildGitGraphSvg(CFG, opts)
    const rings = [...svg.querySelectorAll('circle')].filter(
      (c) => c.getAttribute('stroke') === lightTheme.highlight,
    )
    expect(rings.length).toBeGreaterThanOrEqual(1)
  })

  it('renders an operations list with no commits without NaN', () => {
    const { svg, steps } = buildGitGraphSvg(
      { operations: [{ op: 'branch', name: 'dev' }] },
      opts,
    )
    expect(svg.innerHTML).not.toContain('NaN')
    expect(steps.every((s) => s.length > 0)).toBe(true)
  })
})

describe('gitGraph()', () => {
  it('returns a controller and renders everything with animate:false', () => {
    const container = document.createElement('div')
    const ctrl = gitGraph(container, { ...CFG, options: { animate: false } })
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('v1.0')
    ctrl.destroy()
  })

  it('describes the diagram in the svg aria-label', () => {
    const container = document.createElement('div')
    const ctrl = gitGraph(container, { ...CFG, options: { animate: false } })
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/git graph/i)
    expect(label).toContain('6')
    ctrl.destroy()
  })
})
