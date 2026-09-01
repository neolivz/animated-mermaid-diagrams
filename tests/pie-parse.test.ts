import { describe, it, expect } from 'vitest'
import { parsePie } from '../src/pie/parse'

describe('parsePie', () => {
  it('parses the Mermaid docs example', () => {
    const c = parsePie(`pie showData
      title Key elements in Product X
      "Calcium" : 42.96
      "Potassium" : 50.05
      "Magnesium" : 10.01`)
    expect(c.type).toBe('pie')
    expect(c.title).toBe('Key elements in Product X')
    expect(c.showData).toBe(true)
    expect(c.slices).toEqual([
      { label: 'Calcium', value: 42.96 },
      { label: 'Potassium', value: 50.05 },
      { label: 'Magnesium', value: 10.01 },
    ])
  })

  it('throws on non-pie input', () => {
    expect(() => parsePie('gantt\ntitle X')).toThrow(/pie/i)
  })

  it('omits showData when absent', () => {
    const c = parsePie('pie\n"A" : 1')
    expect(c.showData).toBeUndefined()
  })

  it('clamps negative and non-numeric values to 0', () => {
    const c = parsePie('pie\n"A" : -5\n"B" : abc\n"C" : 2')
    expect(c.slices.map((s) => s.value)).toEqual([0, 0, 2])
  })

  it('keeps labels with colons and quotes intact', () => {
    const c = parsePie('pie\n"Ratio: a/b" : 3')
    expect(c.slices[0].label).toBe('Ratio: a/b')
  })

  it('ignores comments, blanks, accTitle/accDescr, and unknown lines', () => {
    const c = parsePie('pie\n%% note\n\naccTitle: hi\naccDescr: yo\nnonsense here\n"A" : 1')
    expect(c.slices).toHaveLength(1)
  })
})
