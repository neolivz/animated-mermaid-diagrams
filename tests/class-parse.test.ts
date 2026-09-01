import { describe, it, expect } from 'vitest'
import { parseClass } from '../src/class/parse'

describe('parseClass', () => {
  it('parses class blocks with attributes and methods', () => {
    const c = parseClass(`classDiagram
      class Animal {
        +String name
        +int age
        +isMammal() bool
      }`)
    expect(c.type).toBe('class')
    expect(c.classes).toHaveLength(1)
    expect(c.classes[0].id).toBe('Animal')
    expect(c.classes[0].attributes).toEqual(['+String name', '+int age'])
    expect(c.classes[0].methods).toEqual(['+isMammal() bool'])
  })

  it('throws on non-class input', () => {
    expect(() => parseClass('erDiagram\nA ||--o{ B : has')).toThrow(/class/i)
  })

  it('normalizes <|-- so the inheritance triangle lands at the parent (to end)', () => {
    const c = parseClass('classDiagram\nAnimal <|-- Duck')
    expect(c.relations[0]).toEqual({ from: 'Duck', to: 'Animal', type: 'inheritance' })
    expect(c.classes.map((k) => k.id).sort()).toEqual(['Animal', 'Duck'])
  })

  it('supports the mirrored --|> form', () => {
    const c = parseClass('classDiagram\nDuck --|> Animal')
    expect(c.relations[0]).toEqual({ from: 'Duck', to: 'Animal', type: 'inheritance' })
  })

  it('maps all arrow forms to the right types', () => {
    const c = parseClass(`classDiagram
      Whole *-- Part
      Box o-- Item
      A --> B
      C ..> D
      E ..|> F
      G -- H
      I .. J`)
    const types = c.relations.map((r) => [r.from, r.to, r.type ?? 'association', r.dashed ?? false])
    expect(types).toContainEqual(['Part', 'Whole', 'composition', false])
    expect(types).toContainEqual(['Item', 'Box', 'aggregation', false])
    expect(types).toContainEqual(['A', 'B', 'association', false])
    expect(types).toContainEqual(['C', 'D', 'dependency', false])
    expect(types).toContainEqual(['E', 'F', 'realization', false])
    expect(types).toContainEqual(['G', 'H', 'link', false])
    expect(types).toContainEqual(['I', 'J', 'link', true])
  })

  it('parses labels and quoted cardinalities, swapping them with the normalization', () => {
    const c = parseClass('classDiagram\nAnimal "1" <|-- "many" Duck : kind of')
    expect(c.relations[0]).toEqual({
      from: 'Duck',
      to: 'Animal',
      type: 'inheritance',
      label: 'kind of',
      fromCardinality: 'many',
      toCardinality: '1',
    })
  })

  it('supports single-line members via Name : member', () => {
    const c = parseClass('classDiagram\nDuck : +String beakColor\nDuck : +swim()')
    expect(c.classes[0].attributes).toEqual(['+String beakColor'])
    expect(c.classes[0].methods).toEqual(['+swim()'])
  })

  it('parses <<annotation>> lines inside class blocks', () => {
    const c = parseClass('classDiagram\nclass Shape {\n<<interface>>\n+draw()\n}')
    expect(c.classes[0].annotation).toBe('<<interface>>')
    expect(c.classes[0].methods).toEqual(['+draw()'])
  })

  it('renders generics markers as angle brackets in the label', () => {
    const c = parseClass('classDiagram\nclass List~T~ {\n+get(i) T\n}')
    expect(c.classes[0].id).toBe('List')
    expect(c.classes[0].label).toBe('List<T>')
  })

  it('parses a direction line', () => {
    const c = parseClass('classDiagram\ndirection LR\nA --> B')
    expect(c.direction).toBe('LR')
  })

  it('ignores comments, blanks, and unknown lines', () => {
    const c = parseClass('classDiagram\n%% note\n\nlink A "http://x" "tip"\nA --> B')
    expect(c.relations).toHaveLength(1)
  })
})
