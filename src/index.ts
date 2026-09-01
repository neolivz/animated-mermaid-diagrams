import { detectType } from './detect'
import { parseSequence } from './sequence/parse'
import { sequence } from './sequence/render'
import { parseFlowchart } from './flowchart/parse'
import { flowchart } from './flowchart/render'
import { parseState } from './state/parse'
import { stateDiagram } from './state/render'
import { parseJourney } from './journey/parse'
import { journey } from './journey/render'
import { parseTimeline } from './timeline/parse'
import { timeline } from './timeline/render'
import { parseClass } from './class/parse'
import { classDiagram } from './class/render'
import { parseEr } from './er/parse'
import { erDiagram } from './er/render'
import type {
  ClassConfig,
  DiagramConfig,
  DiagramController,
  DiagramOptions,
  ErConfig,
  FlowchartConfig,
  JourneyConfig,
  SequenceConfig,
  StateConfig,
  TimelineConfig,
} from './types'

export function render(
  container: HTMLElement,
  input: string | DiagramConfig,
  options?: DiagramOptions,
): DiagramController {
  if (typeof input === 'string') {
    const kind = detectType(input)
    if (kind === 'sequence') return sequence(container, { ...parseSequence(input), options })
    if (kind === 'flowchart') return flowchart(container, { ...parseFlowchart(input), options })
    if (kind === 'journey') return journey(container, { ...parseJourney(input), options })
    if (kind === 'timeline') return timeline(container, { ...parseTimeline(input), options })
    if (kind === 'class') return classDiagram(container, { ...parseClass(input), options })
    if (kind === 'er') return erDiagram(container, { ...parseEr(input), options })
    return stateDiagram(container, { ...parseState(input), options })
  }
  const merged = { ...input, options: { ...input.options, ...options } }
  // Inference priority is deliberate: flowchart (nodes) → state (states) →
  // sequence (actors) → journey/timeline (sections, told apart by whether the
  // first section holds tasks or periods). A config carrying multiple shapes
  // should set `type`.
  if (merged.type === 'flowchart' || (merged.type === undefined && 'nodes' in merged)) {
    const cfg = merged as FlowchartConfig
    if (!Array.isArray(cfg.nodes) || !Array.isArray(cfg.edges)) {
      throw new Error('Flowchart config requires "nodes" and "edges" arrays')
    }
    return flowchart(container, cfg)
  }
  if (merged.type === 'state' || (merged.type === undefined && 'states' in merged)) {
    const cfg = merged as StateConfig
    if (!Array.isArray(cfg.states) || !Array.isArray(cfg.transitions)) {
      throw new Error('State config requires "states" and "transitions" arrays')
    }
    return stateDiagram(container, cfg)
  }
  if (merged.type === 'sequence' || (merged.type === undefined && 'actors' in merged)) {
    const cfg = merged as SequenceConfig
    if (!Array.isArray(cfg.actors) || !Array.isArray(cfg.steps)) {
      throw new Error('Sequence config requires "actors" and "steps" arrays')
    }
    return sequence(container, cfg)
  }
  if (merged.type === 'class' || (merged.type === undefined && 'classes' in merged)) {
    const cfg = merged as ClassConfig
    if (!Array.isArray(cfg.classes) || !Array.isArray(cfg.relations)) {
      throw new Error('Class config requires "classes" and "relations" arrays')
    }
    return classDiagram(container, cfg)
  }
  if (merged.type === 'er' || (merged.type === undefined && 'entities' in merged)) {
    const cfg = merged as ErConfig
    if (!Array.isArray(cfg.entities) || !Array.isArray(cfg.relationships)) {
      throw new Error('Er config requires "entities" and "relationships" arrays')
    }
    return erDiagram(container, cfg)
  }
  const sections = 'sections' in merged && Array.isArray(merged.sections) ? merged.sections : undefined
  // First-section semantics, matching the priority comment above: a config
  // mixing tasks- and periods-shaped sections follows its first section (the
  // renderers tolerate the mismatched rest); set `type` to be explicit.
  const firstSection: object | undefined = sections?.[0]
  const journeyLike =
    merged.type === 'journey' ||
    (merged.type === undefined && firstSection !== undefined && 'tasks' in firstSection)
  if (journeyLike) {
    const cfg = merged as JourneyConfig
    if (!Array.isArray(cfg.sections)) throw new Error('Journey config requires a "sections" array')
    return journey(container, cfg)
  }
  const timelineLike =
    merged.type === 'timeline' ||
    (merged.type === undefined && firstSection !== undefined && 'periods' in firstSection)
  if (timelineLike) {
    const cfg = merged as TimelineConfig
    if (!Array.isArray(cfg.sections)) throw new Error('Timeline config requires a "sections" array')
    return timeline(container, cfg)
  }
  throw new Error('Cannot determine diagram type from config; set the "type" field')
}

const INIT_SELECTOR = 'pre.animated-mermaid-diagrams, [data-animated-mermaid]'

// ---- init(): declarative per-element options from data-amd-* attributes ----

const AMD_THEMES = ['light', 'dark', 'auto'] as const
const AMD_TRIGGERS = ['onScroll', 'immediate', 'manual'] as const
const AMD_ADVANCES = ['auto', 'click'] as const

function readEnum<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

function readBool(value: string | null): boolean | undefined {
  if (value === null) return undefined
  if (value === '' || value === 'true') return true
  if (value === 'false') return false
  return undefined // anything else: ignored
}

function readNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isNaN(n) ? undefined : n
}

/** `data-amd-width` / `data-amd-height`: the literal pass-through value
 *  ('100%' / 'auto') when it matches, otherwise a parsed number (ignored if
 *  not numeric). */
function readSizeOrLiteral<L extends string>(
  value: string | null,
  literal: L,
): L | number | undefined {
  if (value === null) return undefined
  if (value === literal) return literal
  return readNumber(value)
}

/** Reads `data-amd-*` attributes off a marked element into a `DiagramOptions`
 *  partial. Uses `getAttribute` (not `dataset`) so this also works for
 *  SVG-in-HTML markup and keeps the kebab-case names explicit. Unset or
 *  invalid attributes are simply omitted from the result — an invalid value
 *  is silently ignored, consistent with the library's lenient Mermaid-syntax
 *  parsing elsewhere. */
function optionsFromAttributes(el: Element): DiagramOptions {
  const opts: DiagramOptions = {}

  const theme = readEnum(el.getAttribute('data-amd-theme'), AMD_THEMES)
  if (theme !== undefined) opts.theme = theme

  const animate = readBool(el.getAttribute('data-amd-animate'))
  if (animate !== undefined) opts.animate = animate

  const trigger = readEnum(el.getAttribute('data-amd-trigger'), AMD_TRIGGERS)
  if (trigger !== undefined) opts.trigger = trigger

  // The `data-animated-mermaid="click"|"auto"` marker value is shorthand for
  // `data-amd-advance`; the explicit attribute wins when both are present.
  const advance =
    readEnum(el.getAttribute('data-amd-advance'), AMD_ADVANCES) ??
    readEnum(el.getAttribute('data-animated-mermaid'), AMD_ADVANCES)
  if (advance !== undefined) opts.advance = advance

  const keyboard = readBool(el.getAttribute('data-amd-keyboard'))
  if (keyboard !== undefined) opts.keyboard = keyboard

  const replayOnScroll = readBool(el.getAttribute('data-amd-replay-on-scroll'))
  if (replayOnScroll !== undefined) opts.replayOnScroll = replayOnScroll

  const stepDuration = readNumber(el.getAttribute('data-amd-step-duration'))
  if (stepDuration !== undefined) opts.stepDuration = stepDuration

  const stepDelay = readNumber(el.getAttribute('data-amd-step-delay'))
  if (stepDelay !== undefined) opts.stepDelay = stepDelay

  const padding = readNumber(el.getAttribute('data-amd-padding'))
  if (padding !== undefined) opts.padding = padding

  const width = readSizeOrLiteral(el.getAttribute('data-amd-width'), '100%')
  if (width !== undefined) opts.width = width

  const height = readSizeOrLiteral(el.getAttribute('data-amd-height'), 'auto')
  if (height !== undefined) opts.height = height

  const fontFamily = el.getAttribute('data-amd-font-family')
  if (fontFamily !== null) opts.fontFamily = fontFamily

  return opts
}

export function init(
  root: ParentNode = document,
  defaults: DiagramOptions = {},
): DiagramController[] {
  const controllers: DiagramController[] = []
  for (const el of [...root.querySelectorAll(INIT_SELECTOR)]) {
    const source = el.textContent ?? ''
    const options: DiagramOptions = { ...defaults, ...optionsFromAttributes(el) }
    const div = document.createElement('div')
    el.replaceWith(div)
    try {
      controllers.push(render(div, source, options))
    } catch (err) {
      // One bad diagram must not break the rest of the page: restore the
      // original element and keep scanning.
      div.replaceWith(el)
      console.error('[animated-mermaid-diagrams] failed to render diagram:', err)
    }
  }
  return controllers
}

export { sequence } from './sequence/render'
export { flowchart } from './flowchart/render'
export { stateDiagram } from './state/render'
export { journey } from './journey/render'
export { timeline } from './timeline/render'
export { classDiagram } from './class/render'
export { erDiagram } from './er/render'
export { parseSequence } from './sequence/parse'
export { parseFlowchart } from './flowchart/parse'
export { parseState } from './state/parse'
export { parseJourney } from './journey/parse'
export { parseTimeline } from './timeline/parse'
export { parseClass } from './class/parse'
export { parseEr } from './er/parse'
export { detectType } from './detect'
export type { DetectedType } from './detect'
export { lightTheme, darkTheme } from './theme'
export type {
  DiagramOptions,
  DiagramController,
  DiagramConfig,
  DiagramGroup,
  Highlight,
  ThemeTokens,
  SequenceConfig,
  SequenceActor,
  SequenceStep,
  SequenceFrame,
  SequenceFrameSection,
  SequenceActivation,
  FlowchartConfig,
  FlowchartGroup,
  FlowNode,
  FlowEdge,
  FlowShape,
  FlowDirection,
  StateConfig,
  StateNode,
  StateTransition,
  JourneyConfig,
  JourneySection,
  JourneyTask,
  TimelineConfig,
  TimelineSection,
  TimelinePeriod,
  ClassConfig,
  ClassNode,
  ClassRelation,
  ClassRelationType,
  ErConfig,
  ErEntity,
  ErAttribute,
  ErRelationship,
  ErCardinality,
  ErKey,
} from './types'
