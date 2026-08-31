import { describe, it, expect } from 'vitest'
import { layoutSequence, HEADER_H, FRAME_TOP, SECTION_DIV, FRAME_BOTTOM } from '../src/sequence/layout'
import { estimateTextWidth } from '../src/svg'
import type { SequenceActor, SequenceStep, SequenceFrame, SequenceActivation } from '../src/types'

const actors: SequenceActor[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'A much longer label' },
]

describe('layoutSequence', () => {
  it('positions actors left to right with increasing x centers', () => {
    const L = layoutSequence(actors, [])
    expect(L.actors[0].x).toBeLessThan(L.actors[1].x)
    expect(L.actors[1].x).toBeLessThan(L.actors[2].x)
  })

  it('gives wider boxes to longer labels', () => {
    const L = layoutSequence(actors, [])
    expect(L.actors[2].w).toBeGreaterThan(L.actors[0].w)
  })

  it('assigns increasing y positions per step, starting below the header', () => {
    const steps: SequenceStep[] = [
      { from: 'a', to: 'b', text: 'one' },
      { from: 'b', to: 'c', text: 'two' },
      { over: 'b', text: 'note', type: 'note' },
    ]
    const L = layoutSequence(actors, steps)
    expect(L.stepYs).toHaveLength(3)
    expect(L.stepYs[0]).toBeGreaterThan(HEADER_H)
    expect(L.stepYs[1]).toBeGreaterThan(L.stepYs[0])
    expect(L.stepYs[2]).toBeGreaterThan(L.stepYs[1])
  })

  it('reserves extra vertical room after self-messages', () => {
    const plain = layoutSequence(actors, [
      { from: 'a', to: 'b', text: 'x' },
      { from: 'a', to: 'b', text: 'y' },
    ])
    const withSelf = layoutSequence(actors, [
      { from: 'a', to: 'a', text: 'x' },
      { from: 'a', to: 'b', text: 'y' },
    ])
    expect(withSelf.stepYs[1]).toBeGreaterThan(plain.stepYs[1])
  })

  it('reserves horizontal room for self-message labels that reach past the last actor', () => {
    const without = layoutSequence(actors, [])
    const withSelf = layoutSequence(actors, [
      { from: 'c', to: 'c', text: 'a fairly long self message label' },
    ])
    expect(withSelf.width).toBeGreaterThan(without.width)
  })

  it('height grows with step count', () => {
    const short = layoutSequence(actors, [{ from: 'a', to: 'b', text: 'x' }])
    const long = layoutSequence(actors, Array.from({ length: 6 }, () => ({ from: 'a', to: 'b', text: 'x' })))
    expect(long.height).toBeGreaterThan(short.height)
  })

  it('widens spacing so long message text fits between its lifelines', () => {
    const text = 'a very long message that needs much more room'
    const short = layoutSequence(actors, [{ from: 'a', to: 'b', text: 'hi' }])
    const long = layoutSequence(actors, [{ from: 'a', to: 'b', text }])
    expect(long.actors[1].x - long.actors[0].x).toBeGreaterThan(short.actors[1].x - short.actors[0].x)
    expect(long.actors[1].x - long.actors[0].x).toBeGreaterThanOrEqual(estimateTextWidth(text, 13) + 16)
  })

  it('keeps middle-actor self-message loops clear of the next actor box', () => {
    const text = 'validates cached credentials'
    const L = layoutSequence(actors, [{ from: 'a', to: 'a', text }])
    const labelEnd = L.actors[0].x + 48 + estimateTextWidth(text, 13) + 8
    const nextBoxLeft = L.actors[1].x - L.actors[1].w / 2
    expect(nextBoxLeft).toBeGreaterThanOrEqual(labelEnd + 20)
  })

  it('folds wide notes into the bounds and shifts content right when they overhang', () => {
    const noteText = 'a note far wider than the single actor it sits over'
    const plain = layoutSequence(actors, [])
    const L = layoutSequence(actors, [{ over: 'a', text: noteText, type: 'note' }])
    expect(L.width).toBeGreaterThan(plain.width)
    expect(L.actors[0].x).toBeGreaterThan(plain.actors[0].x)
  })

  it('defaults frames/activations to empty arrays when omitted', () => {
    const L = layoutSequence(actors, [{ from: 'a', to: 'b', text: 'hi' }])
    expect(L.frames).toEqual([])
    expect(L.activations).toEqual([])
  })

  describe('frame layout', () => {
    it('grows stepYs and height by exact FRAME_TOP/SECTION_DIV/FRAME_BOTTOM deltas for a 2-step alt/else', () => {
      const steps: SequenceStep[] = [
        { from: 'a', to: 'b', text: 'first' },
        { from: 'b', to: 'a', text: 'second' },
      ]
      const frame: SequenceFrame = {
        kind: 'alt',
        label: 'happy path',
        fromStep: 0,
        toStep: 1,
        sections: [{ label: 'sad', fromStep: 1 }],
        depth: 0,
      }
      const baseline = layoutSequence(actors, steps)
      const withFrame = layoutSequence(actors, steps, [frame])

      expect(withFrame.stepYs[0] - baseline.stepYs[0]).toBe(FRAME_TOP)
      expect(withFrame.stepYs[1] - baseline.stepYs[1]).toBe(FRAME_TOP + SECTION_DIV)
      expect(withFrame.height - baseline.height).toBe(FRAME_TOP + SECTION_DIV + FRAME_BOTTOM)
    })

    it('nests frame boxes opening at the same step so the outer box strictly contains the inner box', () => {
      const steps: SequenceStep[] = [{ from: 'a', to: 'b', text: 'x' }]
      // Parser emits innermost-first: the nested (opt) frame comes before the
      // outer (alt) frame in the `frames` array, even though both open at step 0.
      const inner: SequenceFrame = { kind: 'opt', label: 'inner', fromStep: 0, toStep: 0, sections: [], depth: 1 }
      const outer: SequenceFrame = { kind: 'alt', label: 'outer', fromStep: 0, toStep: 0, sections: [], depth: 0 }
      const L = layoutSequence(actors, steps, [inner, outer])

      const innerBox = L.frames.find((f) => f.frame === inner)!
      const outerBox = L.frames.find((f) => f.frame === outer)!
      expect(outerBox.x1).toBeLessThan(innerBox.x1)
      expect(outerBox.x2).toBeGreaterThan(innerBox.x2)
      expect(outerBox.y1).toBeLessThan(innerBox.y1)
      expect(outerBox.y2).toBeGreaterThan(innerBox.y2)
    })

    it('frame box covers the y of every contained step and excludes steps outside its range', () => {
      const steps: SequenceStep[] = [
        { from: 'a', to: 'b', text: 'zero' },
        { from: 'b', to: 'a', text: 'one' },
        { from: 'a', to: 'b', text: 'two' },
        { from: 'b', to: 'a', text: 'three' },
      ]
      const frame: SequenceFrame = { kind: 'opt', fromStep: 1, toStep: 2, sections: [], depth: 0 }
      const L = layoutSequence(actors, steps, [frame])
      const box = L.frames[0]

      expect(box.y1).toBeLessThan(L.stepYs[1])
      expect(box.y2).toBeGreaterThan(L.stepYs[2])
      // outside the frame's range
      expect(box.y1).toBeGreaterThan(L.stepYs[0])
      expect(box.y2).toBeLessThan(L.stepYs[3])
    })

    it('folds frame padding into layout width and grows it beyond a frameless baseline', () => {
      const steps: SequenceStep[] = [{ from: 'c', to: 'c', text: 'x' }]
      const frame: SequenceFrame = { kind: 'opt', fromStep: 0, toStep: 0, sections: [], depth: 0 }
      const baseline = layoutSequence(actors, steps)
      const withFrame = layoutSequence(actors, steps, [frame])
      expect(withFrame.width).toBeGreaterThan(baseline.width)
    })
  })

  describe('activation layout', () => {
    it('offsets overlapping activation bars on the same actor by 4px per level', () => {
      const steps: SequenceStep[] = [
        { from: 'a', to: 'b', text: 'outer' },
        { from: 'b', to: 'b', text: 'inner' },
        { from: 'b', to: 'a', text: 'done' },
      ]
      const level0: SequenceActivation = { actor: 'b', fromStep: 0, toStep: 2, level: 0 }
      const level1: SequenceActivation = { actor: 'b', fromStep: 1, toStep: 1, level: 1 }
      const L = layoutSequence(actors, steps, [], [level0, level1])

      const box0 = L.activations.find((a) => a.activation === level0)!
      const box1 = L.activations.find((a) => a.activation === level1)!
      expect(box1.x - box0.x).toBe(4)
      expect(box0.y1).toBe(L.stepYs[0])
      expect(box0.y2).toBe(L.stepYs[2] + 8)
    })
  })
})
