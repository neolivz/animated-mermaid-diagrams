import { describe, it, expect } from 'vitest'
import { parseState } from '../src/state/parse'

describe('parseState', () => {
  it('parses the spec example', () => {
    const c = parseState(`
      stateDiagram-v2
        [*] --> Idle
        Idle --> Loading : fetch()
        Loading --> Ready : success
        Loading --> Error : failure
        Error --> Loading : retry()
        Ready --> Idle : reset()
    `)
    expect(c.type).toBe('state')
    expect(c.initial).toBe('Idle')
    expect(c.states.map((s) => s.id)).toEqual(['Idle', 'Loading', 'Ready', 'Error'])
    expect(c.transitions).toHaveLength(5)
    expect(c.transitions[0]).toEqual({ from: 'Idle', to: 'Loading', label: 'fetch()' })
  })

  it('creates an end state for [*] targets', () => {
    const c = parseState('stateDiagram-v2\n[*] --> A\nA --> [*]')
    const end = c.states.find((s) => s.type === 'end')
    expect(end).toBeDefined()
    expect(c.transitions[0]).toEqual({ from: 'A', to: end!.id })
  })

  it('supports described states', () => {
    const c = parseState('stateDiagram-v2\nstate "Waiting for input" as w\n[*] --> w')
    expect(c.states[0]).toEqual({ id: 'w', text: 'Waiting for input' })
  })

  it('supports transitions without labels', () => {
    const c = parseState('stateDiagram-v2\nA --> B')
    expect(c.transitions[0]).toEqual({ from: 'A', to: 'B' })
    expect(c.initial).toBe('A')
  })

  it('flattens composite state blocks, ignoring the grouping', () => {
    const c = parseState(`stateDiagram-v2
      [*] --> Active
      state Active {
        [*] --> Inner
        Inner --> Done
      }`)
    expect(c.states.map((s) => s.id)).toContain('Inner')
    expect(c.states.map((s) => s.id)).toContain('Done')
    // first [*] wins as the diagram's initial
    expect(c.initial).toBe('Active')
  })

  it('accepts plain stateDiagram header', () => {
    expect(parseState('stateDiagram\nA --> B').transitions).toHaveLength(1)
  })

  it('throws on non-state input', () => {
    expect(() => parseState('flowchart TD\nA-->B')).toThrow()
  })
})
