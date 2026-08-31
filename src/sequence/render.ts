import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { resolveOptions } from '../theme'
import { arrowHead, crossMark, el, svgRoot, textEl } from '../svg'
import {
  ACTOR_BOX_H,
  HEADER_H,
  MSG_FONT,
  SELF_CURVE_DROP,
  SELF_CURVE_REACH,
  SELF_LABEL_X,
  SELF_TIP_GAP,
  layoutSequence,
  noteBounds,
} from './layout'
import type { DiagramController, ResolvedOptions, SequenceConfig } from '../types'

// Arrowhead polygon length (see arrowHead in svg.ts) — message lines stop this
// far short of the arrival point so the line flows into the head, not under it.
const HEAD_LEN = 10

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
      const nb = noteBounds(s, (id) => xOf.get(id))
      if (nb) {
        const g = el('g', {}, [
          el('rect', {
            x: nb.cx - nb.w / 2,
            y: y - 15,
            width: nb.w,
            height: 30,
            rx: 4,
            fill: t.noteBackground,
            stroke: t.noteBorder,
          }),
          textEl(nb.cx, y, s.text, { color: t.textSecondary, size: MSG_FONT }),
        ])
        root.appendChild(g)
        group.push({ el: g, kind: 'fade' })
      }
      // else: unknown/unresolved actor id(s) — draw nothing for this step
    } else if (s.from !== undefined && s.from === s.to) {
      const x = xOf.get(s.from)
      if (x !== undefined) {
        const color = s.highlight ? t.highlight : s.type === 'response' ? t.lineResponse : t.line
        const dashAttr: Record<string, string> = s.type === 'response' ? { 'stroke-dasharray': '6 4' } : {}
        const path = el('path', {
          d: `M ${x} ${y} C ${x + SELF_CURVE_REACH} ${y}, ${x + SELF_CURVE_REACH} ${y + SELF_CURVE_DROP}, ${x + SELF_TIP_GAP + HEAD_LEN} ${y + SELF_CURVE_DROP}`,
          fill: 'none',
          stroke: color,
          'stroke-width': 2,
          ...dashAttr,
        })
        root.appendChild(path)
        group.push({ el: path, kind: s.type === 'response' ? 'drawDash' : 'draw' })
        const head = arrowHead(x + SELF_TIP_GAP, y + SELF_CURVE_DROP, 180, color)
        root.appendChild(head)
        group.push({ el: head, kind: 'fade' })
        const txt = textEl(x + SELF_LABEL_X, y - 12, s.text, { color: t.text, size: MSG_FONT, anchor: 'start' })
        root.appendChild(txt)
        group.push({ el: txt, kind: 'fade' })
      }
      // else: unknown/unresolved actor id — draw nothing for this step
    } else {
      const x1 = xOf.get(s.from ?? '')
      const x2 = xOf.get(s.to ?? '')
      if (x1 !== undefined && x2 !== undefined) {
        const dir = x2 > x1 ? 1 : -1
        const color = s.highlight ? t.highlight : s.type === 'response' ? t.lineResponse : t.line
        const dashAttr: Record<string, string> = s.type === 'response' ? { 'stroke-dasharray': '6 4' } : {}
        const tipX = x2 - dir * 4
        // Trim the line back to the arrowhead's base so it flows into the arrow
        // instead of under it; the failed (X) tip has no head to trim against.
        const lineEndX = s.failed ? tipX : tipX - dir * HEAD_LEN
        const line = el('line', {
          x1,
          y1: y,
          x2: lineEndX,
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
        const txt = textEl((x1 + x2) / 2, y - 12, s.text, { color: t.text, size: MSG_FONT })
        root.appendChild(txt)
        group.push({ el: txt, kind: 'fade' })
      }
      // else: unknown/unresolved actor id(s) — draw nothing for this step
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
