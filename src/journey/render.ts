import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { highlightColor, resolveOptions } from '../theme'
import { el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type {
  DiagramController,
  JourneyConfig,
  JourneySection,
  JourneyTask,
  ResolvedOptions,
  ThemeTokens,
} from '../types'

export const TITLE_H = 34
export const BAND_H = 22
export const BAND_GAP = 10
export const PLOT_H = 160
export const LABEL_GAP = 18
export const ACTORS_GAP = 16
export const MIN_COL_W = 84
export const SECTION_GAP = 12
export const FACE_R = 14

const NAME_FONT = 12
const ACTORS_FONT = 10.5

interface TaskBox {
  task: JourneyTask
  x: number
  /** face center y, from the 1–7 score */
  y: number
  sectionIndex: number
}

interface SectionBox {
  section: JourneySection
  x1: number
  x2: number
}

export interface JourneyLayout {
  width: number
  height: number
  hasTitle: boolean
  bandY: number
  plotTop: number
  plotBottom: number
  labelY: number
  actorsY: number
  hasActors: boolean
  sections: SectionBox[]
  tasks: TaskBox[]
}

export function layoutJourney(config: JourneyConfig): JourneyLayout {
  const hasTitle = config.title !== undefined
  const bandY = hasTitle ? TITLE_H : 0
  const plotTop = bandY + BAND_H + BAND_GAP
  const plotBottom = plotTop + PLOT_H
  const labelY = plotBottom + LABEL_GAP
  const hasActors = config.sections.some((s) => (s.tasks ?? []).some((t) => t.actors?.length))
  const actorsY = labelY + ACTORS_GAP

  const sections: SectionBox[] = []
  const tasks: TaskBox[] = []
  let cursor = 0
  config.sections.forEach((section, si) => {
    if (si > 0) cursor += SECTION_GAP
    const x1 = cursor
    // Hand-written configs may carry empty (or shape-mismatched) sections the
    // parser would have dropped — treat missing/empty task lists as empty.
    for (const task of section.tasks ?? []) {
      const nameW = estimateTextWidth(task.name, NAME_FONT)
      const actorsW = task.actors ? estimateTextWidth(task.actors.join(', '), ACTORS_FONT) : 0
      const colW = Math.max(MIN_COL_W, Math.max(nameW, actorsW) + 24)
      // A non-finite score in a hand config would poison every y below with NaN.
      const score = Number.isFinite(task.score) ? Math.min(7, Math.max(1, task.score)) : 4
      // Inset the score range so a face circle (plus highlight ring) at score 7
      // clears the section band and at score 1 clears the axis line.
      const inset = FACE_R + 6
      tasks.push({
        task,
        x: cursor + colW / 2,
        y: plotTop + inset + ((7 - score) / 6) * (PLOT_H - inset * 2),
        sectionIndex: si,
      })
      cursor += colW
    }
    sections.push({ section, x1, x2: cursor })
  })

  return {
    width: cursor,
    height: (hasActors ? actorsY : labelY) + 10,
    hasTitle,
    bandY,
    plotTop,
    plotBottom,
    labelY,
    actorsY,
    hasActors,
    sections,
    tasks,
  }
}

/** Face circle + eyes + mouth for a score: ≥5 happy (highlight fill), ≤2 sad
 *  (highlightRed fill), else neutral (nodeBackground fill). */
function face(x: number, y: number, score: number, t: ThemeTokens): SVGGElement {
  const mood = score >= 5 ? 'happy' : score <= 2 ? 'sad' : 'neutral'
  const fill = mood === 'happy' ? t.highlight : mood === 'sad' ? t.highlightRed : t.nodeBackground
  // Colored fills get background-colored features (white-on-green style);
  // the neutral fill is a surface color, so features use the text color.
  const ink = mood === 'neutral' ? t.text : t.background
  const g = el('g', { transform: `translate(${x},${y})` })
  g.appendChild(el('circle', { cx: 0, cy: 0, r: FACE_R, fill, stroke: t.nodeBorder, 'stroke-width': 1.5 }))
  g.appendChild(el('circle', { cx: -4.5, cy: -3.5, r: 1.6, fill: ink }))
  g.appendChild(el('circle', { cx: 4.5, cy: -3.5, r: 1.6, fill: ink }))
  const mouth =
    mood === 'happy'
      ? 'M -5.5 3 Q 0 9 5.5 3'
      : mood === 'sad'
        ? 'M -5.5 7 Q 0 1.5 5.5 7'
        : 'M -5 5 L 5 5'
  g.appendChild(
    el('path', { d: mouth, fill: 'none', stroke: ink, 'stroke-width': 1.8, 'stroke-linecap': 'round' }),
  )
  return g
}

export function buildJourneySvg(
  config: JourneyConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const L = layoutJourney(config)
  const pad = opts.padding
  const w = L.width + pad * 2
  const h = L.height + pad * 2
  const taskCount = L.tasks.length
  const label = `User journey${config.title ? ` "${config.title}"` : ''} with ${taskCount} tasks across ${L.sections.length} sections`
  const svg = svgRoot(w, h, opts, label)
  const root = el('g', { transform: `translate(${pad},${pad})` })
  svg.appendChild(root)

  const animSteps: AnimStep[] = []

  // Intro: title (when present) + the score-axis baseline, so the intro step
  // always has content and the step-index offset stays 1 for every config.
  const intro: AnimStep = []
  if (config.title) {
    const titleText = textEl(L.width / 2, TITLE_H / 2, config.title, {
      color: t.text,
      size: 16,
      weight: '600',
    })
    root.appendChild(titleText)
    intro.push({ el: titleText, kind: 'fade' })
  }
  const axis = el('line', {
    x1: 0,
    y1: L.plotBottom,
    x2: L.width,
    y2: L.plotBottom,
    stroke: t.noteBorder,
    'stroke-width': 1,
  })
  root.appendChild(axis)
  intro.push({ el: axis, kind: 'draw' })
  animSteps.push(intro)

  const stepGroups: AnimStep[] = L.tasks.map(() => [])

  // Section band chrome reveals with its section's first task (frame-chrome
  // pattern from the sequence renderer).
  let taskIndex = 0
  for (const box of L.sections) {
    const firstTaskIndex = taskIndex
    const count = (box.section.tasks ?? []).length
    taskIndex += count
    // An empty section has no step to attach its band to (and a zero-width
    // band anyway) — skip it rather than indexing past stepGroups.
    if (count === 0) continue
    const g = el('g')
    g.appendChild(
      el('rect', {
        x: box.x1,
        y: L.bandY,
        width: box.x2 - box.x1,
        height: BAND_H,
        rx: 4,
        fill: t.noteBackground,
        stroke: t.noteBorder,
      }),
    )
    if (box.section.title) {
      g.appendChild(
        textEl((box.x1 + box.x2) / 2, L.bandY + BAND_H / 2, box.section.title, {
          color: t.textSecondary,
          size: 11,
          weight: '600',
        }),
      )
    }
    root.appendChild(g)
    stepGroups[firstTaskIndex].unshift({ el: g, kind: 'fade' })
  }

  L.tasks.forEach((box, i) => {
    const group = stepGroups[i]

    // Connector from the previous task, trimmed back to each face's border
    // (plus the highlight ring, when present) — a center-to-center line would
    // paint over the previous smiley, which was appended in an earlier step.
    if (i > 0) {
      const prev = L.tasks[i - 1]
      const dx = box.x - prev.x
      const dy = box.y - prev.y
      const dist = Math.hypot(dx, dy) || 1
      const ux = dx / dist
      const uy = dy / dist
      // Trim to the OUTER edge of the circle stroke (r + strokeWidth/2), or
      // of the highlight ring, so the line touches without a visible gap.
      const trimFrom = FACE_R + (prev.task.highlight ? 5.75 : 0.75)
      const trimTo = FACE_R + (box.task.highlight ? 5.75 : 0.75)
      if (dist > trimFrom + trimTo) {
        const line = el('line', {
          x1: prev.x + ux * trimFrom,
          y1: prev.y + uy * trimFrom,
          x2: box.x - ux * trimTo,
          y2: box.y - uy * trimTo,
          stroke: t.line,
          'stroke-width': 2,
        })
        root.appendChild(line)
        group.push({ el: line, kind: 'draw' })
      }
    }

    const faceGroup = el('g')
    const ring = highlightColor(box.task.highlight, t)
    if (ring) {
      faceGroup.appendChild(
        el('circle', { cx: box.x, cy: box.y, r: FACE_R + 4, fill: 'none', stroke: ring, 'stroke-width': 2 }),
      )
    }
    faceGroup.appendChild(face(box.x, box.y, box.task.score, t))
    root.appendChild(faceGroup)
    group.push({ el: faceGroup, kind: 'scale' })

    const name = textEl(box.x, L.labelY, box.task.name, { color: t.text, size: NAME_FONT })
    root.appendChild(name)
    group.push({ el: name, kind: 'fade' })

    if (box.task.actors?.length) {
      const actors = textEl(box.x, L.actorsY, box.task.actors.join(', '), {
        color: t.textSecondary,
        size: ACTORS_FONT,
      })
      root.appendChild(actors)
      group.push({ el: actors, kind: 'fade' })
    }
  })
  animSteps.push(...stepGroups)

  return { svg, steps: animSteps }
}

export function journey(container: HTMLElement, config: JourneyConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildJourneySvg(config, opts)
  return createDiagram(container, svg, steps, opts, 1)
}
