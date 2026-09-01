import { describe, it, expect } from 'vitest'
import { parseSankey } from '../src/sankey/parse'

describe('parseSankey', () => {
  it('parses the Mermaid docs CSV form', () => {
    const c = parseSankey(`sankey-beta
      Agricultural waste,Bio-conversion,124.729
      Bio-conversion,Liquid,0.597
      Bio-conversion,Losses,26.862`)
    expect(c.type).toBe('sankey')
    expect(c.links).toEqual([
      { source: 'Agricultural waste', target: 'Bio-conversion', value: 124.729 },
      { source: 'Bio-conversion', target: 'Liquid', value: 0.597 },
      { source: 'Bio-conversion', target: 'Losses', value: 26.862 },
    ])
  })

  it('accepts the bare sankey header too', () => {
    expect(parseSankey('sankey\nA,B,1').links).toHaveLength(1)
  })

  it('throws on non-sankey input', () => {
    expect(() => parseSankey('mindmap\nRoot')).toThrow(/sankey/i)
  })

  it('handles quoted fields with commas and escaped quotes', () => {
    const c = parseSankey('sankey-beta\n"Pumped heat, net","Heating and cooling, homes",193.026\n"He said ""hi""",B,1')
    expect(c.links[0].source).toBe('Pumped heat, net')
    expect(c.links[0].target).toBe('Heating and cooling, homes')
    expect(c.links[1].source).toBe('He said "hi"')
  })

  it('treats non-numeric or negative values as 0', () => {
    const c = parseSankey('sankey-beta\nA,B,abc\nC,D,-5')
    expect(c.links.map((l) => l.value)).toEqual([0, 0])
  })

  it('ignores comments, blanks, and malformed lines', () => {
    const c = parseSankey('sankey-beta\n%% note\n\nonly two,fields\nA,B,3')
    expect(c.links).toHaveLength(1)
  })
})
