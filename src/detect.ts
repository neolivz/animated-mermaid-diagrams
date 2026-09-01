export type DetectedType =
  | 'sequence'
  | 'flowchart'
  | 'state'
  | 'journey'
  | 'timeline'
  | 'class'
  | 'er'

export function detectType(text: string): DetectedType {
  const first = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('%%'))
  if (first === undefined) throw new Error('Empty diagram source')
  if (/^sequenceDiagram\b/.test(first)) return 'sequence'
  if (/^(flowchart|graph)\b/.test(first)) return 'flowchart'
  if (/^stateDiagram(-v2)?\b/.test(first)) return 'state'
  if (/^journey\b/.test(first)) return 'journey'
  if (/^timeline\b/.test(first)) return 'timeline'
  if (/^classDiagram\b/.test(first)) return 'class'
  if (/^erDiagram\b/.test(first)) return 'er'
  throw new Error(`Unsupported diagram type: "${first.split(/\s/)[0]}"`)
}
