import { describe, it, expect } from 'vitest'
import { parseSequence } from '../src/sequence/parse'

const SPEC_EXAMPLE = `
  sequenceDiagram
    actor User
    participant App
    participant Backend

    User->>App: Click delete
    App->>Backend: GET resource usage
    Backend-->>App: Returns list
    Note over App: Router intercepts
    App-->>User: Record editor loads
`

describe('parseSequence', () => {
  it('parses the spec example', () => {
    const c = parseSequence(SPEC_EXAMPLE)
    expect(c.type).toBe('sequence')
    expect(c.actors).toEqual([
      { id: 'User', label: 'User', type: 'actor' },
      { id: 'App', label: 'App', type: 'participant' },
      { id: 'Backend', label: 'Backend', type: 'participant' },
    ])
    expect(c.steps).toHaveLength(5)
    expect(c.steps[0]).toEqual({ from: 'User', to: 'App', text: 'Click delete', type: 'request' })
    expect(c.steps[2].type).toBe('response')
    expect(c.steps[3]).toEqual({ over: 'App', text: 'Router intercepts', type: 'note' })
  })

  it('supports participant aliases', () => {
    const c = parseSequence('sequenceDiagram\nparticipant A as Alice\nA->>A: hi')
    expect(c.actors[0]).toEqual({ id: 'A', label: 'Alice', type: 'participant' })
  })

  it('auto-declares actors referenced only in messages', () => {
    const c = parseSequence('sequenceDiagram\nFoo->>Bar: hello')
    expect(c.actors.map((a) => a.id)).toEqual(['Foo', 'Bar'])
  })

  it('parses failed messages (-x, --x)', () => {
    const c = parseSequence('sequenceDiagram\nA-xB: nope\nA--xB: also nope')
    expect(c.steps[0]).toMatchObject({ type: 'request', failed: true })
    expect(c.steps[1]).toMatchObject({ type: 'response', failed: true })
  })

  it('parses multi-actor notes', () => {
    const c = parseSequence('sequenceDiagram\nA->>B: x\nNote over A,B: spans both')
    expect(c.steps[1].over).toEqual(['A', 'B'])
  })

  it('silently ignores unsupported blocks and comments', () => {
    const c = parseSequence(`sequenceDiagram
      %% a comment
      autonumber
      A->>B: one
      alt happy path
        B-->>A: two
      else sad
        B-->>A: three
      end
      activate B
      deactivate B`)
    expect(c.steps.map((s) => s.text)).toEqual(['one', 'two', 'three'])
  })

  it('throws on non-sequence input', () => {
    expect(() => parseSequence('flowchart TD\nA-->B')).toThrow()
  })

  it('upserts a declaration that follows first use (no duplicate actors)', () => {
    const c = parseSequence('sequenceDiagram\nA->>B: hi\nparticipant A as Alice')
    expect(c.actors).toEqual([
      { id: 'A', label: 'Alice', type: 'participant' },
      { id: 'B', label: 'B', type: 'participant' },
    ])
  })

  it('ignores lines where an arrow token abuts inside an id instead of misparsing', () => {
    const c = parseSequence('sequenceDiagram\nA-x->>B: hi')
    expect(c.steps).toEqual([])
    expect(c.actors).toEqual([])
  })

  it('parses Note left of / right of like Note over', () => {
    const c = parseSequence('sequenceDiagram\nNote left of A: to the left\nNote right of A: to the right')
    expect(c.steps).toEqual([
      { over: 'A', text: 'to the left', type: 'note' },
      { over: 'A', text: 'to the right', type: 'note' },
    ])
  })

  it('parses alt/else frames with step ranges and nesting depth', () => {
    const c = parseSequence(`sequenceDiagram
      A->>B: pre
      alt happy path
        B-->>A: ok
        opt logging
          B->>B: log
        end
      else sad
        B-->>A: fail
      end
      A->>B: post`)
    expect(c.steps).toHaveLength(5)
    expect(c.frames).toEqual([
      { kind: 'opt', label: 'logging', fromStep: 2, toStep: 2, sections: [], depth: 1 },
      {
        kind: 'alt', label: 'happy path', fromStep: 1, toStep: 3, depth: 0,
        sections: [{ label: 'sad', fromStep: 3 }],
      },
    ])
  })

  it('parses loop and par/and frames', () => {
    const c = parseSequence(`sequenceDiagram
      loop every 5s
        A->>B: poll
      end
      par fetch
        A->>B: a
      and store
        A->>B: b
      end`)
    expect(c.frames).toEqual([
      { kind: 'loop', label: 'every 5s', fromStep: 0, toStep: 0, sections: [], depth: 0 },
      { kind: 'par', label: 'fetch', fromStep: 1, toStep: 2, depth: 0, sections: [{ label: 'store', fromStep: 2 }] },
    ])
  })

  it('drops empty frames and closes unterminated ones at EOF', () => {
    const c = parseSequence(`sequenceDiagram
      opt nothing inside
      end
      loop forever
        A->>B: x`)
    expect(c.frames).toEqual([
      { kind: 'loop', label: 'forever', fromStep: 0, toStep: 0, sections: [], depth: 0 },
    ])
  })

  it('parses explicit activate/deactivate into spans', () => {
    const c = parseSequence(`sequenceDiagram
      A->>B: start
      activate B
      B->>B: work
      B-->>A: done
      deactivate B`)
    expect(c.activations).toEqual([{ actor: 'B', fromStep: 0, toStep: 2, level: 0 }])
  })

  it('parses +/- arrow shorthand and overlap levels', () => {
    const c = parseSequence(`sequenceDiagram
      A->>+B: outer
      B->>+B: inner
      B-->>-B: inner done
      B-->>-A: outer done`)
    expect(c.steps).toHaveLength(4)
    expect(c.activations).toEqual([
      { actor: 'B', fromStep: 1, toStep: 2, level: 1 },
      { actor: 'B', fromStep: 0, toStep: 3, level: 0 },
    ])
  })

  it('leaves unclosed activations open to the last step', () => {
    const c = parseSequence('sequenceDiagram\nA->>+B: go\nB->>A: mid')
    expect(c.activations).toEqual([{ actor: 'B', fromStep: 0, toStep: 1, level: 0 }])
  })
})
