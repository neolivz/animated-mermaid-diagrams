import type { AnimStep } from '../animator'
import { createDiagram } from '../controller'
import { paletteColor } from '../palette'
import { highlightColor, resolveOptions } from '../theme'
import { el, estimateTextWidth, svgRoot, textEl } from '../svg'
import type { DiagramController, GitGraphConfig, GitOperation, ResolvedOptions } from '../types'

const LANE_H = 44
const COL_W = 48
const DOT_R = 7

export interface GitCommit {
  op: GitOperation
  /** sequential column, left to right */
  col: number
  /** lane row index */
  lane: number
  /** previous commit on the same lane (horizontal edge) or the fork-point
   *  commit on the parent lane (curved edge) */
  parent?: GitCommit
  /** for merge commits: the merged branch's latest commit */
  mergeFrom?: GitCommit
  /** display label under the dot */
  label: string
}

export interface GitReplay {
  /** branch names in lane order (lane 0 first) */
  lanes: string[]
  commits: GitCommit[]
}

/** Replays the operation list into placed commits — the single source of
 *  truth for both Mermaid input and hand-written configs. Lenient: checkout
 *  of an unknown branch is ignored, merge of an unknown/empty branch too. */
export function replayGitGraph(operations: GitOperation[]): GitReplay {
  const lanes: string[] = ['main']
  const laneOf = new Map<string, number>([['main', 0]])
  const headOf = new Map<string, GitCommit | undefined>()
  /** commit the branch forked from, used by its first commit */
  const forkPoint = new Map<string, GitCommit | undefined>()
  const commits: GitCommit[] = []
  let current = 'main'
  let nextCol = 0
  let autoId = 0

  const addCommit = (op: GitOperation, mergeFrom?: GitCommit): GitCommit => {
    const lane = laneOf.get(current)!
    const prevOnBranch = headOf.get(current)
    const commit: GitCommit = {
      op,
      col: nextCol++,
      lane,
      parent: prevOnBranch ?? forkPoint.get(current),
      ...(mergeFrom ? { mergeFrom } : {}),
      // Merge commits show no auto number (Mermaid labels them only when an
      // explicit id is given); plain commits auto-number.
      label: op.id ?? (mergeFrom ? '' : String(autoId++)),
    }
    commits.push(commit)
    headOf.set(current, commit)
    return commit
  }

  for (const op of operations) {
    if (op.op === 'commit') {
      addCommit(op)
    } else if (op.op === 'branch' && op.name) {
      if (!laneOf.has(op.name)) {
        laneOf.set(op.name, lanes.length)
        lanes.push(op.name)
        forkPoint.set(op.name, headOf.get(current))
        // Mermaid semantics: creating a branch also checks it out. A
        // duplicate `branch` (which Mermaid rejects) stays lenient
        // first-wins and does NOT switch.
        current = op.name
      }
    } else if (op.op === 'checkout' && op.name) {
      if (laneOf.has(op.name)) current = op.name
    } else if (op.op === 'merge' && op.name) {
      const from = laneOf.has(op.name) ? headOf.get(op.name) : undefined
      if (from && op.name !== current) addCommit(op, from)
    }
  }

  return { lanes, commits }
}

export function buildGitGraphSvg(
  config: GitGraphConfig,
  opts: ResolvedOptions,
): { svg: SVGSVGElement; steps: AnimStep[] } {
  const t = opts.theme
  const R = replayGitGraph(config.operations)

  const labelW = Math.max(48, ...R.lanes.map((n) => estimateTextWidth(n, 12) + 16))
  const x0 = labelW + 16
  const laneY = (lane: number): number => 20 + lane * LANE_H
  const colX = (col: number): number => x0 + col * COL_W

  const width = colX(Math.max(1, R.commits.length)) + 8
  const height = laneY(Math.max(0, R.lanes.length - 1)) + 34

  const pad = opts.padding
  const label = `Git graph with ${R.commits.length} commits on ${R.lanes.length} branches (${R.lanes.join(', ')})`
  const svg = svgRoot(width + pad * 2, height + pad * 2, opts, label)
  const root = el('g', { transform: `translate(${pad},${pad})` })
  svg.appendChild(root)

  // Intro: branch lane labels + Mermaid-style dotted lane guide lines.
  const intro: AnimStep = []
  R.lanes.forEach((name, lane) => {
    const g = el('g', {}, [
      el('line', {
        x1: x0 - 8,
        y1: laneY(lane),
        x2: width - 8,
        y2: laneY(lane),
        stroke: t.lifeline,
        'stroke-width': 1.5,
        'stroke-dasharray': '3 5',
      }),
      textEl(labelW, laneY(lane), name, {
        color: paletteColor(lane),
        size: 12,
        weight: '600',
        anchor: 'end',
      }),
    ])
    root.appendChild(g)
    intro.push({ el: g, kind: 'fade' })
  })
  if (intro.length === 0) {
    const empty = textEl(0, 10, 'empty git graph', { color: t.textSecondary, size: 12, anchor: 'start' })
    root.appendChild(empty)
    intro.push({ el: empty, kind: 'fade' })
  }
  const animSteps: AnimStep[] = [intro]

  const edgeLayer = el('g')
  root.appendChild(edgeLayer)

  const curve = (fx: number, fy: number, tx: number, ty: number, color: string): SVGPathElement => {
    const mx = (fx + tx) / 2
    return el('path', {
      d: fy === ty ? `M ${fx} ${fy} L ${tx} ${ty}` : `M ${fx} ${fy} C ${mx} ${fy}, ${mx} ${ty}, ${tx} ${ty}`,
      fill: 'none',
      stroke: color,
      'stroke-width': 2,
    })
  }

  for (const commit of R.commits) {
    const step: AnimStep = []
    const cx = colX(commit.col)
    const cy = laneY(commit.lane)
    const color = paletteColor(commit.lane)

    if (commit.parent) {
      const edge = curve(colX(commit.parent.col), laneY(commit.parent.lane), cx, cy, color)
      edgeLayer.appendChild(edge)
      step.push({ el: edge, kind: 'draw' })
    }
    if (commit.mergeFrom) {
      const edge = curve(
        colX(commit.mergeFrom.col),
        laneY(commit.mergeFrom.lane),
        cx,
        cy,
        paletteColor(commit.mergeFrom.lane),
      )
      edgeLayer.appendChild(edge)
      step.push({ el: edge, kind: 'draw' })
    }

    const g = el('g')
    const ring = highlightColor(commit.op.highlight, t)
    if (commit.mergeFrom) {
      // Merge commit: ring dot.
      g.appendChild(
        el('circle', { cx, cy, r: DOT_R, fill: t.background, stroke: ring ?? color, 'stroke-width': 2.5 }),
      )
    } else {
      g.appendChild(el('circle', { cx, cy, r: DOT_R, fill: color, stroke: ring ?? color, 'stroke-width': ring ? 3 : 0 }))
    }
    if (commit.label !== '') {
      g.appendChild(textEl(cx, cy + DOT_R + 11, commit.label, { color: t.textSecondary, size: 10 }))
    }
    if (commit.op.tag) {
      const tw = estimateTextWidth(commit.op.tag, 10) + 10
      g.appendChild(
        el('rect', {
          x: cx - tw / 2,
          y: cy - DOT_R - 24,
          width: tw,
          height: 16,
          rx: 4,
          fill: t.noteBackground,
          stroke: t.noteBorder,
        }),
      )
      g.appendChild(textEl(cx, cy - DOT_R - 16, commit.op.tag, { color: t.textSecondary, size: 10 }))
    }
    root.appendChild(g)
    step.push({ el: g, kind: 'scale' })
    animSteps.push(step)
  }

  return { svg, steps: animSteps }
}

export function gitGraph(container: HTMLElement, config: GitGraphConfig): DiagramController {
  const opts = resolveOptions(config.options)
  const { svg, steps } = buildGitGraphSvg(config, opts)
  return createDiagram(container, svg, steps, opts, 1)
}
