import { describe, it, expect } from 'vitest'
import { el, textEl, estimateTextWidth, arrowHead, crossMark, svgRoot } from '../src/svg'
import { resolveOptions } from '../src/theme'

describe('el', () => {
  it('creates namespaced SVG elements with attributes and children', () => {
    const child = el('circle', { r: 5 })
    const g = el('g', { transform: 'translate(1,2)' }, [child])
    expect(g.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(g.getAttribute('transform')).toBe('translate(1,2)')
    expect(g.firstChild).toBe(child)
    expect(child.getAttribute('r')).toBe('5')
  })
})

describe('textEl', () => {
  it('sets content, position, and anchor', () => {
    const t = textEl(10, 20, 'hello', { color: '#000', anchor: 'start' })
    expect(t.textContent).toBe('hello')
    expect(t.getAttribute('x')).toBe('10')
    expect(t.getAttribute('text-anchor')).toBe('start')
    expect(t.getAttribute('fill')).toBe('#000')
  })
})

describe('estimateTextWidth', () => {
  it('is monotonic in text length and scales with font size', () => {
    expect(estimateTextWidth('hello world')).toBeGreaterThan(estimateTextWidth('hello'))
    expect(estimateTextWidth('abc', 28)).toBeCloseTo(estimateTextWidth('abc', 14) * 2, 5)
  })

  it('gives narrow chars less width than wide chars', () => {
    expect(estimateTextWidth('iiii')).toBeLessThan(estimateTextWidth('mmmm'))
  })
})

describe('arrowHead / crossMark', () => {
  it('arrowHead is a filled polygon positioned via transform', () => {
    const a = arrowHead(100, 50, 90, '#f00')
    expect(a.tagName).toBe('polygon')
    expect(a.getAttribute('fill')).toBe('#f00')
    expect(a.getAttribute('transform')).toBe('translate(100,50) rotate(90)')
  })

  it('crossMark is an X-shaped stroked path', () => {
    const c = crossMark(10, 10, '#f00')
    expect(c.tagName).toBe('path')
    expect(c.getAttribute('stroke')).toBe('#f00')
  })
})

describe('svgRoot', () => {
  it('sets viewBox, role, aria-label, background, responsive width', () => {
    const opts = resolveOptions({ theme: 'light' })
    const svg = svgRoot(300, 200, opts, 'My diagram')
    expect(svg.getAttribute('viewBox')).toBe('0 0 300 200')
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toBe('My diagram')
    expect(svg.style.width).toBe('100%')
    expect(svg.style.maxWidth).toBe('300px')
    const bg = svg.firstChild as SVGRectElement
    expect(bg.getAttribute('fill')).toBe('#ffffff')
  })

  it('uses explicit numeric width/height when given', () => {
    const opts = resolveOptions({ width: 640, height: 480 })
    const svg = svgRoot(300, 200, opts, 'x')
    expect(svg.getAttribute('width')).toBe('640')
    expect(svg.getAttribute('height')).toBe('480')
    expect(svg.style.maxWidth).toBe('')
  })

  it('honors numeric height with responsive width', () => {
    const opts = resolveOptions({ width: '100%', height: 480 })
    const svg = svgRoot(300, 200, opts, 'x')
    expect(svg.style.width).toBe('100%')
    expect(svg.getAttribute('height')).toBe('480')
    expect(svg.style.height).toBe('')
  })

  it('numeric width with auto height sets no height attribute', () => {
    const opts = resolveOptions({ width: 640 })
    const svg = svgRoot(300, 200, opts, 'x')
    expect(svg.getAttribute('width')).toBe('640')
    expect(svg.getAttribute('height')).toBeNull()
  })
})
