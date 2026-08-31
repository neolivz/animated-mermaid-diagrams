export type DetectedType = 'sequence' | 'flowchart' | 'state'

export function detectType(text: string): DetectedType {
  const first = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('%%'))
  if (first === undefined) throw new Error('Empty diagram source')
  if (/^sequenceDiagram\b/.test(first)) return 'sequence'
  if (/^(flowchart|graph)\b/.test(first)) return 'flowchart'
  if (/^stateDiagram(-v2)?\b/.test(first)) return 'state'
  throw new Error(`Unsupported diagram type: "${first.split(/\s/)[0]}"`)
}
