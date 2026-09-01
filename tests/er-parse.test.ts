import { describe, it, expect } from 'vitest'
import { parseEr } from '../src/er/parse'

describe('parseEr', () => {
  it('parses the Mermaid docs example', () => {
    const c = parseEr(`erDiagram
      CUSTOMER ||--o{ ORDER : places
      ORDER ||--|{ LINE_ITEM : contains
      CUSTOMER }|..|{ DELIVERY_ADDRESS : uses`)
    expect(c.type).toBe('er')
    expect(c.entities.map((e) => e.id)).toEqual([
      'CUSTOMER',
      'ORDER',
      'LINE_ITEM',
      'DELIVERY_ADDRESS',
    ])
    expect(c.relationships[0]).toEqual({
      from: 'CUSTOMER',
      to: 'ORDER',
      fromCardinality: 'exactly-one',
      toCardinality: 'zero-or-more',
      label: 'places',
    })
    expect(c.relationships[2]).toEqual({
      from: 'CUSTOMER',
      to: 'DELIVERY_ADDRESS',
      fromCardinality: 'one-or-more',
      toCardinality: 'one-or-more',
      identifying: false,
      label: 'uses',
    })
  })

  it('throws on non-er input', () => {
    expect(() => parseEr('classDiagram\nA --> B')).toThrow(/er/i)
  })

  it('maps every cardinality glyph on both ends', () => {
    const c = parseEr(`erDiagram
      A ||--|| B : r1
      C |o--o| D : r2
      E }|--|{ F : r3
      G }o--o{ H : r4`)
    const cards = c.relationships.map((r) => [r.fromCardinality, r.toCardinality])
    expect(cards).toEqual([
      ['exactly-one', 'exactly-one'],
      ['zero-or-one', 'zero-or-one'],
      ['one-or-more', 'one-or-more'],
      ['zero-or-more', 'zero-or-more'],
    ])
  })

  it('parses entity blocks with typed attributes, keys, and comments', () => {
    const c = parseEr(`erDiagram
      CUSTOMER {
        string name
        string custNumber PK
        string sector FK, UK "the customer sector"
      }`)
    expect(c.entities[0].attributes).toEqual([
      { type: 'string', name: 'name' },
      { type: 'string', name: 'custNumber', keys: ['PK'] },
      { type: 'string', name: 'sector', keys: ['FK', 'UK'], comment: 'the customer sector' },
    ])
  })

  it('parses key lists regardless of separator: commas, spaces, or none', () => {
    const c = parseEr('erDiagram\nA {\nint a PK FK\nint b PK,FK\nint c UKFK\n}')
    expect(c.entities[0].attributes?.map((x) => x.keys)).toEqual([
      ['PK', 'FK'],
      ['PK', 'FK'],
      ['UK', 'FK'],
    ])
  })

  it('merges a block into an entity already created by a relationship', () => {
    const c = parseEr(`erDiagram
      CUSTOMER ||--o{ ORDER : places
      CUSTOMER {
        string name
      }`)
    expect(c.entities).toHaveLength(2)
    expect(c.entities[0].attributes).toHaveLength(1)
  })

  it('supports quoted labels and aliased entities', () => {
    const c = parseEr('erDiagram\np[Person] {\nstring firstName\n}\np ||--o{ CAR : "driver of"')
    expect(c.entities[0]).toMatchObject({ id: 'p', label: 'Person' })
    expect(c.relationships[0].label).toBe('driver of')
  })

  it('ignores comments, blanks, and unknown lines', () => {
    const c = parseEr('erDiagram\n%% note\n\ntitle nope\nA ||--|| B : x')
    expect(c.relationships).toHaveLength(1)
  })
})
