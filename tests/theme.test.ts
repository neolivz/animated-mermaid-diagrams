import { describe, it, expect } from 'vitest'
import { lightTheme, darkTheme, resolveTheme, resolveOptions } from '../src/theme'

describe('themes', () => {
  it('light theme matches spec tokens', () => {
    expect(lightTheme.background).toBe('#ffffff')
    expect(lightTheme.line).toBe('#6366f1')
    expect(lightTheme.highlight).toBe('#10b981')
    expect(lightTheme.lifeline).toBe('rgba(99,102,241,0.3)')
  })

  it('dark theme matches spec tokens', () => {
    expect(darkTheme.background).toBe('#0f172a')
    expect(darkTheme.text).toBe('#e2e8f0')
    expect(darkTheme.highlightRed).toBe('#f87171')
  })

  it('resolveTheme handles explicit names and custom tokens', () => {
    expect(resolveTheme('light')).toBe(lightTheme)
    expect(resolveTheme('dark')).toBe(darkTheme)
    const custom = { ...lightTheme, background: '#123456' }
    expect(resolveTheme(custom)).toBe(custom)
  })

  it("resolveTheme('auto') falls back to light when matchMedia is unavailable", () => {
    // jsdom has no matchMedia by default
    expect(resolveTheme('auto')).toBe(lightTheme)
    expect(resolveTheme(undefined)).toBe(lightTheme)
  })

  it("resolveTheme('auto') returns dark when prefers-color-scheme is dark", () => {
    const original = (globalThis as { matchMedia?: unknown }).matchMedia
    ;(globalThis as { matchMedia?: unknown }).matchMedia = (q: string) => ({
      matches: q.includes('dark'),
    })
    try {
      expect(resolveTheme('auto')).toBe(darkTheme)
    } finally {
      if (original === undefined) delete (globalThis as { matchMedia?: unknown }).matchMedia
      else (globalThis as { matchMedia?: unknown }).matchMedia = original
    }
  })
})

describe('resolveOptions', () => {
  it('applies spec defaults', () => {
    const o = resolveOptions()
    expect(o.animate).toBe(true)
    expect(o.trigger).toBe('onScroll')
    expect(o.stepDuration).toBe(400)
    expect(o.stepDelay).toBe(100)
    expect(o.replayOnScroll).toBe(true)
    expect(o.width).toBe('100%')
    expect(o.height).toBe('auto')
    expect(o.padding).toBe(40)
    expect(o.fontFamily).toBe('system-ui, sans-serif')
    expect(o.theme).toBe(lightTheme)
    expect(o.advance).toBe('auto')
    expect(o.keyboard).toBe(false)
  })

  it('respects overrides', () => {
    const onComplete = () => {}
    const o = resolveOptions({ stepDuration: 900, trigger: 'manual', theme: 'dark', onComplete })
    expect(o.stepDuration).toBe(900)
    expect(o.trigger).toBe('manual')
    expect(o.theme).toBe(darkTheme)
    expect(o.onComplete).toBe(onComplete)
  })
})
