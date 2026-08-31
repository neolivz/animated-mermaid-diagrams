import { estimateTextWidth } from '../svg'
import type { SequenceActor, SequenceStep } from '../types'

export interface ActorLayout {
  actor: SequenceActor
  /** lifeline x (center of the actor box) */
  x: number
  w: number
}

export interface SequenceLayout {
  actors: ActorLayout[]
  /** y of each step's message line / note center */
  stepYs: number[]
  width: number
  height: number
}

export const ACTOR_BOX_H = 40
export const HEADER_H = 56
const ACTOR_GAP = 80
const STEP_GAP = 46
const SELF_EXTRA = 24
const SELF_REACH = 90

export function layoutSequence(actors: SequenceActor[], steps: SequenceStep[]): SequenceLayout {
  const placed: ActorLayout[] = []
  let x = 0
  for (const actor of actors) {
    const w = Math.max(estimateTextWidth(actor.label) + 28, 80)
    placed.push({ actor, x: x + w / 2, w })
    x += w + ACTOR_GAP
  }
  const lastId = actors[actors.length - 1]?.id
  const selfOnLast = steps.some(
    (s) => s.type !== 'note' && s.from !== undefined && s.from === s.to && s.from === lastId,
  )
  const width = Math.max(x - ACTOR_GAP, 0) + (selfOnLast ? SELF_REACH : 0)

  const stepYs: number[] = []
  let y = HEADER_H + 40
  for (const s of steps) {
    stepYs.push(y)
    y += STEP_GAP
    if (s.type !== 'note' && s.from !== undefined && s.from === s.to) y += SELF_EXTRA
  }
  return { actors: placed, stepYs, width, height: y }
}
