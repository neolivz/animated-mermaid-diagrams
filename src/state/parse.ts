import type { StateConfig, StateNode, StateTransition } from '../types'

// Synthetic end-state id. A user-authored state literally named '__end' will collide (accepted v1 limitation).
const END_ID = '__end'
const TRANSITION = /^(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)(?:\s*:\s*(.+))?$/
const DESCRIBED = /^state\s+"([^"]+)"\s+as\s+(\w+)\s*$/
const COMPOSITE_OPEN = /^state\s+(\w+)\s*\{$/

export function parseState(text: string): StateConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  if (!/^stateDiagram(-v2)?\b/.test(lines[0] ?? '')) throw new Error('Not a state diagram')

  const states: StateNode[] = []
  const transitions: StateTransition[] = []
  let initial: string | undefined

  const ensure = (id: string): void => {
    if (!states.some((s) => s.id === id)) states.push({ id, text: id })
  }
  const ensureEnd = (): string => {
    if (!states.some((s) => s.id === END_ID)) states.push({ id: END_ID, text: '', type: 'end' })
    return END_ID
  }

  for (const line of lines.slice(1)) {
    const described = line.match(DESCRIBED)
    if (described) {
      const existing = states.find((s) => s.id === described[2])
      if (!existing) {
        states.push({ id: described[2], text: described[1] })
      } else if (existing.text === existing.id) {
        // auto-placeholdered by ensure(); adopt the real description
        existing.text = described[1]
      }
      continue
    }
    const composite = line.match(COMPOSITE_OPEN)
    if (composite) {
      // v1: composite grouping ignored; the state itself is registered and the
      // block's inner lines parse as normal top-level transitions.
      ensure(composite[1])
      continue
    }
    if (line === '}') continue
    const tr = line.match(TRANSITION)
    if (tr) {
      const [, rawFrom, rawTo, trLabel] = tr
      if (rawFrom === '[*]' && rawTo === '[*]') continue
      if (rawFrom === '[*]') {
        ensure(rawTo)
        if (initial === undefined) initial = rawTo
        continue
      }
      ensure(rawFrom)
      const to = rawTo === '[*]' ? ensureEnd() : (ensure(rawTo), rawTo)
      const transition: StateTransition = { from: rawFrom, to }
      if (trLabel) transition.label = trLabel.trim()
      transitions.push(transition)
      continue
    }
    // Anything else is unsupported v1 syntax — silently ignored per spec.
  }

  const config: StateConfig = { type: 'state', states, transitions }
  // Fallback: first state that participates in a transition (an orphan declared
  // via `state "..." as x` should not hijack the flow's entry point).
  const firstInFlow = states.find((s) =>
    transitions.some((tr) => tr.from === s.id || tr.to === s.id),
  )
  config.initial = initial ?? firstInFlow?.id ?? states[0]?.id
  return config
}
