export interface ThemeTokens {
  background: string
  text: string
  textSecondary: string
  line: string
  lineResponse: string
  nodeBackground: string
  nodeBorder: string
  noteBackground: string
  noteBorder: string
  highlight: string
  highlightRed: string
  lifeline: string
}

export interface DiagramOptions {
  theme?: 'light' | 'dark' | 'auto' | ThemeTokens
  animate?: boolean
  trigger?: 'onScroll' | 'immediate' | 'manual'
  /** 'auto' (default) plays on a timer; 'click' waits for the viewer to click
   *  through each step (sequence/state) or click revealed flowchart nodes to
   *  expand their branches. */
  advance?: 'auto' | 'click'
  stepDuration?: number
  stepDelay?: number
  replayOnScroll?: boolean
  width?: number | '100%'
  height?: number | 'auto'
  padding?: number
  fontFamily?: string
  onComplete?: () => void
  onStepStart?: (index: number) => void
}

export interface ResolvedOptions {
  theme: ThemeTokens
  animate: boolean
  trigger: 'onScroll' | 'immediate' | 'manual'
  advance: 'auto' | 'click'
  stepDuration: number
  stepDelay: number
  replayOnScroll: boolean
  width: number | '100%'
  height: number | 'auto'
  padding: number
  fontFamily: string
  onComplete?: () => void
  onStepStart?: (index: number) => void
}

export interface DiagramController {
  play(): void
  reset(): void
  pause(): void
  resume(): void
  goToStep(n: number): void
  destroy(): void
}

// ---- sequence ----

export interface SequenceActor {
  id: string
  label: string
  type?: 'actor' | 'participant'
}

export interface SequenceStep {
  from?: string
  to?: string
  text: string
  type?: 'request' | 'response' | 'note'
  over?: string | string[]
  highlight?: boolean
  /** parsed from Mermaid -x / --x arrows; renders an X instead of an arrowhead */
  failed?: boolean
}

export interface SequenceConfig {
  type?: 'sequence'
  actors: SequenceActor[]
  steps: SequenceStep[]
  options?: DiagramOptions
}

// ---- flowchart ----

export type FlowShape = 'rect' | 'rounded' | 'diamond' | 'circle' | 'stadium'
export type FlowDirection = 'TB' | 'LR' | 'BT' | 'RL'

export interface FlowNode {
  id: string
  text: string
  shape?: FlowShape
  highlight?: boolean
}

export interface FlowEdge {
  from: string
  to: string
  label?: string
  type?: 'solid' | 'dashed'
}

export interface FlowchartConfig {
  type?: 'flowchart'
  nodes: FlowNode[]
  edges: FlowEdge[]
  direction?: FlowDirection
  options?: DiagramOptions
}

// ---- state ----

export interface StateNode {
  id: string
  text: string
  type?: 'default' | 'start' | 'end'
  highlight?: boolean | 'red' | 'green'
}

export interface StateTransition {
  from: string
  to: string
  label?: string
}

export interface StateConfig {
  type?: 'state'
  states: StateNode[]
  transitions: StateTransition[]
  initial?: string
  options?: DiagramOptions
}

export type DiagramConfig = SequenceConfig | FlowchartConfig | StateConfig
