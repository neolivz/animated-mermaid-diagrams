import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { resolveOptions } from '../theme'
import { arrowHead, crossMark, el, estimateTextWidth, svgRoot, textEl } from '../svg'
import { ACTOR_BOX_H, HEADER_H, layoutSequence } from './layout'
import type { DiagramController, ResolvedOptions, SequenceConfig } from '../types'

export function buildSequenceSvg(
  config: SequenceConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const L = layoutSequence(config.actors, config.steps)
  const pad = opts.padding
  const w = L.width + pad * 2
  const h = L.height + pad * 2
  const label = `Sequence diagram with ${config.actors.length} participants (${config.actors
    .map((a) => a.label)
    .join(', ')}) and ${config.steps.length} steps`
  const svg = svgRoot(w, h, opts, label)
  const root = el('g', { transform: `translate(${pad},${pad})` })
  svg.appendChild(root)

  const xOf = new Map(L.actors.map((a) => [a.actor.id, a.x]))
  const animSteps: AnimStep[] = []

  // Intro step: actor headers + lifelines
  const intro: AnimStep = []
  for (const a of L.actors) {
    const g = el('g')
    if (a.actor.type === 'actor') {
      g.appendChild(
        el('circle', { cx: a.x, cy: 10, r: 7, fill: 'none', stroke: t.nodeBorder, 'stroke-width': 2 }),
      )
      g.appendChild(
        el('path', {
          d: `M ${a.x - 11} ${ACTOR_BOX_H - 6} Q ${a.x} 14 ${a.x + 11} ${ACTOR_BOX_H - 6}`,
          fill: 'none',
          stroke: t.nodeBorder,
          'stroke-width': 2,
        }),
      )
      g.appendChild(textEl(a.x, HEADER_H - 6, a.actor.label, { color: t.text, weight: '600' }))
    } else {
      g.appendChild(
        el('rect', {
          x: a.x - a.w / 2,
          y: 0,
          width: a.w,
          height: ACTOR_BOX_H,
          rx: 6,
          fill: t.nodeBackground,
          stroke: t.nodeBorder,
          'stroke-width': 1.5,
        }),
      )
      g.appendChild(textEl(a.x, ACTOR_BOX_H / 2, a.actor.label, { color: t.text, weight: '600' }))
    }
    root.appendChild(g)
    intro.push({ el: g, kind: 'fade' })

    const life = el('line', {
      x1: a.x,
      y1: HEADER_H,
      x2: a.x,
      y2: L.height,
      stroke: t.lifeline,
      'stroke-width': 1.5,
      'stroke-dasharray': '4 4',
    })
    root.appendChild(life)
    intro.push({ el: life, kind: 'drawDash' })
  }
  animSteps.push(intro)

  config.steps.forEach((s, i) => {
    const y = L.stepYs[i]
    const group: AnimStep = []

    if (s.type === 'note') {
      const ids = Array.isArray(s.over) ? s.over : [s.over ?? s.from ?? '']
      const xs = ids.map((id) => xOf.get(id) ?? 0)
      const x1 = Math.min(...xs) - 30
      const x2 = Math.max(...xs) + 30
      const noteW = Math.max(x2 - x1, estimateTextWidth(s.text, 13) + 20)
      const cx = (x1 + x2) / 2
      const g = el('g', {}, [
        el('rect', {
          x: cx - noteW / 2,
          y: y - 15,
          width: noteW,
          height: 30,
          rx: 4,
          fill: t.noteBackground,
          stroke: t.noteBorder,
        }),
        textEl(cx, y, s.text, { color: t.textSecondary, size: 13 }),
      ])
      root.appendChild(g)
      group.push({ el: g, kind: 'fade' })
    } else if (s.from !== undefined && s.from === s.to) {
      const x = xOf.get(s.from) ?? 0
      const color = s.highlight ? t.highlight : s.type === 'response' ? t.lineResponse : t.line
      const dashAttr: Record<string, string> = s.type === 'response' ? { 'stroke-dasharray': '6 4' } : {}
      const path = el('path', {
        d: `M ${x} ${y} C ${x + 55} ${y}, ${x + 55} ${y + 28}, ${x + 6} ${y + 28}`,
        fill: 'none',
        stroke: color,
        'stroke-width': 2,
        ...dashAttr,
      })
      root.appendChild(path)
      group.push({ el: path, kind: s.type === 'response' ? 'drawDash' : 'draw' })
      const head = arrowHead(x + 6, y + 28, 180, color)
      root.appendChild(head)
      group.push({ el: head, kind: 'fade' })
      const txt = textEl(x + 48, y - 12, s.text, { color: t.text, size: 13, anchor: 'start' })
      root.appendChild(txt)
      group.push({ el: txt, kind: 'fade' })
    } else {
      const x1 = xOf.get(s.from ?? '') ?? 0
      const x2 = xOf.get(s.to ?? '') ?? 0
      const dir = x2 > x1 ? 1 : -1
      const color = s.highlight ? t.highlight : s.type === 'response' ? t.lineResponse : t.line
      const dashAttr: Record<string, string> = s.type === 'response' ? { 'stroke-dasharray': '6 4' } : {}
      const tipX = x2 - dir * 4
      const line = el('line', {
        x1,
        y1: y,
        x2: tipX,
        y2: y,
        stroke: color,
        'stroke-width': 2,
        ...dashAttr,
      })
      root.appendChild(line)
      group.push({ el: line, kind: s.type === 'response' ? 'drawDash' : 'draw' })
      const tip = s.failed
        ? crossMark(x2 - dir * 8, y, color)
        : arrowHead(tipX, y, dir === 1 ? 0 : 180, color)
      root.appendChild(tip)
      group.push({ el: tip, kind: 'fade' })
      const txt = textEl((x1 + x2) / 2, y - 12, s.text, { color: t.text, size: 13 })
      root.appendChild(txt)
      group.push({ el: txt, kind: 'fade' })
    }
    animSteps.push(group)
  })

  return { svg, steps: animSteps }
}

export function sequence(container: HTMLElement, config: SequenceConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildSequenceSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 1)
}
