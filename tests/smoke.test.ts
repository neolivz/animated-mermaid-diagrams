import { describe, it, expect } from 'vitest'

describe('environment', () => {
  it('has a DOM (jsdom)', () => {
    const div = document.createElement('div')
    expect(div.tagName).toBe('DIV')
  })

  it('can create namespaced SVG elements', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg')
  })
})
