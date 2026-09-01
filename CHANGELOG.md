# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.6.0]

The roadmap's final milestone: all thirteen core Mermaid diagram types are now supported.

### Added

- Mindmaps (`mindmap`): indentation-parsed hierarchy, all Mermaid node shapes, two-sided tree
  layout with per-branch palette colors, branch-by-branch reveal. New exports: `mindmap`,
  `parseMindmap`, `MindmapConfig`/`MindmapNode`/`MindmapShape`.
- Sankey diagrams (`sankey-beta`): CSV link parsing with quoted fields, longest-path ranking,
  throughput-proportional node sizing, value-proportional ribbons fading in one per step.
  New exports: `sankey`, `parseSankey`, `SankeyConfig`/`SankeyLink`.
- Git graphs (`gitGraph`): commit/branch/checkout/merge replay onto colored branch lanes,
  fork and merge curves, commit ids, tag chips, `type: HIGHLIGHT`. New exports: `gitGraph`,
  `parseGitGraph`, `GitGraphConfig`/`GitOperation`.
- Architecture diagrams (`architecture-beta`): groups with service grids, icon glyphs (cloud,
  database, disk, server, internet), side-anchored connections (`a:R -- L:b`). New exports:
  `architecture`, `parseArchitecture`, `ArchitectureConfig`/`ArchGroup`/`ArchService`/`ArchEdge`/
  `ArchIcon`/`ArchSide`.
- All four support `highlight`, every trigger mode, and keyboard/click step-through.

### Changed

- `mindmap`, `sankey`, `gitGraph`, and `architecture` headers are no longer "unsupported
  diagram type" errors.
- The categorical palette moved to a shared module used by pie, mindmap, sankey, and git graph.
- CI browser-bundle size budget raised to 52 KB gzipped (bundle is now ~45 KB with all
  thirteen types).

## [0.5.0]

### Added

- Pie charts (`pie` Mermaid syntax or a `PieConfig`): slices from a fixed categorical palette
  drawn clockwise in document order, in-slice percentages, legend with optional values
  (`showData`), one animation step per slice. New exports: `pie`, `parsePie`, and the
  `PieConfig`/`PieSlice` types.
- Gantt charts (`gantt` Mermaid syntax or a `GanttConfig`): date-axis timeline with adaptive
  ticks, section header bands, bars that draw left-to-right, `after` dependency resolution,
  milestones as diamonds, `done`/`active`/`crit` status colors. New exports: `gantt`,
  `parseGantt`, and the `GanttConfig`/`GanttSection`/`GanttTask`/`GanttStatus` types.
- Both support `highlight`, all trigger modes, and keyboard/click step-through via the shared
  controller.

### Changed

- `pie` and `gantt` headers are no longer "unsupported diagram type" errors in `detectType`.
- CI browser-bundle size budget raised to 44 KB gzipped (bundle is now ~40 KB with nine diagram
  types).

## [0.4.0]

### Added

- Class diagrams (`classDiagram` Mermaid syntax or a `ClassConfig`): compartment boxes with
  attributes/methods/annotations, UML end markers (hollow triangle, filled/hollow diamond,
  arrowhead), quoted cardinalities, generics, `direction`, dagre layout ranking parents above
  children. New exports: `classDiagram`, `parseClass`, and the
  `ClassConfig`/`ClassNode`/`ClassRelation`/`ClassRelationType` types.
- ER diagrams (`erDiagram` Mermaid syntax or an `ErConfig`): entity tables with typed attribute
  rows and PK/FK/UK badges, crow's-foot cardinality markers at both ends, identifying (solid) vs
  non-identifying (dashed) relationships, entity aliases. New exports: `erDiagram`, `parseEr`, and
  the `ErConfig`/`ErEntity`/`ErAttribute`/`ErRelationship`/`ErCardinality`/`ErKey` types.
- Both new types support `highlight`, all trigger modes, and keyboard/click step-through via the
  shared controller.

### Changed

- CI browser-bundle size budget raised to 40 KB gzipped (bundle is now ~37 KB with seven diagram
  types).

## [0.3.0]

### Added

- User journey diagrams (`journey` Mermaid syntax or a `JourneyConfig`): scored tasks 1–7 with
  mood faces, section bands, actor lines, and one animation step per task. New exports: `journey`,
  `parseJourney`, and the `JourneyConfig`/`JourneySection`/`JourneyTask` types.
- Timeline diagrams (`timeline` Mermaid syntax or a `TimelineConfig`): periods on a spine with
  stacked event boxes, section bands, `: continuation` lines, and one animation step per period.
  New exports: `timeline`, `parseTimeline`, and the
  `TimelineConfig`/`TimelineSection`/`TimelinePeriod` types.
- Both new types support the uniform `highlight` API, all trigger modes, click-to-step
  (`advance: 'click'`), and keyboard transport, via the shared controller.
- `detectType` recognizes `journey` and `timeline` headers; `render()` infers the two config
  shapes from the first section's contents (tasks vs periods) when `type` is omitted.

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
