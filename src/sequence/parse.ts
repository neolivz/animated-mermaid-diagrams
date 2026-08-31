import type { SequenceActor, SequenceConfig, SequenceStep } from '../types'

const SKIP = /^(alt\b|else\b|opt\b|loop\b|par\b|and\b|end$|activate\b|deactivate\b|autonumber\b)/i
// Ids are word characters only: since every arrow starts with '-', a \w+ id can
// never absorb part of an arrow token, so ambiguous lines fail safe (ignored).
const MESSAGE = /^(\w+)\s*(-->>|->>|--x|-x|-->|->)\s*(\w+)\s*:\s*(.+)$/
const DECL = /^(actor|participant)\s+(\S+?)(?:\s+as\s+(.+))?$/
const NOTE = /^[Nn]ote\s+(?:over|left of|right of)\s+([^:]+):\s*(.+)$/

export function parseSequence(text: string): SequenceConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  if (!/^sequenceDiagram\b/.test(lines[0] ?? '')) throw new Error('Not a sequence diagram')

  const actors: SequenceActor[] = []
  const steps: SequenceStep[] = []
  const ensure = (id: string): void => {
    if (!actors.some((a) => a.id === id)) actors.push({ id, label: id, type: 'participant' })
  }

  for (const line of lines.slice(1)) {
    const decl = line.match(DECL)
    if (decl) {
      const id = decl[2]
      const label = decl[3] ?? id
      const type = decl[1] as 'actor' | 'participant'
      const existing = actors.find((a) => a.id === id)
      if (existing) {
        existing.label = label
        existing.type = type
      } else {
        actors.push({ id, label, type })
      }
      continue
    }
    const note = line.match(NOTE)
    if (note) {
      const over = note[1].split(',').map((s) => s.trim())
      over.forEach(ensure)
      steps.push({ over: over.length === 1 ? over[0] : over, text: note[2], type: 'note' })
      continue
    }
    const msg = line.match(MESSAGE)
    if (msg) {
      ensure(msg[1])
      ensure(msg[3])
      const arrow = msg[2]
      const step: SequenceStep = {
        from: msg[1],
        to: msg[3],
        text: msg[4],
        type: arrow.startsWith('--') ? 'response' : 'request',
      }
      if (arrow.endsWith('x')) step.failed = true
      steps.push(step)
      continue
    }
    if (SKIP.test(line)) continue
    // Anything else is unsupported v1 syntax — silently ignored per spec.
  }

  return { type: 'sequence', actors, steps }
}
