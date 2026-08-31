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
// Renderer contract (Task 8): message/note text is 13px; notes spread 30px past
// their lifelines with 20px text padding; self-message labels start 48px right
// of the lifeline; the self-loop curve itself reaches ~55px. Exported so
// src/sequence/render.ts shares these instead of duplicating the magic numbers.
export const MSG_FONT = 13
export const MSG_PAD = 16
export const SELF_LABEL_X = 48
export const SELF_CLEARANCE = 20
export const NOTE_SPREAD = 30
export const NOTE_PAD = 20
export const SELF_CURVE_REACH = 55
export const SELF_CURVE_DROP = 28
export const SELF_TIP_GAP = 6

function selfReach(s: SequenceStep): number {
  return Math.max(SELF_CURVE_REACH + 15, SELF_LABEL_X + estimateTextWidth(s.text, MSG_FONT) + 8)
}

export interface NoteBounds {
  cx: number
  w: number
}

/** Shared by layout (bounds budgeting) and render (drawing) so they can't drift.
 *  Returns null when no referenced actor id resolves — such notes are skipped. */
export function noteBounds(
  step: SequenceStep,
  xOfId: (id: string) => number | undefined,
): NoteBounds | null {
  const ids = Array.isArray(step.over) ? step.over : [step.over ?? step.from ?? '']
  const xs = ids.map(xOfId).filter((x): x is number => x !== undefined)
  if (xs.length === 0) return null
  const x1 = Math.min(...xs) - NOTE_SPREAD
  const x2 = Math.max(...xs) + NOTE_SPREAD
  const w = Math.max(x2 - x1, estimateTextWidth(step.text, MSG_FONT) + NOTE_PAD)
  return { cx: (x1 + x2) / 2, w }
}

export function layoutSequence(actors: SequenceActor[], steps: SequenceStep[]): SequenceLayout {
  const widths = actors.map((a) => Math.max(estimateTextWidth(a.label) + 28, 80))
  const index = new Map(actors.map((a, i) => [a.id, i]))
  const gaps: number[] = new Array(Math.max(actors.length - 1, 0)).fill(ACTOR_GAP)

  const centers = (): number[] => {
    const xs: number[] = []
    let x = 0
    for (let i = 0; i < actors.length; i++) {
      xs.push(x + widths[i] / 2)
      x += widths[i] + (i < gaps.length ? gaps[i] : 0)
    }
    return xs
  }

  let xs = centers()

  // Widen gaps so message text fits between its endpoints' lifelines.
  for (const s of steps) {
    if (s.type === 'note' || s.from === undefined || s.to === undefined || s.from === s.to) continue
    const i = index.get(s.from)
    const j = index.get(s.to)
    if (i === undefined || j === undefined || i === j) continue
    const [lo, hi] = i < j ? [i, j] : [j, i]
    const needed = estimateTextWidth(s.text, MSG_FONT) + MSG_PAD
    const span = xs[hi] - xs[lo]
    if (needed > span) {
      const add = (needed - span) / (hi - lo)
      for (let g = lo; g < hi; g++) gaps[g] += add
      xs = centers()
    }
  }

  // Self-message loop + label must clear the next actor's box.
  for (const s of steps) {
    if (s.type === 'note' || s.from === undefined || s.from !== s.to) continue
    const i = index.get(s.from)
    if (i === undefined || i >= gaps.length) continue
    const needed = selfReach(s) + widths[i + 1] / 2 + SELF_CLEARANCE
    const span = xs[i + 1] - xs[i]
    if (needed > span) {
      gaps[i] += needed - span
      xs = centers()
    }
  }

  // Bounds: actor boxes, trailing self reaches, and note extents (which may
  // overhang either edge — content is shifted right by -minX to stay in-bounds).
  let minX = 0
  let maxX = actors.length > 0 ? xs[actors.length - 1] + widths[actors.length - 1] / 2 : 0
  for (const s of steps) {
    if (s.type === 'note') {
      const nb = noteBounds(s, (id) => {
        const i = index.get(id)
        return i === undefined ? undefined : xs[i]
      })
      if (nb) {
        minX = Math.min(minX, nb.cx - nb.w / 2)
        maxX = Math.max(maxX, nb.cx + nb.w / 2)
      }
    } else if (s.from !== undefined && s.from === s.to) {
      const i = index.get(s.from)
      if (i !== undefined) maxX = Math.max(maxX, xs[i] + selfReach(s))
    }
  }

  const offsetX = -minX
  const placed: ActorLayout[] = actors.map((a, i) => ({ actor: a, x: xs[i] + offsetX, w: widths[i] }))

  const stepYs: number[] = []
  let y = HEADER_H + 40
  for (const s of steps) {
    stepYs.push(y)
    y += STEP_GAP
    if (s.type !== 'note' && s.from !== undefined && s.from === s.to) y += SELF_EXTRA
  }
  return { actors: placed, stepYs, width: maxX - minX, height: y }
}
