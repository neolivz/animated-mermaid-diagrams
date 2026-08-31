import type { DiagramGroup, StateConfig, StateNode, StateTransition } from '../types'

// Synthetic end-state id. A user-authored state literally named '__end' will collide (accepted v1 limitation).
const END_ID = '__end'
const TRANSITION = /^(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)(?:\s*:\s*(.+))?$/
const DESCRIBED = /^state\s+"([^"]+)"\s+as\s+(\w+)\s*$/
const COMPOSITE_OPEN = /^state\s+(\w+)\s*\{$/

export function parseState(text: string): StateConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  if (!/^stateDiagram(-v2)?\b/.test(lines[0] ?? '')) throw new Error('Not a state diagram')

  const states: StateNode[] = []
  const transitions: StateTransition[] = []
  const groups: DiagramGroup[] = []
  const groupStack: string[] = []
  let initial: string | undefined

  const ensure = (id: string): void => {
    if (!states.some((s) => s.id === id)) {
      const group = groupStack[groupStack.length - 1]
      states.push({ id, text: id, ...(group ? { group } : {}) })
    }
  }
  const ensureEnd = (): string => {
    if (!states.some((s) => s.id === END_ID)) states.push({ id: END_ID, text: '', type: 'end' })
    return END_ID
  }

  for (const line of lines.slice(1)) {
    const described = line.match(DESCRIBED)
    if (described) {
      const existing = states.find((s) => s.id === described[2])
      if (!existing) {
        const group = groupStack[groupStack.length - 1]
        states.push({ id: described[2], text: described[1], ...(group ? { group } : {}) })
      } else if (existing.text === existing.id) {
        // auto-placeholdered by ensure(); adopt the real description
        existing.text = described[1]
      }
      continue
    }
    const composite = line.match(COMPOSITE_OPEN)
    if (composite) {
      // `state Name {` opens a GROUP, not a state: states ensured while the
      // block is open are tagged with this group id (see ensure()/described
      // above); the group itself is re-targeted to its first member (or
      // degraded to a regular state if empty) in the post-parse pass below.
      const id = composite[1]
      const parent = groupStack[groupStack.length - 1]
      groups.push({ id, title: id, ...(parent ? { parent } : {}) })
      groupStack.push(id)
      continue
    }
    if (line === '}') {
      groupStack.pop()
      continue
    }
    const tr = line.match(TRANSITION)
    if (tr) {
      const [, rawFrom, rawTo, trLabel] = tr
      if (rawFrom === '[*]' && rawTo === '[*]') continue
      if (rawFrom === '[*]') {
        ensure(rawTo)
        if (initial === undefined) initial = rawTo
        continue
      }
      ensure(rawFrom)
      const to = rawTo === '[*]' ? ensureEnd() : (ensure(rawTo), rawTo)
      const transition: StateTransition = { from: rawFrom, to }
      if (trLabel) transition.label = trLabel.trim()
      transitions.push(transition)
      continue
    }
    // Anything else is unsupported v1 syntax — silently ignored per spec.
  }

  // Post-parse: group ids are never renderable states. Any state entry whose
  // id matches a group id is a phantom created by ensure()/DESCRIBED when the
  // group's own name was used as a transition endpoint or description target
  // (e.g. `[*] --> Active` naming a composite) — strip those before
  // computing group membership.
  const groupIds = new Set(groups.map((g) => g.id))
  let cleanStates = groupIds.size > 0 ? states.filter((s) => !groupIds.has(s.id)) : states

  // Membership is resolved through the composite nesting tree: a state
  // belongs to group G if its own (innermost) enclosing group is G, or a
  // descendant of G. "First member" is the earliest such state in document
  // order (states are already recorded in that order by the loop above).
  const declaredParent = new Map<string, string | undefined>()
  for (const g of groups) declaredParent.set(g.id, g.parent)
  const isDescendant = (groupId: string, ancestorId: string): boolean => {
    const seen = new Set<string>()
    let cur: string | undefined = groupId
    while (cur !== undefined) {
      if (cur === ancestorId) return true
      if (seen.has(cur)) return false // defensive: guard against a parent cycle
      seen.add(cur)
      cur = declaredParent.get(cur)
    }
    return false
  }
  const firstMemberOf = (groupId: string): string | undefined =>
    cleanStates.find((s) => s.group !== undefined && isDescendant(s.group, groupId))?.id

  // A group with no members anywhere in its subtree degrades to a regular
  // state — preserving the old flattening behavior for `state X {}`.
  let finalGroups = groups
  if (groupIds.size > 0) {
    const emptyGroups = groups.filter((g) => firstMemberOf(g.id) === undefined)
    if (emptyGroups.length > 0) {
      const emptyIds = new Set(emptyGroups.map((g) => g.id))
      finalGroups = groups.filter((g) => !emptyIds.has(g.id))
      for (const g of emptyGroups) {
        const group = g.parent && !emptyIds.has(g.parent) ? g.parent : undefined
        cleanStates = [...cleanStates, { id: g.id, text: g.title, ...(group ? { group } : {}) }]
      }
    }
  }

  // Re-target: any transition endpoint or `initial` naming a group id
  // re-points to that group's first member (computed above); ids that
  // aren't group ids (including now-degraded ones, which are real states
  // again) pass through unchanged.
  const retargetCache = new Map<string, string>()
  const retarget = (id: string): string => {
    if (!groupIds.has(id)) return id
    if (!retargetCache.has(id)) retargetCache.set(id, firstMemberOf(id) ?? id)
    return retargetCache.get(id)!
  }
  const finalTransitions = transitions.map((tr) => ({
    ...tr,
    from: retarget(tr.from),
    to: retarget(tr.to),
  }))
  const finalInitial = initial === undefined ? undefined : retarget(initial)

  const config: StateConfig = {
    type: 'state',
    states: cleanStates,
    transitions: finalTransitions,
    ...(finalGroups.length > 0 ? { groups: finalGroups } : {}),
  }
  // Only set `initial` when the source explicitly declared an entry point
  // ([*] --> X). Without one, Mermaid draws no start dot, so we shouldn't
  // synthesize an entry either — the renderer picks its own BFS starting
  // point (first in-flow state) when this is left undefined.
  config.initial = finalInitial
  return config
}
