import type { ErAttribute, ErCardinality, ErConfig, ErEntity, ErKey, ErRelationship } from '../types'

// Crow's-foot glyphs, read outward from the line: the left end's glyph is
// written mirrored relative to the right end's.
const LEFT_CARD: Record<string, ErCardinality> = {
  '||': 'exactly-one',
  '|o': 'zero-or-one',
  'o|': 'zero-or-one',
  '}|': 'one-or-more',
  '}o': 'zero-or-more',
}
const RIGHT_CARD: Record<string, ErCardinality> = {
  '||': 'exactly-one',
  'o|': 'zero-or-one',
  '|o': 'zero-or-one',
  '|{': 'one-or-more',
  'o{': 'zero-or-more',
}

const RELATIONSHIP = new RegExp(
  '^(\\w+)(?:\\[([^\\]]+)\\])?\\s*' +
    '(\\|\\||\\|o|o\\||\\}\\||\\}o)(--|\\.\\.)(\\|\\||o\\||\\|o|\\|\\{|o\\{)' +
    '\\s*(\\w+)(?:\\[([^\\]]+)\\])?\\s*(?::\\s*(?:"([^"]*)"|(.+)))?$',
)
const ENTITY_OPEN = /^(\w+)(?:\[([^\]]+)\])?\s*\{$/
const ATTRIBUTE = /^(\S+)\s+(\S+)((?:\s*,?\s*(?:PK|FK|UK))*)\s*(?:"([^"]*)")?$/

export function parseEr(text: string): ErConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  if (!/^erDiagram\b/.test(lines[0] ?? '')) throw new Error('Not an er diagram')

  const entities: ErEntity[] = []
  const relationships: ErRelationship[] = []

  const ensure = (id: string, label?: string): ErEntity => {
    let entity = entities.find((e) => e.id === id)
    if (!entity) {
      entity = { id }
      entities.push(entity)
    }
    if (label && entity.label === undefined) entity.label = label
    return entity
  }

  let openEntity: ErEntity | undefined
  for (const line of lines.slice(1)) {
    if (openEntity) {
      if (line === '}') {
        openEntity = undefined
        continue
      }
      const attr = line.match(ATTRIBUTE)
      if (attr) {
        const entry: ErAttribute = { type: attr[1], name: attr[2] }
        // The regex accepts separators loosely (commas, spaces, or nothing),
        // so extract the key tokens rather than splitting on one delimiter.
        const keys = ((attr[3] ?? '').match(/PK|FK|UK/g) ?? []) as ErKey[]
        if (keys.length > 0) entry.keys = keys
        if (attr[4] !== undefined) entry.comment = attr[4]
        ;(openEntity.attributes ??= []).push(entry)
      }
      continue
    }
    const rel = line.match(RELATIONSHIP)
    if (rel) {
      const [, leftId, leftLabel, leftGlyph, dash, rightGlyph, rightId, rightLabel, quoted, bare] = rel
      ensure(leftId, leftLabel)
      ensure(rightId, rightLabel)
      const relationship: ErRelationship = {
        from: leftId,
        to: rightId,
        fromCardinality: LEFT_CARD[leftGlyph],
        toCardinality: RIGHT_CARD[rightGlyph],
      }
      if (dash === '..') relationship.identifying = false
      const label = quoted ?? bare
      if (label !== undefined) relationship.label = label.trim()
      relationships.push(relationship)
      continue
    }
    const open = line.match(ENTITY_OPEN)
    if (open) {
      openEntity = ensure(open[1], open[2])
      continue
    }
    // Anything else is unsupported er syntax — silently ignored.
  }

  return { type: 'er', entities, relationships }
}
