import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDiagram } from '../src/controller'
import { resolveOptions } from '../src/theme'
import type { AnimStep } from '../src/animator'

function fixture(): { container: HTMLElement; svg: SVGSVGElement; els: SVGElement[]; steps: AnimStep[] } {
  const container = document.createElement('div')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement
  const els = [0, 1, 2].map(() => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement
    svg.appendChild(g)
    return g
  })
  const steps: AnimStep[] = els.map((el) => [{ el, kind: 'fade' as const }])
  return { container, svg, els, steps }
}

class FakeIO {
  static instances: FakeIO[] = []
  callback: IntersectionObserverCallback
  observed: Element[] = []
  disconnected = false
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb
    FakeIO.instances.push(this)
  }
  observe(el: Element): void { this.observed.push(el) }
  disconnect(): void { this.disconnected = true }
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
  enter(): void {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeIO.instances = []
  vi.stubGlobal('IntersectionObserver', FakeIO)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('createDiagram', () => {
  it('appends the svg to the container', () => {
    const { container, svg, steps } = fixture()
    createDiagram(container, svg, steps, resolveOptions({ trigger: 'manual' }))
    expect(container.firstChild).toBe(svg)
  })

  it('animate:false renders final state immediately', () => {
    const { container, svg, els, steps } = fixture()
    createDiagram(container, svg, steps, resolveOptions({ animate: false }))
    expect(els[2].style.opacity).toBe('')
  })

  it('trigger:immediate plays right away', () => {
    const { container, svg, els, steps } = fixture()
    createDiagram(container, svg, steps, resolveOptions({ trigger: 'immediate' }))
    expect(els[0].style.opacity).toBe('')
    expect(els[2].style.opacity).toBe('0')
    vi.advanceTimersByTime(2000)
    expect(els[2].style.opacity).toBe('')
  })

  it('trigger:manual stays hidden until play()', () => {
    const { container, svg, els, steps } = fixture()
    const ctrl = createDiagram(container, svg, steps, resolveOptions({ trigger: 'manual' }))
    expect(els[0].style.opacity).toBe('0')
    ctrl.play()
    expect(els[0].style.opacity).toBe('')
  })

  it('trigger:onScroll plays when the observer fires', () => {
    const { container, svg, els, steps } = fixture()
    createDiagram(container, svg, steps, resolveOptions())
    expect(FakeIO.instances).toHaveLength(1)
    expect(els[0].style.opacity).toBe('0')
    FakeIO.instances[0].enter()
    expect(els[0].style.opacity).toBe('')
  })

  it('replayOnScroll:false only plays once', () => {
    const { container, svg, steps } = fixture()
    const onStepStart = vi.fn()
    createDiagram(container, svg, steps, resolveOptions({ replayOnScroll: false, onStepStart }))
    FakeIO.instances[0].enter()
    vi.advanceTimersByTime(2000)
    const calls = onStepStart.mock.calls.length
    FakeIO.instances[0].enter()
    vi.advanceTimersByTime(2000)
    expect(onStepStart.mock.calls.length).toBe(calls)
  })

  it('stepIndexOffset shifts onStepStart and goToStep numbering', () => {
    const { container, svg, els, steps } = fixture()
    const onStepStart = vi.fn()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'manual', onStepStart }),
      1,
    )
    ctrl.play()
    vi.advanceTimersByTime(2000)
    // anim steps 0,1,2 → user sees 0 (for anim 1) and 1 (for anim 2); intro suppressed
    expect(onStepStart.mock.calls.map((c) => c[0])).toEqual([0, 1])
    ctrl.reset()
    ctrl.goToStep(0) // shows intro + first content step
    expect(els[0].style.opacity).toBe('')
    expect(els[1].style.opacity).toBe('')
    expect(els[2].style.opacity).toBe('0')
  })

  it('destroy() removes svg and disconnects observer', () => {
    const { container, svg, steps } = fixture()
    const ctrl = createDiagram(container, svg, steps, resolveOptions())
    ctrl.destroy()
    expect(container.firstChild).toBeNull()
    expect(FakeIO.instances[0].disconnected).toBe(true)
  })

  it('falls back to immediate play when IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container, svg, els, steps } = fixture()
    createDiagram(container, svg, steps, resolveOptions())
    expect(els[0].style.opacity).toBe('')
  })

  it('respects prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }))
    const { container, svg, els, steps } = fixture()
    createDiagram(container, svg, steps, resolveOptions({ trigger: 'immediate' }))
    expect(els[2].style.opacity).toBe('') // no animation, final state
  })

  it('controller methods are safe no-ops after destroy()', () => {
    const { container, svg, els, steps } = fixture()
    const ctrl = createDiagram(container, svg, steps, resolveOptions({ trigger: 'manual' }))
    ctrl.destroy()
    ctrl.play()
    ctrl.goToStep(2)
    expect(container.firstChild).toBeNull()
    expect(els[0].style.opacity).toBe('0')
  })

  it('trigger:manual with animate:false shows the final state immediately', () => {
    const { container, svg, els, steps } = fixture()
    createDiagram(container, svg, steps, resolveOptions({ trigger: 'manual', animate: false }))
    expect(els[2].style.opacity).toBe('')
  })

  it('advance:click reveals one step per click and fires onComplete once', () => {
    const { container, svg, els, steps } = fixture()
    const onComplete = vi.fn()
    createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'immediate', advance: 'click', onComplete }),
      1,
    )
    // intro (offset step 0) revealed immediately; later steps wait for clicks.
    expect(els[0].style.opacity).toBe('')
    expect(els[1].style.opacity).toBe('0')
    expect(els[2].style.opacity).toBe('0')

    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(els[1].style.opacity).toBe('')
    expect(els[2].style.opacity).toBe('0')
    expect(onComplete).not.toHaveBeenCalled()

    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(els[2].style.opacity).toBe('')
    expect(onComplete).toHaveBeenCalledTimes(1)

    // Nothing left to reveal: further clicks are no-ops.
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('advance:click destroy() removes the click listener', () => {
    const { container, svg, els, steps } = fixture()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'immediate', advance: 'click' }),
      1,
    )
    ctrl.destroy()
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(els[1].style.opacity).toBe('0') // unchanged — listener was removed
  })

  it('advance:click keydown Enter on the svg advances a step, keeps a tab stop, and stops after destroy', () => {
    const { container, svg, els, steps } = fixture()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'immediate', advance: 'click' }),
      1,
    )
    expect(svg.getAttribute('tabindex')).toBe('0')
    expect(svg.getAttribute('aria-label') ?? '').toContain('Press Enter to reveal the next step.')

    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(els[1].style.opacity).toBe('')

    ctrl.destroy()
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(els[2].style.opacity).toBe('0') // unchanged — listener was removed
  })

  it('wires pause/resume through to the animator', () => {
    const { container, svg, steps } = fixture()
    const onStepStart = vi.fn()
    const ctrl = createDiagram(container, svg, steps, resolveOptions({ trigger: 'immediate', onStepStart }))
    vi.advanceTimersByTime(200)
    ctrl.pause()
    vi.advanceTimersByTime(5000)
    expect(onStepStart).toHaveBeenCalledTimes(1)
    ctrl.resume()
    vi.advanceTimersByTime(300)
    expect(onStepStart).toHaveBeenCalledTimes(2)
  })

  it('resume() continues playback after goToStep()', () => {
    const { container, svg, steps } = fixture()
    const onStepStart = vi.fn()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'manual', onStepStart }),
      1,
    )
    // goToStep(0) -> anim.goToStep(0 + offset 1) shows anim steps 0..1, leaving
    // anim step 2 (user-facing index 2 - offset 1 = 1) as the next one to run.
    ctrl.goToStep(0)
    ctrl.resume()
    vi.advanceTimersByTime(1)
    expect(onStepStart).toHaveBeenCalledWith(1)
  })

  it('resume() is a no-op in click mode (never auto-plays after goToStep)', () => {
    const { container, svg, els, steps } = fixture()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'immediate', advance: 'click' }),
      1,
    )
    // goToStep(0) -> anim.goToStep(1) shows anim steps 0..1 (els[0], els[1]);
    // els[2] (anim step 2) is left hidden.
    ctrl.goToStep(0)
    ctrl.resume()
    vi.advanceTimersByTime(2000)
    expect(els[2].style.opacity).toBe('0') // still unrevealed — resume did nothing
  })

  it('keyboard:true ArrowRight/ArrowLeft/Home/End step through raw anim-steps (manual trigger, before play())', () => {
    const { container, svg, els, steps } = fixture()
    const onComplete = vi.fn()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'manual', keyboard: true, onComplete }),
      1,
    )
    expect(svg.getAttribute('tabindex')).toBe('0')
    expect(svg.getAttribute('aria-label') ?? '').toContain('use arrow keys to step')
    expect(els[0].style.opacity).toBe('0') // manual: nothing shown yet

    const key = (k: string): void => { svg.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }

    key('ArrowRight')
    expect(els[0].style.opacity).toBe('') // anim step 0 (intro) revealed
    expect(els[1].style.opacity).toBe('0')

    key('ArrowRight')
    expect(els[1].style.opacity).toBe('') // anim step 1 (user-facing step 0) revealed
    expect(els[2].style.opacity).toBe('0')

    key('ArrowLeft')
    expect(els[1].style.opacity).toBe('0') // stepped back — hidden again
    expect(els[0].style.opacity).toBe('') // still shown

    key('Home')
    expect(els[0].style.opacity).toBe('0') // reset: everything hidden

    key('End')
    expect(els[0].style.opacity).toBe('')
    expect(els[1].style.opacity).toBe('')
    expect(els[2].style.opacity).toBe('')
    // Matches goToStep's existing behavior: it never fires onComplete on its own
    // (only the play()/runStep timer path does), so End doesn't either.
    expect(onComplete).not.toHaveBeenCalled()

    ctrl.destroy()
  })

  it('keyboard:true ArrowRight animates the step forward (not an instant snap) and fires the offset-adjusted onStepStart; a following Space resumes timed playback', () => {
    const { container, svg, els, steps } = fixture()
    const onStepStart = vi.fn()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'manual', keyboard: true, onStepStart }),
      1,
    )
    const key = (k: string): void => { svg.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }

    key('ArrowRight') // anim step 0 (intro) — suppressed from the user-facing callback
    expect(els[0].style.opacity).toBe('')
    expect(els[1].style.opacity).toBe('0')
    expect(onStepStart).not.toHaveBeenCalled()

    key('ArrowRight') // anim step 1 → user-facing step 0
    expect(els[1].style.opacity).toBe('') // exactly one further step revealed
    expect(els[2].style.opacity).toBe('0')
    expect(onStepStart).toHaveBeenCalledTimes(1)
    expect(onStepStart).toHaveBeenCalledWith(0)

    key(' ') // paused-on-step (from stepForward) -> resume() continues timed playback
    vi.advanceTimersByTime(500)
    expect(els[2].style.opacity).toBe('') // anim step 2 → user-facing step 1
    expect(onStepStart).toHaveBeenCalledTimes(2)
    expect(onStepStart).toHaveBeenCalledWith(1)

    ctrl.destroy()
  })

  it('keyboard:true ArrowRight calls element.animate() (click-mode parity); ArrowLeft/Home/End do not', () => {
    const { container, svg, els, steps } = fixture()
    const animateMock = vi.fn(() => ({
      cancel: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      playState: 'running',
    })) as unknown as SVGElement['animate']
    for (const el of els) (el as unknown as { animate: typeof animateMock }).animate = animateMock

    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'manual', keyboard: true }),
      1,
    )
    const key = (k: string): void => { svg.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }

    key('ArrowRight')
    expect(animateMock).toHaveBeenCalledTimes(1)
    key('ArrowRight')
    expect(animateMock).toHaveBeenCalledTimes(2)

    key('ArrowLeft')
    key('Home')
    key('End')
    expect(animateMock).toHaveBeenCalledTimes(2) // unchanged — none of these animate

    ctrl.destroy()
  })

  it('keyboard:true Space toggles idle→play, playing→pause, paused→resume; onStepStart follows stepIndexOffset', () => {
    const { container, svg, els, steps } = fixture()
    const onStepStart = vi.fn()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'manual', keyboard: true, onStepStart }),
      1,
    )
    const key = (k: string): void => { svg.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }

    key(' ') // idle -> play()
    expect(els[0].style.opacity).toBe('') // intro (anim step 0) played immediately
    expect(onStepStart).not.toHaveBeenCalled() // intro suppressed from the user-facing callback

    key(' ') // playing -> pause()
    vi.advanceTimersByTime(5000)
    expect(onStepStart).not.toHaveBeenCalled() // paused: the pending step never ran

    key(' ') // paused -> resume()
    vi.advanceTimersByTime(1000)
    expect(onStepStart).toHaveBeenCalledWith(0) // anim step 1 (user-facing 0) ran
    expect(els[1].style.opacity).toBe('')

    ctrl.destroy()
  })

  it('keyboard:false diagrams have no tabindex and ignore keys', () => {
    const { container, svg, els, steps } = fixture()
    createDiagram(container, svg, steps, resolveOptions({ trigger: 'manual' }))
    expect(svg.getAttribute('tabindex')).toBeNull()
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(els[0].style.opacity).toBe('0') // ignored — keyboard transport not wired
  })

  it('keyboard:true destroy() removes the keydown listener', () => {
    const { container, svg, els, steps } = fixture()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'manual', keyboard: true }),
    )
    ctrl.destroy()
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(els[0].style.opacity).toBe('0') // unchanged — listener was removed
  })

  it('advance:click ArrowRight advances like a click and ArrowLeft steps back (svg-level)', () => {
    const { container, svg, els, steps } = fixture()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'immediate', advance: 'click' }),
      1,
    )
    const key = (k: string): void => { svg.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }
    // intro (offset step 0) revealed immediately.
    expect(els[0].style.opacity).toBe('')
    expect(els[1].style.opacity).toBe('0')

    key('ArrowRight')
    expect(els[1].style.opacity).toBe('')

    key('ArrowLeft')
    expect(els[1].style.opacity).toBe('0') // stepped back

    ctrl.destroy()
  })

  it('advance:click Home resets and restarts click mode', () => {
    const { container, svg, els, steps } = fixture()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'immediate', advance: 'click' }),
      1,
    )
    const key = (k: string): void => { svg.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }
    key('ArrowRight')
    expect(els[1].style.opacity).toBe('')

    key('Home')
    expect(els[0].style.opacity).toBe('') // intro re-revealed
    expect(els[1].style.opacity).toBe('0') // back to just the intro

    ctrl.destroy()
  })

  it('keyboard:true svg exposes slider semantics (role, valuemin/max, valuenow/valuetext) that track ArrowRight/Home/End', () => {
    const { container, svg, steps } = fixture()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'manual', keyboard: true }),
      1,
    )
    expect(svg.getAttribute('role')).toBe('slider')
    expect(svg.getAttribute('aria-valuemin')).toBe('0')
    expect(svg.getAttribute('aria-valuemax')).toBe('2') // userStepCount = 3 anim steps - offset 1
    expect(svg.getAttribute('aria-valuenow')).toBe('0')
    expect(svg.getAttribute('aria-valuetext')).toBe('step 0 of 2')

    const key = (k: string): void => { svg.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }

    key('ArrowRight') // reveals anim step 0 (intro) — 0 user-facing steps so far
    expect(svg.getAttribute('aria-valuenow')).toBe('0')
    expect(svg.getAttribute('aria-valuetext')).toBe('step 0 of 2')

    key('ArrowRight') // reveals anim step 1 (user-facing step 0)
    expect(svg.getAttribute('aria-valuenow')).toBe('1')
    expect(svg.getAttribute('aria-valuetext')).toBe('step 1 of 2')

    key('Home')
    expect(svg.getAttribute('aria-valuenow')).toBe('0')
    expect(svg.getAttribute('aria-valuetext')).toBe('step 0 of 2')

    key('End')
    expect(svg.getAttribute('aria-valuenow')).toBe('2')
    expect(svg.getAttribute('aria-valuetext')).toBe('step 2 of 2')

    ctrl.destroy()
  })

  it('keyboard:true svg slider valuenow updates during play() (onStepStart-driven, fake timers)', () => {
    const { container, svg, steps } = fixture()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'immediate', keyboard: true }),
      1,
    )
    // play() runs the intro (anim step 0) synchronously; it doesn't count as a user step.
    expect(svg.getAttribute('aria-valuenow')).toBe('0')

    vi.advanceTimersByTime(500) // default stepDuration(400) + stepDelay(100)
    expect(svg.getAttribute('aria-valuenow')).toBe('1')

    vi.advanceTimersByTime(500)
    expect(svg.getAttribute('aria-valuenow')).toBe('2')

    ctrl.destroy()
  })

  it('advance:click + onScroll re-entry preserves progress once the user has interacted', () => {
    const { container, svg, els, steps } = fixture()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ advance: 'click' }), // trigger:onScroll, replayOnScroll:true (defaults)
      1,
    )
    FakeIO.instances[0].enter() // arms: intro revealed
    expect(els[0].style.opacity).toBe('')
    expect(els[1].style.opacity).toBe('0')
    expect(svg.getAttribute('aria-valuenow')).toBe('0')

    svg.dispatchEvent(new MouseEvent('click', { bubbles: true })) // user reveals one step
    expect(els[1].style.opacity).toBe('')
    expect(svg.getAttribute('aria-valuenow')).toBe('1')

    FakeIO.instances[0].enter() // scroll away and back
    expect(els[1].style.opacity).toBe('') // progress preserved — not wiped back to intro
    expect(els[2].style.opacity).toBe('0')
    expect(svg.getAttribute('aria-valuenow')).toBe('1') // unchanged

    ctrl.destroy()
  })

  it('advance:click + onScroll re-entry re-arms an untouched diagram', () => {
    const { container, svg, els, steps } = fixture()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ advance: 'click' }),
      1,
    )
    FakeIO.instances[0].enter()
    expect(els[0].style.opacity).toBe('')
    expect(els[1].style.opacity).toBe('0')

    // No interaction happened — re-entry re-arms without error, landing back
    // on the intro state (nothing to preserve).
    FakeIO.instances[0].enter()
    expect(els[0].style.opacity).toBe('')
    expect(els[1].style.opacity).toBe('0')
    expect(svg.getAttribute('aria-valuenow')).toBe('0')

    ctrl.destroy()
  })

  it('advance:click ctrl.play() clears the interacted flag so a later re-entry re-arms again', () => {
    const { container, svg, els, steps } = fixture()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ advance: 'click' }),
      1,
    )
    FakeIO.instances[0].enter()
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true })) // interact
    expect(els[1].style.opacity).toBe('')

    ctrl.play() // explicit restart clears the flag and wipes progress
    expect(els[1].style.opacity).toBe('0')

    FakeIO.instances[0].enter() // re-entry re-arms again (flag was cleared)
    expect(els[0].style.opacity).toBe('')
    expect(els[1].style.opacity).toBe('0')

    svg.dispatchEvent(new MouseEvent('click', { bubbles: true })) // interact again
    expect(els[1].style.opacity).toBe('')
    FakeIO.instances[0].enter() // now preserved again
    expect(els[1].style.opacity).toBe('')

    ctrl.destroy()
  })

  it("advance:click (svg-level) exposes slider semantics that increment per click/ArrowRight", () => {
    const { container, svg, steps } = fixture()
    const ctrl = createDiagram(
      container, svg, steps,
      resolveOptions({ trigger: 'immediate', advance: 'click' }),
      1,
    )
    expect(svg.getAttribute('role')).toBe('slider')
    expect(svg.getAttribute('aria-valuemin')).toBe('0')
    expect(svg.getAttribute('aria-valuemax')).toBe('2')
    expect(svg.getAttribute('aria-valuenow')).toBe('0') // only the intro revealed so far
    expect(svg.getAttribute('aria-valuetext')).toBe('step 0 of 2')

    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(svg.getAttribute('aria-valuenow')).toBe('1')

    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(svg.getAttribute('aria-valuenow')).toBe('2')

    ctrl.destroy()
  })
})
