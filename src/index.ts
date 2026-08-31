import { detectType } from './detect'
import { parseSequence } from './sequence/parse'
import { sequence } from './sequence/render'
import { parseFlowchart } from './flowchart/parse'
import { flowchart } from './flowchart/render'
import { parseState } from './state/parse'
import { stateDiagram } from './state/render'
import type {
  DiagramConfig,
  DiagramController,
  DiagramOptions,
  FlowchartConfig,
  SequenceConfig,
  StateConfig,
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
    return stateDiagram(container, { ...parseState(input), options })
  }
  const merged = { ...input, options: { ...input.options, ...options } }
  // Inference priority is deliberate: flowchart (nodes) → state (states) →
  // sequence (actors). A config carrying multiple shapes should set `type`.
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
  throw new Error('Cannot determine diagram type from config; set the "type" field')
}

export function init(root: ParentNode = document): DiagramController[] {
  const controllers: DiagramController[] = []
  for (const pre of [...root.querySelectorAll('pre.animated-mermaid-diagrams')]) {
    const source = pre.textContent ?? ''
    const div = document.createElement('div')
    pre.replaceWith(div)
    try {
      controllers.push(render(div, source))
    } catch (err) {
      // One bad diagram must not break the rest of the page: restore the
      // original <pre> and keep scanning.
      div.replaceWith(pre)
      console.error('[animated-mermaid-diagrams] failed to render diagram:', err)
    }
  }
  return controllers
}

export { sequence } from './sequence/render'
export { flowchart } from './flowchart/render'
export { stateDiagram } from './state/render'
export { parseSequence } from './sequence/parse'
export { parseFlowchart } from './flowchart/parse'
export { parseState } from './state/parse'
export { detectType } from './detect'
export { lightTheme, darkTheme } from './theme'
export type {
  DiagramOptions,
  DiagramController,
  DiagramConfig,
  ThemeTokens,
  SequenceConfig,
  SequenceActor,
  SequenceStep,
  FlowchartConfig,
  FlowNode,
  FlowEdge,
  FlowShape,
  FlowDirection,
  StateConfig,
  StateNode,
  StateTransition,
} from './types'
