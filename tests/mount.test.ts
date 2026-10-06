import { describe, it, expect, afterEach } from 'vitest'
import { render, sequence, flowchart, lightTheme, darkTheme } from '../src/index'
import type { SequenceConfig } from '../src/index'

const SEQ: SequenceConfig = {
  type: 'sequence',
  actors: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  steps: [
    { from: 'a', to: 'b', text: 'one' },
    { from: 'b', to: 'a', text: 'two', type: 'response' },
  ],
}

/** jsdom has no matchMedia; this mock serves both the color-scheme query
 *  (flippable, with change events) and the reduced-motion query (never). */
function installMatchMedia(initialDark: boolean) {
  const listeners: (() => void)[] = []
  let dark = initialDark
  ;(globalThis as { matchMedia?: unknown }).matchMedia = (q: string) => ({
    get matches() {
      return q.includes('prefers-color-scheme') ? dark : false
    },
    addEventListener: (_: string, fn: () => void) => {
      if (q.includes('prefers-color-scheme')) listeners.push(fn)
    },
    removeEventListener: (_: string, fn: () => void) => {
      const i = listeners.indexOf(fn)
      if (i >= 0) listeners.splice(i, 1)
    },
  })
  return {
    flip(d: boolean) {
      dark = d
      for (const fn of [...listeners]) fn()
    },
    listenerCount: () => listeners.length,
  }
}

afterEach(() => {
  delete (globalThis as { matchMedia?: unknown }).matchMedia
})

const bgFill = (container: HTMLElement): string | null =>
  container.querySelector('svg rect')?.getAttribute('fill') ?? null

/** True when the text node (and every ancestor group) is not opacity-hidden. */
const textVisible = (container: HTMLElement, content: string): boolean => {
  const node = [...container.querySelectorAll('text')].find((t) => t.textContent === content)
  if (!node) return false
  for (let e: Element | null = node; e && e.tagName !== 'svg'; e = e.parentElement) {
    if ((e as SVGElement).style?.opacity === '0') return false
  }
  return true
}

describe('misplaced theme options are honored instead of silently ignored', () => {
  it('top-level option keys on a config work (system dark)', () => {
    installMatchMedia(true)
    const c = document.createElement('div')
    const ctrl = render(c, { ...SEQ, theme: 'light', animate: false } as SequenceConfig)
    expect(bgFill(c)).toBe(lightTheme.background)
    ctrl.destroy()
  })

  it('direct renderers accept an options third argument (system dark)', () => {
    installMatchMedia(true)
    const c = document.createElement('div')
    const ctrl = sequence(c, SEQ, { theme: { background: '#FFF5F7' }, animate: false })
    expect(bgFill(c)).toBe('#FFF5F7')
    ctrl.destroy()
  })

  it('precedence: argument options > config.options > top-level keys', () => {
    const c1 = document.createElement('div')
    const ctrl1 = sequence(
      c1,
      { ...SEQ, theme: 'dark', options: { theme: 'light', animate: false } } as SequenceConfig,
    )
    expect(bgFill(c1)).toBe(lightTheme.background)
    const c2 = document.createElement('div')
    const ctrl2 = sequence(
      c2,
      { ...SEQ, options: { theme: 'light', animate: false } },
      { theme: 'dark' },
    )
    expect(bgFill(c2)).toBe(darkTheme.background)
    ctrl1.destroy()
    ctrl2.destroy()
  })
})

describe("live 'auto' theme", () => {
  it('follows prefers-color-scheme changes, replacing the svg in place', () => {
    const mm = installMatchMedia(false)
    const c = document.createElement('div')
    const ctrl = render(c, SEQ, { animate: false }) // theme unset = auto
    expect(bgFill(c)).toBe(lightTheme.background)
    mm.flip(true)
    expect(bgFill(c)).toBe(darkTheme.background)
    expect(c.querySelectorAll('svg')).toHaveLength(1) // replaced, not stacked
    mm.flip(false)
    expect(bgFill(c)).toBe(lightTheme.background)
    ctrl.destroy()
  })

  it('does NOT follow scheme changes when the theme is explicit', () => {
    const mm = installMatchMedia(false)
    const c = document.createElement('div')
    const ctrl = render(c, SEQ, { theme: 'light', animate: false })
    mm.flip(true)
    expect(bgFill(c)).toBe(lightTheme.background)
    ctrl.destroy()
  })

  it('preserves goToStep position across a scheme flip, including backward moves', () => {
    const mm = installMatchMedia(false)
    const c = document.createElement('div')
    const ctrl = render(c, SEQ, { trigger: 'manual' })
    ctrl.goToStep(0) // only the first message revealed
    mm.flip(true)
    expect(textVisible(c, 'one')).toBe(true)
    expect(textVisible(c, 'two')).toBe(false)
    ctrl.goToStep(1)
    ctrl.goToStep(0) // backward — the restore must not jump forward again
    mm.flip(false)
    expect(textVisible(c, 'two')).toBe(false)
    ctrl.destroy()
  })

  it('preserves position across consecutive flips', () => {
    const mm = installMatchMedia(false)
    const c = document.createElement('div')
    const ctrl = render(c, SEQ, { trigger: 'manual' })
    ctrl.goToStep(1)
    mm.flip(true)
    mm.flip(false)
    expect(textVisible(c, 'one')).toBe(true)
    expect(textVisible(c, 'two')).toBe(true)
    ctrl.destroy()
  })

  it('a reset survives a scheme flip (stays hidden, no completed leak)', () => {
    const mm = installMatchMedia(false)
    const c = document.createElement('div')
    const ctrl = render(c, SEQ, { trigger: 'manual' })
    ctrl.goToStep(1) // fully revealed
    ctrl.reset()
    mm.flip(true)
    expect(textVisible(c, 'one')).toBe(false)
    expect(textVisible(c, 'two')).toBe(false)
    ctrl.destroy()
  })

  it('does not replay an in-view onScroll diagram on flip (browser-faithful IO)', async () => {
    const mm = installMatchMedia(false)
    // Browsers deliver an initial entry for observed in-view elements.
    class FakeIO {
      private cb: (entries: { isIntersecting: boolean }[]) => void
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        this.cb = cb
      }
      observe() {
        this.cb([{ isIntersecting: true }])
      }
      disconnect() {}
    }
    ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO
    const started: number[] = []
    const c = document.createElement('div')
    const ctrl = render(c, SEQ, {
      stepDuration: 0,
      stepDelay: 0,
      onStepStart: (i) => started.push(i),
    })
    await new Promise((r) => setTimeout(r, 50)) // let the fallback timers play out
    expect(textVisible(c, 'two')).toBe(true)
    const callsBefore = started.length
    mm.flip(true)
    await new Promise((r) => setTimeout(r, 50))
    expect(started.length).toBe(callsBefore) // restoration never re-fires callbacks
    expect(textVisible(c, 'two')).toBe(true) // and never resets the diagram
    expect(c.querySelectorAll('svg')).toHaveLength(1)
    ctrl.destroy()
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
  })

  it('restores the exact click-mode revealed set, not a contiguous range', () => {
    const mm = installMatchMedia(false)
    const c = document.createElement('div')
    const started: number[] = []
    const ctrl = flowchart(
      c,
      {
        nodes: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
          { id: 'd', text: 'D' },
          { id: 'e', text: 'E' },
        ],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'a', to: 'c' },
          { from: 'b', to: 'd' },
          { from: 'c', to: 'e' },
        ],
      },
      { advance: 'click', trigger: 'immediate', onStepStart: (i) => started.push(i) },
    )
    const nodeByText = (label: string): SVGElement =>
      [...c.querySelectorAll('svg g')].find(
        (g) => g.getAttribute('role') === 'button' && g.querySelector('text')?.textContent === label,
      ) as SVGElement
    nodeByText('A').dispatchEvent(new Event('click')) // reveals B and C
    nodeByText('C').dispatchEvent(new Event('click')) // reveals E — B's branch (D) untouched
    expect(textVisible(c, 'E')).toBe(true)
    expect(textVisible(c, 'D')).toBe(false)
    const callsBefore = started.length
    mm.flip(true)
    expect(textVisible(c, 'E')).toBe(true)
    expect(textVisible(c, 'D')).toBe(false) // never-expanded branch stays hidden
    expect(started.length).toBe(callsBefore) // restore never re-fires onStepStart
    ctrl.destroy()
  })

  it('a never-played onScroll diagram still plays after a flip with replayOnScroll:false', () => {
    const mm = installMatchMedia(false)
    // Controllable IO mock: below the fold at first (initial non-intersecting
    // delivery, like browsers), entering only when we say so.
    const instances: { cb: (e: { isIntersecting: boolean }[]) => void }[] = []
    class FakeIO {
      cb: (e: { isIntersecting: boolean }[]) => void
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
        this.cb = cb
        instances.push(this)
      }
      observe() {
        this.cb([{ isIntersecting: false }])
      }
      disconnect() {}
    }
    ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO
    const c = document.createElement('div')
    const ctrl = render(c, SEQ, { replayOnScroll: false, stepDuration: 0, stepDelay: 0 })
    expect(textVisible(c, 'one')).toBe(false) // below the fold, nothing played
    mm.flip(true) // theme flips BEFORE the diagram ever entered the viewport
    instances[instances.length - 1].cb([{ isIntersecting: true }]) // user scrolls down
    // The first play must still happen — replayOnScroll:false only limits REplays.
    expect(c.querySelectorAll('svg')).toHaveLength(1)
    // play() ran: the animator is driving (fallback timers) or steps are shown
    // — either way the diagram is no longer permanently hidden.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(textVisible(c, 'one')).toBe(true)
        ctrl.destroy()
        delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
        resolve()
      }, 50)
    })
  })

  it('destroy unsubscribes from the media query', () => {
    const mm = installMatchMedia(false)
    const c = document.createElement('div')
    const ctrl = render(c, SEQ, { animate: false })
    expect(mm.listenerCount()).toBe(1)
    ctrl.destroy()
    expect(mm.listenerCount()).toBe(0)
    expect(() => mm.flip(true)).not.toThrow()
    expect(c.querySelector('svg')).toBeNull()
  })
})

describe('controller.setTheme', () => {
  it('re-renders with the new theme and pins it against scheme flips', () => {
    const mm = installMatchMedia(false)
    const c = document.createElement('div')
    const ctrl = render(c, SEQ, { animate: false })
    ctrl.setTheme('dark')
    expect(bgFill(c)).toBe(darkTheme.background)
    mm.flip(false) // auto would say light — pinned theme must win
    expect(bgFill(c)).toBe(darkTheme.background)
    ctrl.setTheme('auto')
    expect(bgFill(c)).toBe(lightTheme.background)
    mm.flip(true) // following again
    expect(bgFill(c)).toBe(darkTheme.background)
    ctrl.destroy()
  })

  it('accepts partial theme objects', () => {
    installMatchMedia(true)
    const c = document.createElement('div')
    const ctrl = render(c, SEQ, { animate: false })
    ctrl.setTheme({ background: '#FFF5F7' })
    expect(bgFill(c)).toBe('#FFF5F7')
    ctrl.destroy()
  })

  it('works without matchMedia at all (jsdom default)', () => {
    const c = document.createElement('div')
    const ctrl = render(c, SEQ, { animate: false })
    expect(() => ctrl.setTheme('dark')).not.toThrow()
    expect(bgFill(c)).toBe(darkTheme.background)
    ctrl.destroy()
  })
})
