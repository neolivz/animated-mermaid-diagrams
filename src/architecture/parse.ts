import type { ArchEdge, ArchIcon, ArchSide, ArchitectureConfig, ArchGroup, ArchService } from '../types'

const ICONS = new Set(['cloud', 'database', 'disk', 'server', 'internet'])
const GROUP = /^group\s+(\w+)(?:\(([^)]*)\))?(?:\[([^\]]*)\])?/
const SERVICE = /^service\s+(\w+)(?:\(([^)]*)\))?(?:\[([^\]]*)\])?(?:\s+in\s+(\w+))?/
const EDGE = /^(\w+)(?::([LRTB]))?\s*(?:<)?--(?:>)?\s*(?:([LRTB]):)?(\w+)$/

function iconOf(raw: string | undefined): ArchIcon | undefined {
  return raw !== undefined && ICONS.has(raw) ? (raw as ArchIcon) : undefined
}

export function parseArchitecture(text: string): ArchitectureConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  if (!/^architecture(-beta)?\b/.test(lines[0] ?? '')) throw new Error('Not an architecture diagram')

  const groups: ArchGroup[] = []
  const services: ArchService[] = []
  const edges: ArchEdge[] = []

  for (const line of lines.slice(1)) {
    const g = line.match(GROUP)
    if (g) {
      const icon = iconOf(g[2])
      groups.push({
        id: g[1],
        ...(icon !== undefined ? { icon } : {}),
        ...(g[3] !== undefined ? { title: g[3] } : {}),
      })
      // `in parent` on groups (nesting) is unsupported — ignored.
      continue
    }
    const s = line.match(SERVICE)
    if (s) {
      const icon = iconOf(s[2])
      services.push({
        id: s[1],
        ...(icon !== undefined ? { icon } : {}),
        ...(s[3] !== undefined ? { label: s[3] } : {}),
        ...(s[4] !== undefined ? { group: s[4] } : {}),
      })
      continue
    }
    const e = line.match(EDGE)
    if (e) {
      edges.push({
        from: e[1],
        to: e[4],
        ...(e[2] !== undefined ? { fromSide: e[2] as ArchSide } : {}),
        ...(e[3] !== undefined ? { toSide: e[3] as ArchSide } : {}),
      })
      continue
    }
    // junction and anything else unsupported — ignored.
  }

  return {
    type: 'architecture',
    ...(groups.length > 0 ? { groups } : {}),
    services,
    edges,
  }
}
