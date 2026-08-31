import { estimateTextWidth } from '../svg'
import type { SequenceActivation, SequenceActor, SequenceFrame, SequenceStep } from '../types'

export interface ActorLayout {
  actor: SequenceActor
  /** lifeline x (center of the actor box) */
  x: number
  w: number
}

export interface FrameBox {
  frame: SequenceFrame
  x1: number
  y1: number
  x2: number
  y2: number
  /** y of each section divider line, matching frame.sections order */
  sectionYs: number[]
}

export interface ActivationBox {
  activation: SequenceActivation
  /** left edge */
  x: number
  y1: number
  y2: number
}

export interface SequenceLayout {
  actors: ActorLayout[]
  /** y of each step's message line / note center */
  stepYs: number[]
  width: number
  height: number
  frames: FrameBox[]
  activations: ActivationBox[]
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

// Frame chrome (alt/opt/loop/par) and section dividers (else/and).
export const FRAME_TOP = 26
export const SECTION_DIV = 24
export const FRAME_BOTTOM = 12
export const FRAME_PAD_X = 30

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

export function layoutSequence(
  actors: SequenceActor[],
  steps: SequenceStep[],
  frames: SequenceFrame[] = [],
  activations: SequenceActivation[] = [],
): SequenceLayout {
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

  // Fold frame x-extents into bounds too, mirroring notes above. Extents are
  // computed in the pre-offset `xs` coordinate space and shifted below once
  // `offsetX` is known, alongside everything else.
  const frameRawX = new Map<SequenceFrame, { x1: number; x2: number }>()
  for (const f of frames) {
    const touches: number[] = []
    for (let k = f.fromStep; k <= f.toStep && k < steps.length; k++) {
      const s = steps[k]
      if (s.type === 'note') {
        const nb = noteBounds(s, (id) => {
          const i = index.get(id)
          return i === undefined ? undefined : xs[i]
        })
        if (nb) touches.push(nb.cx - nb.w / 2, nb.cx + nb.w / 2)
      } else if (s.from !== undefined && s.to !== undefined && s.from === s.to) {
        const i = index.get(s.from)
        if (i !== undefined) touches.push(xs[i], xs[i] + selfReach(s))
      } else if (s.from !== undefined && s.to !== undefined) {
        const i = index.get(s.from)
        const j = index.get(s.to)
        if (i !== undefined) touches.push(xs[i])
        if (j !== undefined) touches.push(xs[j])
      }
    }
    if (touches.length === 0) continue
    const pad = Math.max(FRAME_PAD_X - f.depth * 8, 10)
    const x1 = Math.min(...touches) - pad
    const x2 = Math.max(...touches) + pad
    frameRawX.set(f, { x1, x2 })
    minX = Math.min(minX, x1)
    maxX = Math.max(maxX, x2)
  }

  const offsetX = -minX
  const placed: ActorLayout[] = actors.map((a, i) => ({ actor: a, x: xs[i] + offsetX, w: widths[i] }))

  // Per-step y, threading in frame/section chrome bands. Frames arrive
  // innermost-first from the parser (see Task 1 self-review notes): opening
  // bands (FRAME_TOP/SECTION_DIV) must stack outer-band-above-inner-band, so
  // we walk a reversed copy for those; closing bands (FRAME_BOTTOM) want the
  // inner frame's band to sit closer to the step, so those use the parser's
  // natural (innermost-first) order.
  const reversedFrames = [...frames].reverse()
  const frameY = new Map<SequenceFrame, { y1: number; y2: number; sectionYs: number[] }>()
  for (const f of frames) frameY.set(f, { y1: 0, y2: 0, sectionYs: new Array(f.sections.length).fill(0) })

  const stepYs: number[] = []
  let y = HEADER_H + 40
  for (let i = 0; i < steps.length; i++) {
    for (const f of reversedFrames) {
      if (f.fromStep === i) {
        frameY.get(f)!.y1 = y
        y += FRAME_TOP
      }
    }
    for (const f of reversedFrames) {
      f.sections.forEach((sec, si) => {
        if (sec.fromStep === i) {
          frameY.get(f)!.sectionYs[si] = y
          y += SECTION_DIV
        }
      })
    }

    stepYs.push(y)
    const s = steps[i]
    y += STEP_GAP
    if (s.type !== 'note' && s.from !== undefined && s.from === s.to) y += SELF_EXTRA

    for (const f of frames) {
      if (f.toStep === i) {
        frameY.get(f)!.y2 = y
        y += FRAME_BOTTOM
      }
    }
  }

  const frameBoxes: FrameBox[] = frames.map((f) => {
    const raw = frameRawX.get(f)
    const rec = frameY.get(f)!
    return {
      frame: f,
      x1: (raw?.x1 ?? 0) + offsetX,
      x2: (raw?.x2 ?? 0) + offsetX,
      y1: rec.y1,
      y2: rec.y2,
      sectionYs: rec.sectionYs,
    }
  })

  const xById = new Map(placed.map((a) => [a.actor.id, a.x]))
  const activationBoxes: ActivationBox[] = activations.map((act) => ({
    activation: act,
    x: (xById.get(act.actor) ?? 0) - 5 + act.level * 4,
    y1: stepYs[act.fromStep] ?? 0,
    y2: (stepYs[act.toStep] ?? 0) + 8,
  }))

  return {
    actors: placed,
    stepYs,
    width: maxX - minX,
    height: y,
    frames: frameBoxes,
    activations: activationBoxes,
  }
}
