import { describe, it, expect } from 'vitest'
import { parseJourney } from '../src/journey/parse'

describe('parseJourney', () => {
  it('parses the Mermaid docs example', () => {
    const c = parseJourney(`journey
      title My working day
      section Go to work
        Make tea: 5: Me
        Go upstairs: 3: Me
        Do work: 1: Me, Cat
      section Go home
        Go downstairs: 5: Me
        Sit down: 5: Me`)
    expect(c.type).toBe('journey')
    expect(c.title).toBe('My working day')
    expect(c.sections).toHaveLength(2)
    expect(c.sections[0].title).toBe('Go to work')
    expect(c.sections[0].tasks).toEqual([
      { name: 'Make tea', score: 5, actors: ['Me'] },
      { name: 'Go upstairs', score: 3, actors: ['Me'] },
      { name: 'Do work', score: 1, actors: ['Me', 'Cat'] },
    ])
    expect(c.sections[1].tasks.map((t) => t.name)).toEqual(['Go downstairs', 'Sit down'])
  })

  it('throws on non-journey input', () => {
    expect(() => parseJourney('flowchart TD\na-->b')).toThrow(/journey/i)
  })

  it('puts tasks before the first section into an untitled leading section', () => {
    const c = parseJourney('journey\nWake up: 3: Me\nsection Work\nCode: 6: Me')
    expect(c.sections).toHaveLength(2)
    expect(c.sections[0].title).toBeUndefined()
    expect(c.sections[0].tasks[0].name).toBe('Wake up')
    expect(c.sections[1].title).toBe('Work')
  })

  it('clamps out-of-range scores to 1..7 and defaults non-numeric scores to 4', () => {
    const c = parseJourney('journey\nsection S\nLow: 0: Me\nHigh: 99: Me\nOdd: abc: Me')
    const scores = c.sections[0].tasks.map((t) => t.score)
    expect(scores).toEqual([1, 7, 4])
  })

  it('defaults an empty score to 4, not 1 (Number("") is 0)', () => {
    const c = parseJourney('journey\nsection S\nNo score:\nNo score with actors: : Me')
    expect(c.sections[0].tasks.map((t) => t.score)).toEqual([4, 4])
    expect(c.sections[0].tasks[1].actors).toEqual(['Me'])
  })

  it('ignores accTitle/accDescr directives instead of parsing them as tasks', () => {
    const c = parseJourney('journey\naccTitle: my title\naccDescr: my description\nsection S\nA: 4: Me')
    expect(c.sections).toHaveLength(1)
    expect(c.sections[0].tasks.map((t) => t.name)).toEqual(['A'])
  })

  it('omits actors when the actor list is absent', () => {
    const c = parseJourney('journey\nsection S\nSolo: 5')
    expect(c.sections[0].tasks[0]).toEqual({ name: 'Solo', score: 5 })
  })

  it('is untitled when there is no title line', () => {
    const c = parseJourney('journey\nsection S\nA: 4: Me')
    expect(c.title).toBeUndefined()
  })

  it('drops sections that end up with no tasks', () => {
    const c = parseJourney('journey\nsection Empty\nsection Full\nA: 4: Me')
    expect(c.sections).toHaveLength(1)
    expect(c.sections[0].title).toBe('Full')
  })

  it('ignores comment lines and blank lines', () => {
    const c = parseJourney('journey\n%% a comment\n\nsection S\nA: 4: Me')
    expect(c.sections[0].tasks).toHaveLength(1)
  })
})
