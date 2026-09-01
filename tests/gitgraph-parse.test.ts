import { describe, it, expect } from 'vitest'
import { parseGitGraph } from '../src/gitgraph/parse'

describe('parseGitGraph', () => {
  it('parses the Mermaid docs example', () => {
    const c = parseGitGraph(`gitGraph
      commit
      commit
      branch develop
      checkout develop
      commit
      commit
      checkout main
      merge develop
      commit`)
    expect(c.type).toBe('gitgraph')
    expect(c.operations.map((o) => o.op)).toEqual([
      'commit', 'commit', 'branch', 'checkout', 'commit', 'commit', 'checkout', 'merge', 'commit',
    ])
    expect(c.operations[2].name).toBe('develop')
    expect(c.operations[7].name).toBe('develop')
  })

  it('throws on non-gitgraph input', () => {
    expect(() => parseGitGraph('mindmap\nRoot')).toThrow(/gitGraph/i)
  })

  it('parses commit id, tag, and HIGHLIGHT type', () => {
    const c = parseGitGraph(`gitGraph
      commit id: "Alpha"
      commit id: "Beta" tag: "v1.0.0"
      commit type: HIGHLIGHT`)
    expect(c.operations[0]).toEqual({ op: 'commit', id: 'Alpha' })
    expect(c.operations[1]).toEqual({ op: 'commit', id: 'Beta', tag: 'v1.0.0' })
    expect(c.operations[2]).toEqual({ op: 'commit', highlight: true })
  })

  it('accepts switch as checkout and merge tags', () => {
    const c = parseGitGraph('gitGraph\nbranch dev\nswitch dev\ncommit\nswitch main\nmerge dev tag: "v2"')
    expect(c.operations[1]).toEqual({ op: 'checkout', name: 'dev' })
    expect(c.operations[4]).toEqual({ op: 'merge', name: 'dev', tag: 'v2' })
  })

  it('ignores the LR:/TB: header suffix, order props, comments, and unknown ops', () => {
    const c = parseGitGraph('gitGraph LR:\n%% note\nbranch dev order: 2\ncherry-pick id: "x"\ncommit')
    expect(c.operations).toEqual([{ op: 'branch', name: 'dev' }, { op: 'commit' }])
  })
})
