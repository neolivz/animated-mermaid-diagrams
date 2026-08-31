import { describe, it, expect } from 'vitest'
import { layoutSequence, HEADER_H } from '../src/sequence/layout'
import { estimateTextWidth } from '../src/svg'
import type { SequenceActor, SequenceStep } from '../src/types'

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

  it('keeps middle-actor self-message loops clear of the next lifeline', () => {
    const text = 'validates cached credentials'
    const L = layoutSequence(actors, [{ from: 'a', to: 'a', text }])
    expect(L.actors[1].x - L.actors[0].x).toBeGreaterThanOrEqual(48 + estimateTextWidth(text, 13) + 8 + 20)
  })

  it('folds wide notes into the bounds and shifts content right when they overhang', () => {
    const noteText = 'a note far wider than the single actor it sits over'
    const plain = layoutSequence(actors, [])
    const L = layoutSequence(actors, [{ over: 'a', text: noteText, type: 'note' }])
    expect(L.width).toBeGreaterThan(plain.width)
    expect(L.actors[0].x).toBeGreaterThan(plain.actors[0].x)
  })
})
