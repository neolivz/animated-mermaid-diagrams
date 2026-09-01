import type { GitGraphConfig, GitOperation } from '../types'

const COMMIT = /^commit\b(.*)$/
const BRANCH = /^branch\s+(\S+)/
const CHECKOUT = /^(?:checkout|switch)\s+(\S+)$/
const MERGE = /^merge\s+(\S+)(.*)$/
const PROP = /(id|tag|type)\s*:\s*(?:"([^"]*)"|(\S+))/g

function readProps(raw: string): { id?: string; tag?: string; highlight?: boolean } {
  const out: { id?: string; tag?: string; highlight?: boolean } = {}
  for (const m of raw.matchAll(PROP)) {
    const value = m[2] ?? m[3]
    if (m[1] === 'id') out.id = value
    else if (m[1] === 'tag') out.tag = value
    else if (m[1] === 'type' && value === 'HIGHLIGHT') out.highlight = true
  }
  return out
}

export function parseGitGraph(text: string): GitGraphConfig {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'))
  if (!/^gitGraph\b/.test(lines[0] ?? '')) throw new Error('Not a gitGraph')

  const operations: GitOperation[] = []
  for (const line of lines.slice(1)) {
    const commit = line.match(COMMIT)
    if (commit) {
      const props = readProps(commit[1])
      operations.push({
        op: 'commit',
        ...(props.id !== undefined ? { id: props.id } : {}),
        ...(props.tag !== undefined ? { tag: props.tag } : {}),
        ...(props.highlight ? { highlight: true } : {}),
      })
      continue
    }
    const branch = line.match(BRANCH)
    if (branch) {
      operations.push({ op: 'branch', name: branch[1] })
      continue
    }
    const checkout = line.match(CHECKOUT)
    if (checkout) {
      operations.push({ op: 'checkout', name: checkout[1] })
      continue
    }
    const merge = line.match(MERGE)
    if (merge) {
      const props = readProps(merge[2])
      operations.push({
        op: 'merge',
        name: merge[1],
        ...(props.tag !== undefined ? { tag: props.tag } : {}),
        ...(props.id !== undefined ? { id: props.id } : {}),
      })
      continue
    }
    // cherry-pick and anything else unsupported — ignored.
  }
  return { type: 'gitgraph', operations }
}
