# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0]

### Added

- Uniform `highlight` API: `boolean | 'red' | 'green'` on sequence steps, flowchart nodes, and
  state nodes (previously sequence and flowchart accepted `boolean` only). `true`/`'green'` use
  the `highlight` theme token, `'red'` uses `highlightRed`.
- Partial theme merging: `theme` accepts a `Partial<ThemeTokens>` object — unspecified tokens fall
  back to the auto-resolved built-in (light/dark) theme instead of requiring every token to be
  supplied. A full `ThemeTokens` object is still used exactly as given.

## [0.1.1]

### Changed

- npm package homepage now points at the live demo page instead of the repository root.

## [0.1.0]

Initial release.

### Added

- Three animated diagram types: sequence, flowchart, and state diagrams, from Mermaid syntax or a
  JS config.
- dagre-based layout engine for flowchart and state diagrams (crossing minimization, multi-tier
  edge routing, reverse-pair separation).
- Interactive playback: `advance: 'click'` (step-through for sequence/state, click-to-expand graph
  walking for flowcharts) and `keyboard: true` (arrow-key/Space/Home/End transport control), both
  with full keyboard accessibility (focus management, ARIA slider/button semantics).
- Extended Mermaid syntax support: sequence `alt`/`opt`/`loop`/`par` frames and
  `activate`/`deactivate` bars, flowchart `subgraph` containers, state composite states.
- Light/dark built-in themes with `prefers-color-scheme` auto-detection, `prefers-reduced-motion`
  support, and a zero-runtime-dependency-except-dagre ESM/CJS/browser-global build.
