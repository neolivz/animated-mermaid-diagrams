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
  if (merged.type === 'flowchart' || (merged.type === undefined && 'nodes' in merged)) {
    return flowchart(container, merged as FlowchartConfig)
  }
  if (merged.type === 'state' || (merged.type === undefined && 'states' in merged)) {
    return stateDiagram(container, merged as StateConfig)
  }
  if (merged.type === 'sequence' || (merged.type === undefined && 'actors' in merged)) {
    return sequence(container, merged as SequenceConfig)
  }
  throw new Error('Cannot determine diagram type from config; set the "type" field')
}

export function init(root: ParentNode = document): DiagramController[] {
  const controllers: DiagramController[] = []
  for (const pre of [...root.querySelectorAll('pre.animated-mermaid-diagrams')]) {
    const source = pre.textContent ?? ''
    const div = document.createElement('div')
    pre.replaceWith(div)
    controllers.push(render(div, source))
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
