import { describe, it, expect } from 'vitest'
import { parseMindmap } from '../src/mindmap/parse'

describe('parseMindmap', () => {
  it('parses the Mermaid docs example structure', () => {
    const c = parseMindmap(`mindmap
  root((mindmap))
    Origins
      Long history
      Popularisation
    Research
      On effectiveness
      On features
    Tools
      Pen and paper
      Mermaid`)
    expect(c.type).toBe('mindmap')
    expect(c.root.text).toBe('mindmap')
    expect(c.root.shape).toBe('circle')
    expect(c.root.children?.map((n) => n.text)).toEqual(['Origins', 'Research', 'Tools'])
    expect(c.root.children?.[0].children?.map((n) => n.text)).toEqual([
      'Long history',
      'Popularisation',
    ])
  })

  it('throws on non-mindmap input', () => {
    expect(() => parseMindmap('pie\n"A" : 1')).toThrow(/mindmap/i)
  })

  it('parses all shape wrappers', () => {
    const c = parseMindmap(`mindmap
  Root
    ((circle))
    (rounded)
    [square]
    {{hexagon}}
    )cloud(
    ))bang((
    plain`)
    const shapes = c.root.children?.map((n) => [n.text, n.shape ?? 'default'])
    expect(shapes).toEqual([
      ['circle', 'circle'],
      ['rounded', 'rounded'],
      ['square', 'square'],
      ['hexagon', 'hexagon'],
      ['cloud', 'cloud'],
      ['bang', 'bang'],
      ['plain', 'default'],
    ])
  })

  it('pops levels correctly when indentation decreases', () => {
    const c = parseMindmap(`mindmap
  Root
    A
      A1
    B
      B1
        B1a
    C`)
    expect(c.root.children?.map((n) => n.text)).toEqual(['A', 'B', 'C'])
    expect(c.root.children?.[1].children?.[0].children?.[0].text).toBe('B1a')
  })

  it('skips ::icon lines and comments', () => {
    const c = parseMindmap(`mindmap
  Root
    A
    ::icon(fa fa-book)
    %% comment
    B`)
    expect(c.root.children?.map((n) => n.text)).toEqual(['A', 'B'])
  })

  it('treats an id-prefixed node (id[text]) as its bracketed text', () => {
    const c = parseMindmap('mindmap\n  root)the cloud(\n    childId[Child label]')
    expect(c.root.text).toBe('the cloud')
    expect(c.root.shape).toBe('cloud')
    expect(c.root.children?.[0]).toMatchObject({ text: 'Child label', shape: 'square' })
  })

  it('nests mixed tab/space indentation sensibly (tab counts as two columns)', () => {
    const c = parseMindmap('mindmap\n  Root\n    A\n\t\t\tB')
    // three tabs = six columns > A's four spaces → B is A's child
    expect(c.root.children?.[0].text).toBe('A')
    expect(c.root.children?.[0].children?.[0].text).toBe('B')
  })

  it('defaults to a Root node when the mindmap body is empty', () => {
    const c = parseMindmap('mindmap')
    expect(c.root.text).toBe('Root')
  })
})
