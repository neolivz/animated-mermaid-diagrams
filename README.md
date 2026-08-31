# animated-mermaid-diagrams

Drop-in animated rendering for Mermaid diagrams. Accepts Mermaid syntax or a JS config, renders animated SVGs that auto-play on scroll. One dependency: [`@dagrejs/dagre`](https://github.com/dagrejs/dagre) — the same layout engine Mermaid uses.

## Install

```bash
npm install animated-mermaid-diagrams
```

## Vision

Animate every Mermaid diagram type. V1 ships sequence, flowchart, and state diagrams — the three types where step-by-step animation adds the most value. Subsequent releases add the remaining types.

### Roadmap

| Version | Diagram types |
| ------- | ------------- |
| v1.0 | Sequence, Flowchart, State Diagram |
| v1.1 | Journey, Timeline |
| v1.2 | Class Diagram, ER Diagram |
| v1.3 | Pie, Gantt |
| v2.0 | Mindmap, Sankey, Git Graph, Architecture |

## Input: Mermaid syntax or JS config

Every diagram type accepts either raw Mermaid text or a structured JS config. Mermaid input is parsed into the same internal config, so both paths produce identical output.

### Mermaid syntax input

```js
import { render } from 'animated-mermaid-diagrams'

render(container, `
  sequenceDiagram
    actor User
    participant App
    participant Backend

    User->>App: Click delete on item
    App->>Backend: GET resource usage
    Backend-->>App: Returns list with linked record
    App-->>User: Show dialog with linked record
    User->>App: Click the record link
    Note over App: Router intercepts navigation
    App-->>User: Record editor loads
`)
```

The `render()` function auto-detects the diagram type from the Mermaid syntax (first line: `sequenceDiagram`, `flowchart`, `stateDiagram-v2`, etc.) and delegates to the correct renderer.

### JS config input

For programmatic use or when you need features beyond what Mermaid syntax supports (highlights, custom callbacks per step).

```js
import { render } from 'animated-mermaid-diagrams'

render(container, {
  type: 'sequence',
  // ... type-specific config (see below)
})
```

Or import individual renderers directly (tree-shakeable):

```js
import { sequence, flowchart, stateDiagram } from 'animated-mermaid-diagrams'
```

---

## Diagram Types (v1)

### Sequence Diagram

#### Mermaid input

```js
render(container, `
  sequenceDiagram
    actor User
    participant App
    participant Backend

    User->>App: Click delete
    App->>Backend: GET resource usage
    Backend-->>App: Returns list
    Note over App: Router intercepts
    App-->>User: Record editor loads
`)
```

#### JS config input

```js
import { sequence } from 'animated-mermaid-diagrams'

sequence(container, {
  actors: [
    { id: 'user', label: 'User', type: 'actor' },
    { id: 'app', label: 'App' },
    { id: 'backend', label: 'Backend' },
  ],
  steps: [
    { from: 'user', to: 'app', text: 'Click delete' },
    { from: 'app', to: 'backend', text: 'GET resource usage' },
    { from: 'backend', to: 'app', text: 'Returns list', type: 'response' },
    { over: 'app', text: 'Router intercepts', type: 'note' },
    { from: 'app', to: 'user', text: 'Record editor loads', type: 'response', highlight: true },
  ],
})
```

#### Step schema

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `from` | `string` | yes (message) | Source actor id |
| `to` | `string` | yes (message) | Target actor id |
| `text` | `string` | yes | Message or note text |
| `type` | `'request' \| 'response' \| 'note'` | no | Default `'request'`. `response` renders dashed arrow. `note` renders a box over the actor(s) |
| `over` | `string \| string[]` | yes (note) | Actor id(s) the note spans. Used instead of from/to for notes |
| `highlight` | `boolean` | no | Highlight this step with accent color |
| `failed` | `boolean` | no | Renders an X terminator instead of an arrowhead (parsed from Mermaid `-x` / `--x`) |

#### Actor schema

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id` | `string` | yes | Unique identifier |
| `label` | `string` | yes | Display name |
| `type` | `'actor' \| 'participant'` | no | Default `'participant'`. `actor` renders as a person icon, `participant` as a box |

#### Animation behaviour

- Vertical dashed lifelines drop from each actor box
- Request arrows: solid line, draws via stroke-dashoffset animation
- Response arrows: dashed line, same draw animation
- Self-messages (from === to): curved arrow looping back to the same lifeline
- Notes: rounded rect fading in over lifeline(s)
- Steps animate in sequence with configurable stagger

---

### Flowchart

#### Mermaid input

```js
render(container, `
  flowchart TD
    A[Navigate to /items/id] --> B{Editable?}
    B -->|yes| C[Open editor]
    B -->|no| D[Show read-only view]
`)
```

#### JS config input

```js
import { flowchart } from 'animated-mermaid-diagrams'

flowchart(container, {
  nodes: [
    { id: 'start', text: 'Navigate to /items/{id}', shape: 'rounded' },
    { id: 'check', text: 'Editable?', shape: 'diamond' },
    { id: 'editor', text: 'Open editor', shape: 'rounded', highlight: true },
    { id: 'readonly', text: 'Show read-only view', shape: 'rounded' },
  ],
  edges: [
    { from: 'start', to: 'check' },
    { from: 'check', to: 'editor', label: 'yes' },
    { from: 'check', to: 'readonly', label: 'no' },
  ],
  direction: 'TB',
})
```

#### Node schema

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id` | `string` | yes | Unique identifier |
| `text` | `string` | yes | Display text |
| `shape` | `'rect' \| 'rounded' \| 'diamond' \| 'circle' \| 'stadium'` | no | Default `'rounded'` |
| `highlight` | `boolean` | no | Accent color for important nodes |

#### Edge schema

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `from` | `string` | yes | Source node id |
| `to` | `string` | yes | Target node id |
| `label` | `string` | no | Edge label text |
| `type` | `'solid' \| 'dashed'` | no | Default `'solid'` |

#### Direction

`'TB'` (top-bottom), `'LR'` (left-right), `'BT'`, `'RL'`

#### Animation behaviour

- Auto-layout: dagre layout — the same engine Mermaid uses
- Edges rendered as SVG paths with arrowhead markers
- Nodes fade/scale in layer by layer, then edges draw themselves to connect them
- Diamond nodes render as true diamonds with text centered
- Self-edges render as a small loop beside the node

---

### State Diagram

#### Mermaid input

```js
render(container, `
  stateDiagram-v2
    [*] --> Idle
    Idle --> Loading : fetch()
    Loading --> Ready : success
    Loading --> Error : failure
    Error --> Loading : retry()
    Ready --> Idle : reset()
`)
```

#### JS config input

```js
import { stateDiagram } from 'animated-mermaid-diagrams'

stateDiagram(container, {
  states: [
    { id: 'idle', text: 'Idle' },
    { id: 'loading', text: 'Loading' },
    { id: 'ready', text: 'Ready' },
    { id: 'error', text: 'Error', highlight: 'red' },
  ],
  transitions: [
    { from: 'idle', to: 'loading', label: 'fetch()' },
    { from: 'loading', to: 'ready', label: 'success' },
    { from: 'loading', to: 'error', label: 'failure' },
    { from: 'error', to: 'loading', label: 'retry()' },
    { from: 'ready', to: 'idle', label: 'reset()' },
  ],
  initial: 'idle',
})
```

#### State schema

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id` | `string` | yes | Unique identifier |
| `text` | `string` | yes | Display text |
| `type` | `'default' \| 'start' \| 'end'` | no | `start` renders a filled circle, `end` renders a circle with inner dot |
| `highlight` | `boolean \| 'red' \| 'green'` | no | Accent color |

#### Transition schema

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `from` | `string` | yes | Source state id |
| `to` | `string` | yes | Target state id |
| `label` | `string` | no | Transition label |

#### Animation behaviour

- States rendered as rounded rectangles
- Start state has a filled circle before it, end state has a circle-in-circle after it
- Transitions are curved arrows between states with labels; bidirectional pairs bow to opposite sides
- Initial state appears first, then transitions draw one-by-one following BFS from initial state, each target state appearing as the transition reaches it
- Self-transitions (from === to): loop arrow above the state

---

## Shared Options

All diagram types accept an `options` object (second argument for `render()`, or nested inside config for direct functions):

```typescript
interface DiagramOptions {
  theme?: 'light' | 'dark' | 'auto' | ThemeTokens
  animate?: boolean
  trigger?: 'onScroll' | 'immediate' | 'manual'
  advance?: 'auto' | 'click'
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
```

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `theme` | `'light' \| 'dark' \| 'auto' \| ThemeTokens` | `'auto'` | `'auto'` reads `prefers-color-scheme`. Pass a `ThemeTokens` object for custom colors |
| `animate` | `boolean` | `true` | Set `false` to render final state immediately |
| `trigger` | `'onScroll' \| 'immediate' \| 'manual'` | `'onScroll'` | When to start animation |
| `advance` | `'auto' \| 'click'` | `'auto'` | Advance steps on click instead of a timer; on flowcharts, click a revealed node to expand its branches |
| `keyboard` | `boolean` | `false` | Focused diagrams respond to arrow keys (step), Space (pause/resume), Home/End |
| `stepDuration` | `number` | `400` | Milliseconds per step animation |
| `stepDelay` | `number` | `100` | Milliseconds between steps |
| `replayOnScroll` | `boolean` | `true` | Replay animation when diagram re-enters viewport |
| `width` | `number \| '100%'` | `'100%'` | SVG width — responsive by default, up to the diagram's natural size (never scales up past it, like Mermaid) |
| `height` | `number \| 'auto'` | `'auto'` | SVG height (fits content by default) |
| `padding` | `number` | `40` | Padding inside SVG in px |
| `fontFamily` | `string` | `'system-ui, sans-serif'` | Font for all text |
| `onComplete` | `() => void` | `undefined` | Callback when animation finishes |
| `onStepStart` | `(index: number) => void` | `undefined` | Callback when a step begins |

Note: `theme: 'auto'` and `prefers-reduced-motion` are evaluated once when the diagram is created; changing the OS setting afterwards affects newly created diagrams, not existing ones.

### Theme tokens

```typescript
interface ThemeTokens {
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
```

Built-in themes:

| Token | Light | Dark |
| ----- | ----- | ---- |
| `background` | `#ffffff` | `#0f172a` |
| `text` | `#1e293b` | `#e2e8f0` |
| `textSecondary` | `#475569` | `#94a3b8` |
| `line` | `#6366f1` | `#818cf8` |
| `lineResponse` | `#10b981` | `#34d399` |
| `nodeBackground` | `#eef2ff` | `#312e81` |
| `nodeBorder` | `#6366f1` | `#6366f1` |
| `noteBackground` | `#f8fafc` | `#334155` |
| `noteBorder` | `#e2e8f0` | `#475569` |
| `highlight` | `#10b981` | `#34d399` |
| `highlightRed` | `#ef4444` | `#f87171` |
| `lifeline` | `rgba(99,102,241,0.3)` | `rgba(99,102,241,0.3)` |

### Trigger modes

- `onScroll` — IntersectionObserver fires animation when container enters viewport. Replays when it re-enters (controlled by `replayOnScroll`). Falls back to immediate play where IntersectionObserver is unavailable.
- `immediate` — animate on render
- `manual` — returns a controller only, does not auto-play

### Click-to-advance (`advance: 'click'`)

The intro still reveals on whatever `trigger` fires (immediate on render, on scroll into view, or on `play()` for `manual`); after that the diagram waits for the viewer instead of a timer:

- **Sequence and state diagrams** advance one step per click anywhere on the diagram — a lightweight "next" control with no buttons to build.
- **Flowcharts** work differently: revealed nodes become clickable (cursor turns to a pointer). Clicking a revealed node animates in its outgoing edges and whatever nodes they lead to, so the viewer walks the graph branch by branch. Clicking empty space, or a node that isn't revealed yet, does nothing.

`onComplete` fires once every step has been revealed by clicking; `onStepStart` still fires per step as it's revealed. Reduced-motion and `animate: false` are unaffected — they always show the final state immediately, ignoring `advance`.

### Controller (returned from all functions)

```typescript
interface DiagramController {
  play(): void
  reset(): void
  pause(): void
  resume(): void
  goToStep(n: number): void
  destroy(): void
}
```

| Method | Description |
| ------ | ----------- |
| `play()` | Start or restart animation from the beginning |
| `reset()` | Reset to initial state (nothing visible) |
| `pause()` | Pause mid-animation |
| `resume()` | Resume from pause, or continue playback after `goToStep(n)` |
| `goToStep(n)` | Jump to step n showing all prior steps completed |
| `destroy()` | Remove SVG, disconnect observers, clean up |

Step indices for `goToStep(n)` / `onStepStart(n)`: for sequence diagrams, `n` maps 1:1 to `steps[n]` in the config. For flowcharts, steps follow the layered reveal order (layer nodes, connecting edges, next layer, …). For state diagrams, steps follow the BFS reveal order from the initial state, which may differ from the order of the `transitions` array.

## Mermaid Syntax Compatibility

The parser aims for compatibility with Mermaid's syntax as documented at mermaid.js.org. V1 supports:

### Sequence diagram syntax

- `actor` and `participant` declarations, including `participant A as Alias`
- `A->>B: message` (solid arrow), `A-->>B: message` (dashed arrow)
- `A->B: message` and `A-->B: message` (open arrows)
- `A-xB: message` (failed) and `A--xB: message` (failed dashed) — failed messages render an X terminator
- `Note over A: text`, `Note over A,B: text`, `Note left of A:`, `Note right of A:`
- `alt`/`else`/`end`, `opt`/`end`, `loop`/`end`, `par`/`and`/`end` frames — rendered as labeled boxes around their contained steps, appearing when their first contained step animates
- `activate A` / `deactivate A`, and the `A->>+B: message` / `A-->>-B: message` shorthand — rendered as activation bars on the target/source lifeline

### Flowchart syntax

- `flowchart TD/LR/BT/RL` (and `graph`)
- Node shapes: `[text]`, `(text)`, `{text}`, `([text])`, `((text))`
- Edge styles: `-->`, `---`, `-.->`, `==>` with optional `|label|`
- Quoted labels (`a["text with --> arrows"]`) are protected from the edge parser
- `subgraph title` / `end` containers — rendered as a labeled box around their member nodes, appearing when the first member node appears

### State diagram syntax

- `stateDiagram-v2` (and `stateDiagram`)
- `[*] -->` for initial/final states
- `State1 --> State2 : label`
- `state "Description" as s1`
- Composite states (`state Name { ... }`) — rendered as a labeled box around their nested states

### Simplifications

A few constructs render with intentionally simplified semantics rather than full fidelity to Mermaid's behavior:

- Activation bars appear at full height with their opening step, rather than growing incrementally as nested messages occur
- Message arrows don't shift their endpoints onto activation bars — they still anchor to the lifeline
- Flowchart edges that target a subgraph id (rather than a node inside it) are dropped
- State transitions to/from a composite state are re-targeted to that composite's first child state
- `par`/`and` sections animate in document order, not concurrently

### Recognized but not yet rendered (planned for v1.x)

These constructs are parsed leniently and **silently skipped** — the rest of the diagram renders without them:

- Sequence: `autonumber` (message numbering is not yet rendered)

Other unsupported Mermaid features are silently ignored (the diagram renders without them). Future versions will expand coverage.

## Usage Patterns

### HTML page (script tag)

```html
<script src="https://unpkg.com/animated-mermaid-diagrams/dist/animated-mermaid-diagrams.umd.js"></script>
<div id="diagram"></div>
<script>
  AnimatedMermaidDiagrams.render(document.getElementById('diagram'), `
    sequenceDiagram
      actor User
      participant App
      User->>App: Click button
      App-->>User: Show result
  `)
</script>
```

### React

```tsx
import { useEffect, useRef } from 'react'
import { render } from 'animated-mermaid-diagrams'

import type { DiagramOptions } from 'animated-mermaid-diagrams'

function Diagram({ mermaid, options }: { mermaid: string; options?: DiagramOptions }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const ctrl = render(ref.current, mermaid, options)
    return () => ctrl.destroy()
  }, [mermaid, options])
  return <div ref={ref} />
}
```

### Auto-detect from DOM (optional convenience)

```html
<pre class="animated-mermaid-diagrams">
sequenceDiagram
  actor User
  participant App
  User->>App: Hello
  App-->>User: Hi
</pre>
<script src="https://unpkg.com/animated-mermaid-diagrams/dist/animated-mermaid-diagrams.umd.js"></script>
<script>AnimatedMermaidDiagrams.init()</script>
```

`init()` finds all `<pre class="animated-mermaid-diagrams">` elements and renders them in place, similar to Mermaid's `mermaid.initialize({ startOnLoad: true })`. A diagram that fails to parse is restored to its original `<pre>` (with a `console.error`) and does not affect the others.

## Build and Package

- TypeScript source, ships ESM + CJS + a browser global build
- One dependency: [`@dagrejs/dagre`](https://github.com/dagrejs/dagre) (the same layout engine Mermaid uses) — external in the ESM/CJS builds (resolved from `node_modules` like any other dependency), bundled into the browser-global build since it has no module resolution of its own
- Tree-shakeable: `import { sequence }` only pulls in the sequence renderer (ESM/CJS builds only — dagre is still a separate resolved import)
- Browser global: `window.AnimatedMermaidDiagrams` via `dist/animated-mermaid-diagrams.umd.js` (an IIFE build for `<script>` tags; it does not register with AMD/CommonJS loaders)
- Bundle size: ~30KB gzipped for the browser-global build (all diagram types, dagre included) — most of that is dagre itself; the ESM/CJS builds are far smaller since dagre stays an external import there
- Mermaid parser is a lightweight subset parser — does NOT depend on the mermaid package

## Accessibility

- Respects `prefers-reduced-motion: reduce` — skips animations, renders final state immediately
- SVG includes `role="img"` and `aria-label` derived from the diagram content
- All text is selectable
- Body text in both built-in themes meets WCAG AA contrast. Some accent graphics (arrows, node borders) and the dark theme's note text sit slightly below the strictest thresholds — pass a custom `ThemeTokens` object where full AA graphics contrast is required
- `advance: 'click'` diagrams are keyboard-operable out of the box (revealed nodes/the diagram itself are focusable and respond to Enter/Space); set `keyboard: true` on any other diagram to add full arrow-key/Space/Home/End transport control
- Interactive diagrams expose slider semantics (`aria-valuenow` reflects the current step) and keep keyboard focus moving along the walk in click-to-explore (flowchart node) mode

## Browser Support

Modern browsers: Chrome, Firefox, Safari, Edge (last 2 versions). Requires SVG, CSS animations, IntersectionObserver (degrades to immediate play without it), and the Web Animations API (degrades to instant reveal without it).
