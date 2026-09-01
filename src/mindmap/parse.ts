import type { MindmapConfig, MindmapNode, MindmapShape } from '../types'

// Order matters: double-delimiter shapes must match before their single forms.
const SHAPES: { re: RegExp; shape: MindmapShape }[] = [
  { re: /^(?:\w+)?\)\)(.+)\(\($/, shape: 'bang' },
  { re: /^(?:\w+)?\(\((.+)\)\)$/, shape: 'circle' },
  { re: /^(?:\w+)?\{\{(.+)\}\}$/, shape: 'hexagon' },
  { re: /^(?:\w+)?\[(.+)\]$/, shape: 'square' },
  { re: /^(?:\w+)?\)(.+)\($/, shape: 'cloud' },
  { re: /^(?:\w+)?\((.+)\)$/, shape: 'rounded' },
]

function parseNode(raw: string): MindmapNode {
  for (const { re, shape } of SHAPES) {
    const m = raw.match(re)
    if (m) return { text: m[1].trim(), shape }
  }
  return { text: raw }
}

export function parseMindmap(text: string): MindmapConfig {
  const rawLines = text.split('\n')
  const first = rawLines.map((l) => l.trim()).find((l) => l.length > 0 && !l.startsWith('%%'))
  if (!first || !/^mindmap\b/.test(first)) throw new Error('Not a mindmap')

  // Indentation is significant — keep raw lines, skip blanks/comments/icons.
  const lines = rawLines
    .slice(rawLines.findIndex((l) => l.trim().startsWith('mindmap')) + 1)
    .filter((l) => {
      const s = l.trim()
      return s.length > 0 && !s.startsWith('%%') && !s.startsWith('::icon')
    })

  if (lines.length === 0) return { type: 'mindmap', root: { text: 'Root' } }

  // Tabs count as two columns so mixed tab/space files nest sensibly.
  const indentOf = (l: string): number => {
    let n = 0
    for (const ch of l) {
      if (ch === ' ') n += 1
      else if (ch === '\t') n += 2
      else break
    }
    return n
  }

  const root = parseNode(lines[0].trim())
  const stack: { indent: number; node: MindmapNode }[] = [{ indent: indentOf(lines[0]), node: root }]

  for (const line of lines.slice(1)) {
    const indent = indentOf(line)
    const node = parseNode(line.trim())
    // Pop to the nearest shallower level; a line at/above the root's indent
    // (which Mermaid rejects) leniently becomes a child of the root.
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack[stack.length - 1].node
    ;(parent.children ??= []).push(node)
    stack.push({ indent, node })
  }

  return { type: 'mindmap', root }
}
