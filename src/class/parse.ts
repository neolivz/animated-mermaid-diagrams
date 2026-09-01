import type { ClassConfig, ClassNode, ClassRelation, ClassRelationType, FlowDirection } from '../types'

// Longest tokens first so the alternation can't split e.g. `<|--` into `<` + `|--`.
const ARROWS = ['<|--', '--|>', '<|..', '..|>', '..>', '<..', '-->', '<--', '--*', '*--', '--o', 'o--', '--', '..'] as const
type Arrow = (typeof ARROWS)[number]

// Every relation stores its marker at the `to` end. `flip` means the marker in
// the Mermaid arrow sits at the LEFT id, so left becomes `to`.
const ARROW_MAP: Record<Arrow, { type: ClassRelationType; flip: boolean; dashed?: boolean }> = {
  '<|--': { type: 'inheritance', flip: true },
  '--|>': { type: 'inheritance', flip: false },
  '<|..': { type: 'realization', flip: true },
  '..|>': { type: 'realization', flip: false },
  '..>': { type: 'dependency', flip: false },
  '<..': { type: 'dependency', flip: true },
  '-->': { type: 'association', flip: false },
  '<--': { type: 'association', flip: true },
  '*--': { type: 'composition', flip: true },
  '--*': { type: 'composition', flip: false },
  'o--': { type: 'aggregation', flip: true },
  '--o': { type: 'aggregation', flip: false },
  '--': { type: 'link', flip: false },
  '..': { type: 'link', flip: false, dashed: true },
}

const arrowAlternation = ARROWS.map((a) => a.replace(/[|.*>]/g, '\\$&')).join('|')
const RELATION = new RegExp(
  `^(\\w+)(~[^~]+~)?\\s*(?:"([^"]*)"\\s*)?(${arrowAlternation})\\s*(?:"([^"]*)"\\s*)?(\\w+)(~[^~]+~)?\\s*(?::\\s*(.+))?$`,
)
const CLASS_OPEN = /^class\s+(\w+)(~[^~]+~)?\s*\{$/
const CLASS_BARE = /^class\s+(\w+)(~[^~]+~)?$/
const MEMBER_LINE = /^(\w+)(~[^~]+~)?\s*:\s*(.+)$/
const ANNOTATION = /^<<.+>>$/
const DIRECTION = /^direction\s+(TB|LR|BT|RL)$/

export function parseClass(text: string): ClassConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  if (!/^classDiagram\b/.test(lines[0] ?? '')) throw new Error('Not a class diagram')

  const classes: ClassNode[] = []
  const relations: ClassRelation[] = []
  let direction: FlowDirection | undefined

  const ensure = (id: string, generic?: string): ClassNode => {
    let node = classes.find((k) => k.id === id)
    if (!node) {
      node = { id }
      classes.push(node)
    }
    if (generic && node.label === undefined) node.label = `${id}<${generic.slice(1, -1)}>`
    return node
  }

  const addMember = (node: ClassNode, raw: string): void => {
    if (ANNOTATION.test(raw)) {
      node.annotation = raw
      return
    }
    if (raw.includes('(')) (node.methods ??= []).push(raw)
    else (node.attributes ??= []).push(raw)
  }

  let openClass: ClassNode | undefined
  for (const line of lines.slice(1)) {
    if (openClass) {
      if (line === '}') {
        openClass = undefined
        continue
      }
      addMember(openClass, line)
      continue
    }
    const dir = line.match(DIRECTION)
    if (dir) {
      direction = dir[1] as FlowDirection
      continue
    }
    const open = line.match(CLASS_OPEN)
    if (open) {
      openClass = ensure(open[1], open[2])
      continue
    }
    const bare = line.match(CLASS_BARE)
    if (bare) {
      ensure(bare[1], bare[2])
      continue
    }
    const rel = line.match(RELATION)
    if (rel) {
      const [, leftId, leftGen, leftCard, arrow, rightCard, rightId, rightGen, label] = rel
      ensure(leftId, leftGen)
      ensure(rightId, rightGen)
      const spec = ARROW_MAP[arrow as Arrow]
      const relation: ClassRelation = spec.flip
        ? { from: rightId, to: leftId }
        : { from: leftId, to: rightId }
      if (spec.type !== 'association') relation.type = spec.type
      if (spec.dashed) relation.dashed = true
      if (label) relation.label = label
      const fromCard = spec.flip ? rightCard : leftCard
      const toCard = spec.flip ? leftCard : rightCard
      if (fromCard) relation.fromCardinality = fromCard
      if (toCard) relation.toCardinality = toCard
      relations.push(relation)
      continue
    }
    const member = line.match(MEMBER_LINE)
    if (member) {
      addMember(ensure(member[1], member[2]), member[3])
      continue
    }
    // Anything else (link/click/callback/note/namespace…) is unsupported — ignored.
  }

  return {
    type: 'class',
    classes,
    relations,
    ...(direction !== undefined ? { direction } : {}),
  }
}
