import type { ResolvedOptions } from './types'

const NS = 'http://www.w3.org/2000/svg'

export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag) as SVGElementTagNameMap[K]
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  for (const c of children) node.appendChild(c)
  return node
}

export interface TextOpts {
  color: string
  size?: number
  anchor?: 'start' | 'middle' | 'end'
  weight?: string
}

export function textEl(x: number, y: number, content: string, o: TextOpts): SVGTextElement {
  const attrs: Record<string, string | number> = {
    x,
    y,
    fill: o.color,
    'font-size': o.size ?? 14,
    'text-anchor': o.anchor ?? 'middle',
    'dominant-baseline': 'central',
  }
  if (o.weight) attrs['font-weight'] = o.weight
  const t = el('text', attrs)
  t.textContent = content
  return t
}

export function estimateTextWidth(text: string, fontSize = 14): number {
  let units = 0
  for (const ch of text) {
    if (/[iIljft1'".,:;|!()[\] ]/.test(ch)) units += 0.38
    else if (/[mwMW@%]/.test(ch)) units += 0.9
    else units += 0.62
  }
  return units * fontSize
}

/** Triangle with tip at (x,y), pointing along +x, rotated by `angle` degrees. */
export function arrowHead(x: number, y: number, angle: number, color: string): SVGPolygonElement {
  return el('polygon', {
    points: '0,0 -10,-4.5 -10,4.5',
    fill: color,
    transform: `translate(${x},${y}) rotate(${angle})`,
  })
}

/** X mark centered at (x,y) — used for Mermaid "failed" (-x) messages. */
export function crossMark(x: number, y: number, color: string): SVGPathElement {
  return el('path', {
    d: `M ${x - 5} ${y - 5} L ${x + 5} ${y + 5} M ${x - 5} ${y + 5} L ${x + 5} ${y - 5}`,
    stroke: color,
    'stroke-width': 2,
    fill: 'none',
  })
}

export function svgRoot(
  w: number,
  h: number,
  opts: ResolvedOptions,
  label: string,
): SVGSVGElement {
  const svg = el('svg', {
    xmlns: NS,
    viewBox: `0 0 ${w} ${h}`,
    role: 'img',
    'aria-label': label,
    'font-family': opts.fontFamily,
  })
  if (opts.width === '100%') {
    svg.style.width = '100%'
    svg.style.height = 'auto'
  } else {
    svg.setAttribute('width', String(opts.width))
    if (opts.height !== 'auto') svg.setAttribute('height', String(opts.height))
  }
  svg.appendChild(el('rect', { x: 0, y: 0, width: w, height: h, fill: opts.theme.background }))
  return svg
}
