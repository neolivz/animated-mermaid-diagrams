import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Animator, type AnimStep } from '../src/animator'

function line(): SVGLineElement {
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line') as SVGLineElement
  l.setAttribute('x1', '0'); l.setAttribute('y1', '0')
  l.setAttribute('x2', '100'); l.setAttribute('y2', '0')
  return l
}

function fadeEl(): SVGGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement
}

function makeSteps(): { steps: AnimStep[]; els: SVGElement[] } {
  const els = [fadeEl(), line(), fadeEl()]
  const steps: AnimStep[] = [
    [{ el: els[0], kind: 'fade' }],
    [{ el: els[1], kind: 'draw' }],
    [{ el: els[2], kind: 'scale' }],
  ]
  return { steps, els }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const OPTS = { stepDuration: 400, stepDelay: 100 }

describe('Animator', () => {
  it('hides all elements on construction', () => {
    const { steps, els } = makeSteps()
    new Animator(steps, OPTS)
    expect((els[0] as SVGElement).style.opacity).toBe('0')
    expect((els[1] as SVGElement).style.strokeDashoffset).not.toBe('')
    expect((els[2] as SVGElement).style.opacity).toBe('0')
  })

  it('play() steps through with onStepStart and onComplete', () => {
    const { steps, els } = makeSteps()
    const onStepStart = vi.fn()
    const onComplete = vi.fn()
    const a = new Animator(steps, { ...OPTS, onStepStart, onComplete })
    a.play()
    expect(onStepStart).toHaveBeenCalledWith(0)
    expect((els[0] as SVGElement).style.opacity).toBe('') // fallback shows instantly
    expect(onStepStart).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(500)
    expect(onStepStart).toHaveBeenCalledWith(1)
    vi.advanceTimersByTime(500)
    expect(onStepStart).toHaveBeenCalledWith(2)
    expect(onComplete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('showAll() reveals everything instantly', () => {
    const { steps, els } = makeSteps()
    const a = new Animator(steps, OPTS)
    a.showAll()
    for (const e of els) {
      expect((e as SVGElement).style.opacity).toBe('')
      expect((e as SVGElement).style.strokeDashoffset).toBe('')
    }
  })

  it('reset() hides everything and stops playback', () => {
    const { steps, els } = makeSteps()
    const onComplete = vi.fn()
    const a = new Animator(steps, { ...OPTS, onComplete })
    a.play()
    vi.advanceTimersByTime(500)
    a.reset()
    expect((els[0] as SVGElement).style.opacity).toBe('0')
    vi.advanceTimersByTime(5000)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('goToStep(n) shows steps 0..n completed, later steps hidden', () => {
    const { steps, els } = makeSteps()
    const a = new Animator(steps, OPTS)
    a.goToStep(1)
    expect((els[0] as SVGElement).style.opacity).toBe('')
    expect((els[1] as SVGElement).style.strokeDashoffset).toBe('')
    expect((els[2] as SVGElement).style.opacity).toBe('0')
  })

  it('pause() freezes progression; resume() continues', () => {
    const { steps } = makeSteps()
    const onStepStart = vi.fn()
    const a = new Animator(steps, { ...OPTS, onStepStart })
    a.play()
    vi.advanceTimersByTime(200)
    a.pause()
    vi.advanceTimersByTime(5000)
    expect(onStepStart).toHaveBeenCalledTimes(1)
    a.resume()
    vi.advanceTimersByTime(300) // remaining of the 500ms window
    expect(onStepStart).toHaveBeenCalledTimes(2)
  })

  it('destroy() stops all scheduling', () => {
    const { steps } = makeSteps()
    const onStepStart = vi.fn()
    const a = new Animator(steps, { ...OPTS, onStepStart })
    a.play()
    a.destroy()
    vi.advanceTimersByTime(5000)
    expect(onStepStart).toHaveBeenCalledTimes(1)
    a.play() // no-op after destroy
    expect(onStepStart).toHaveBeenCalledTimes(1)
  })
})
