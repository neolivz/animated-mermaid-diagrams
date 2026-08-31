import type {
  SequenceActivation,
  SequenceActor,
  SequenceConfig,
  SequenceFrame,
  SequenceStep,
} from '../types'

const SKIP = /^(autonumber\b)/i
// Ids are word characters only: since every arrow starts with '-', a \w+ id can
// never absorb part of an arrow token, so ambiguous lines fail safe (ignored).
const MESSAGE = /^(\w+)\s*(-->>|->>|--x|-x|-->|->)([+-])?\s*(\w+)\s*:\s*(.+)$/
const DECL = /^(actor|participant)\s+(\S+?)(?:\s+as\s+(.+))?$/
const NOTE = /^[Nn]ote\s+(?:over|left of|right of)\s+([^:]+):\s*(.+)$/
const FRAME_OPEN = /^(alt|opt|loop|par)(?:\s+(.*\S))?$/
const SECTION = /^(else|and)(?:\s+(.*\S))?$/
const ACTIVATE = /^activate\s+(\w+)$/
const DEACTIVATE = /^deactivate\s+(\w+)$/

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

  const frames: SequenceFrame[] = []
  const frameStack: SequenceFrame[] = []

  const activations: SequenceActivation[] = []
  const openActs = new Map<string, SequenceActivation[]>() // actor -> open stack
  const beginAct = (actor: string, fromStep: number): void => {
    const stack = openActs.get(actor) ?? []
    const act: SequenceActivation = { actor, fromStep, toStep: -1, level: stack.length }
    stack.push(act)
    openActs.set(actor, stack)
  }
  const endAct = (actor: string, toStep: number): void => {
    const act = openActs.get(actor)?.pop()
    if (act) {
      act.toStep = Math.max(toStep, act.fromStep)
      activations.push(act)
    }
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
    const open = line.match(FRAME_OPEN)
    if (open) {
      frameStack.push({
        kind: open[1] as SequenceFrame['kind'],
        label: open[2],
        fromStep: steps.length,
        toStep: -1,
        sections: [],
        depth: frameStack.length,
      })
      continue
    }
    const section = line.match(SECTION)
    if (section) {
      const top = frameStack[frameStack.length - 1]
      // else belongs to alt, and belongs to par; anything else is ignored
      if (top && ((section[1] === 'else' && top.kind === 'alt') || (section[1] === 'and' && top.kind === 'par'))) {
        top.sections.push({ label: section[2], fromStep: steps.length })
      }
      continue
    }
    if (line === 'end') {
      const top = frameStack.pop()
      if (top) {
        top.toStep = steps.length - 1
        if (top.toStep >= top.fromStep) frames.push(top)
      }
      continue
    }
    const activate = line.match(ACTIVATE)
    if (activate) {
      ensure(activate[1])
      beginAct(activate[1], Math.max(steps.length - 1, 0))
      continue
    }
    const deactivate = line.match(DEACTIVATE)
    if (deactivate) {
      endAct(deactivate[1], steps.length - 1)
      continue
    }
    const msg = line.match(MESSAGE)
    if (msg) {
      ensure(msg[1])
      ensure(msg[4])
      const arrow = msg[2]
      const shorthand = msg[3]
      const step: SequenceStep = {
        from: msg[1],
        to: msg[4],
        text: msg[5],
        type: arrow.startsWith('--') ? 'response' : 'request',
      }
      if (arrow.endsWith('x')) step.failed = true
      steps.push(step)
      const thisStepIndex = steps.length - 1
      if (shorthand === '+') beginAct(msg[4], thisStepIndex)
      else if (shorthand === '-') endAct(msg[1], thisStepIndex)
      continue
    }
    if (SKIP.test(line)) continue
    // Anything else is unsupported v1 syntax — silently ignored per spec.
  }

  // Close unterminated frames at EOF, innermost first (stack pop order).
  while (frameStack.length > 0) {
    const top = frameStack.pop()
    if (top) {
      top.toStep = steps.length - 1
      if (top.toStep >= top.fromStep) frames.push(top)
    }
  }

  // Close unclosed activations at the last step, only when steps exist.
  if (steps.length > 0) {
    for (const stack of openActs.values()) {
      while (stack.length > 0) {
        const act = stack.pop()
        if (act) {
          act.toStep = steps.length - 1
          activations.push(act)
        }
      }
    }
  }

  return {
    type: 'sequence',
    actors,
    steps,
    ...(frames.length > 0 ? { frames } : {}),
    ...(activations.length > 0 ? { activations } : {}),
  }
}
