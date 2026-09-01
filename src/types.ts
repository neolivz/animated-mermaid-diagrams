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

/** Shared shape for the `highlight` field on sequence steps, flowchart nodes,
 *  and state nodes: `true`/`'green'` use the `highlight` theme token, `'red'`
 *  uses `highlightRed`, `false`/`undefined` uses the element's normal color. */
export type Highlight = boolean | 'red' | 'green'

export interface DiagramOptions {
  /** `'light' | 'dark' | 'auto'`, or a theme object. The object may be a full
   *  `ThemeTokens` (used exactly as given) or a partial one — unspecified
   *  tokens fall back to the auto-resolved built-in theme. */
  theme?: 'light' | 'dark' | 'auto' | Partial<ThemeTokens>
  animate?: boolean
  trigger?: 'onScroll' | 'immediate' | 'manual'
  /** 'auto' (default) plays on a timer; 'click' waits for the viewer to click
   *  through each step (sequence/state) or click revealed flowchart nodes to
   *  expand their branches. */
  advance?: 'auto' | 'click'
  /** When true (and the diagram animates), the SVG becomes focusable and
   *  responds to arrow keys / Space / Home / End / Enter for keyboard-driven
   *  playback control. Default false. */
  keyboard?: boolean
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
  keyboard: boolean
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
  highlight?: Highlight
  /** parsed from Mermaid -x / --x arrows; renders an X instead of an arrowhead */
  failed?: boolean
}

export interface SequenceFrameSection {
  label?: string
  /** step index where this section begins */
  fromStep: number
}

export interface SequenceFrame {
  kind: 'alt' | 'opt' | 'loop' | 'par'
  label?: string
  /** inclusive step range the frame encloses */
  fromStep: number
  toStep: number
  /** extra sections from else/and; the first section is implicit */
  sections: SequenceFrameSection[]
  /** nesting depth, 0 = outermost */
  depth: number
}

export interface SequenceActivation {
  actor: string
  /** inclusive step range the bar spans */
  fromStep: number
  toStep: number
  /** overlap level for the same actor (0 = base bar) */
  level: number
}

export interface SequenceConfig {
  type?: 'sequence'
  actors: SequenceActor[]
  steps: SequenceStep[]
  frames?: SequenceFrame[]
  activations?: SequenceActivation[]
  options?: DiagramOptions
}

// ---- flowchart ----

export type FlowShape = 'rect' | 'rounded' | 'diamond' | 'circle' | 'stadium'
export type FlowDirection = 'TB' | 'LR' | 'BT' | 'RL'

export interface FlowNode {
  id: string
  text: string
  shape?: FlowShape
  highlight?: Highlight
  /** id of the enclosing subgraph, if any */
  group?: string
}

export interface FlowEdge {
  from: string
  to: string
  label?: string
  type?: 'solid' | 'dashed'
}

/** A container group (flowchart subgraph / state composite): an id + title,
 *  optionally nested under a parent group. Shared shape so flowchart and
 *  state configs don't each redeclare it. */
export interface DiagramGroup {
  id: string
  title: string
  parent?: string
}

export type FlowchartGroup = DiagramGroup

export interface FlowchartConfig {
  type?: 'flowchart'
  nodes: FlowNode[]
  edges: FlowEdge[]
  direction?: FlowDirection
  groups?: FlowchartGroup[]
  options?: DiagramOptions
}

// ---- state ----

export interface StateNode {
  id: string
  text: string
  type?: 'default' | 'start' | 'end'
  highlight?: Highlight
  /** id of the enclosing composite state, if any */
  group?: string
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
  groups?: DiagramGroup[]
  options?: DiagramOptions
}

// ---- journey ----

export interface JourneyTask {
  name: string
  /** satisfaction score 1–7 (Mermaid journey scale); out-of-range values clamp */
  score: number
  actors?: string[]
  highlight?: Highlight
}

export interface JourneySection {
  /** untitled sections (tasks before the first `section` line) omit this */
  title?: string
  tasks: JourneyTask[]
}

export interface JourneyConfig {
  type?: 'journey'
  title?: string
  sections: JourneySection[]
  options?: DiagramOptions
}

// ---- timeline ----

export interface TimelinePeriod {
  label: string
  events: string[]
  highlight?: Highlight
}

export interface TimelineSection {
  /** untitled sections (periods before the first `section` line) omit this */
  title?: string
  periods: TimelinePeriod[]
}

export interface TimelineConfig {
  type?: 'timeline'
  title?: string
  sections: TimelineSection[]
  options?: DiagramOptions
}

// ---- class ----

export type ClassRelationType =
  | 'inheritance'
  | 'composition'
  | 'aggregation'
  | 'association'
  | 'dependency'
  | 'realization'
  | 'link'

export interface ClassNode {
  id: string
  /** display name; defaults to id. Generics parse as e.g. "List<T>" */
  label?: string
  /** e.g. "<<interface>>" — shown as a small line under the title */
  annotation?: string
  /** member strings rendered verbatim, e.g. "+name: String" */
  attributes?: string[]
  /** member strings rendered verbatim, e.g. "+save() bool" */
  methods?: string[]
  highlight?: Highlight
}

/** The marker (triangle/diamond/arrowhead) always renders at the `to` end;
 *  the parser normalizes Mermaid's arrow orientation into this form. */
export interface ClassRelation {
  from: string
  to: string
  /** default 'association'. dependency/realization render dashed */
  type?: ClassRelationType
  label?: string
  fromCardinality?: string
  toCardinality?: string
  /** dashed line for the plain 'link' type (Mermaid `..`) */
  dashed?: boolean
}

export interface ClassConfig {
  type?: 'class'
  classes: ClassNode[]
  relations: ClassRelation[]
  direction?: FlowDirection
  options?: DiagramOptions
}

// ---- er ----

export type ErKey = 'PK' | 'FK' | 'UK'

export interface ErAttribute {
  type: string
  name: string
  keys?: ErKey[]
  /** parsed from Mermaid but not rendered in v1 */
  comment?: string
}

export interface ErEntity {
  id: string
  /** display name; defaults to id */
  label?: string
  attributes?: ErAttribute[]
  highlight?: Highlight
}

export type ErCardinality = 'zero-or-one' | 'exactly-one' | 'zero-or-more' | 'one-or-more'

export interface ErRelationship {
  from: string
  to: string
  /** crow's-foot marker at the `from` end; default 'exactly-one' */
  fromCardinality?: ErCardinality
  /** crow's-foot marker at the `to` end; default 'exactly-one' */
  toCardinality?: ErCardinality
  /** identifying (solid, default) vs non-identifying (dashed) */
  identifying?: boolean
  label?: string
}

export interface ErConfig {
  type?: 'er'
  entities: ErEntity[]
  relationships: ErRelationship[]
  options?: DiagramOptions
}

// ---- pie ----

export interface PieSlice {
  label: string
  /** non-negative; non-finite or negative values are treated as 0 */
  value: number
  highlight?: Highlight
}

export interface PieConfig {
  type?: 'pie'
  title?: string
  /** show each slice's value in the legend (Mermaid `pie showData`) */
  showData?: boolean
  slices: PieSlice[]
  options?: DiagramOptions
}

// ---- gantt ----

export type GanttStatus = 'done' | 'active' | 'crit'

export interface GanttTask {
  name: string
  /** referenced by other tasks' `after` */
  id?: string
  /** ISO date (YYYY-MM-DD). When absent, resolved from `after` or the previous task's end */
  start?: string
  /** id of the task whose end this task starts at */
  after?: string
  durationDays?: number
  /** ISO end date, used when `durationDays` is absent */
  end?: string
  status?: GanttStatus
  /** renders a diamond at the start date instead of a bar */
  milestone?: boolean
  highlight?: Highlight
}

export interface GanttSection {
  title?: string
  tasks: GanttTask[]
}

export interface GanttConfig {
  type?: 'gantt'
  title?: string
  sections: GanttSection[]
  options?: DiagramOptions
}

// ---- mindmap ----

export type MindmapShape = 'default' | 'circle' | 'rounded' | 'square' | 'hexagon' | 'cloud' | 'bang'

export interface MindmapNode {
  text: string
  shape?: MindmapShape
  highlight?: Highlight
  children?: MindmapNode[]
}

export interface MindmapConfig {
  type?: 'mindmap'
  root: MindmapNode
  options?: DiagramOptions
}

// ---- sankey ----

export interface SankeyLink {
  source: string
  target: string
  /** non-negative; non-finite or negative values are treated as 0 */
  value: number
  highlight?: Highlight
}

export interface SankeyConfig {
  type?: 'sankey'
  links: SankeyLink[]
  options?: DiagramOptions
}

// ---- gitgraph ----

export interface GitOperation {
  op: 'commit' | 'branch' | 'checkout' | 'merge'
  /** branch name, for branch/checkout/merge */
  name?: string
  /** commit label, for commit (auto-numbered when absent) */
  id?: string
  /** tag chip above the commit/merge dot */
  tag?: string
  highlight?: Highlight
}

export interface GitGraphConfig {
  type?: 'gitgraph'
  operations: GitOperation[]
  options?: DiagramOptions
}

// ---- architecture ----

export type ArchIcon = 'cloud' | 'database' | 'disk' | 'server' | 'internet'
export type ArchSide = 'L' | 'R' | 'T' | 'B'

export interface ArchGroup {
  id: string
  title?: string
  icon?: ArchIcon
}

export interface ArchService {
  id: string
  /** display name; defaults to id */
  label?: string
  icon?: ArchIcon
  /** id of the enclosing group */
  group?: string
  highlight?: Highlight
}

export interface ArchEdge {
  from: string
  to: string
  /** anchor side on each card; defaults to the nearest sides */
  fromSide?: ArchSide
  toSide?: ArchSide
}

export interface ArchitectureConfig {
  type?: 'architecture'
  groups?: ArchGroup[]
  services: ArchService[]
  edges: ArchEdge[]
  options?: DiagramOptions
}

export type DiagramConfig =
  | SequenceConfig
  | FlowchartConfig
  | StateConfig
  | JourneyConfig
  | TimelineConfig
  | ClassConfig
  | ErConfig
  | PieConfig
  | GanttConfig
  | MindmapConfig
  | SankeyConfig
  | GitGraphConfig
  | ArchitectureConfig
