import { describe, it, expect } from 'vitest'
import { parseArchitecture } from '../src/architecture/parse'

describe('parseArchitecture', () => {
  it('parses the Mermaid docs example shape', () => {
    const c = parseArchitecture(`architecture-beta
      group api(cloud)[API]

      service db(database)[Database] in api
      service disk1(disk)[Storage] in api
      service server(server)[Server] in api

      db:L -- R:server
      disk1:T -- B:db`)
    expect(c.type).toBe('architecture')
    expect(c.groups).toEqual([{ id: 'api', icon: 'cloud', title: 'API' }])
    expect(c.services).toHaveLength(3)
    expect(c.services[0]).toEqual({ id: 'db', icon: 'database', label: 'Database', group: 'api' })
    expect(c.edges).toEqual([
      { from: 'db', to: 'server', fromSide: 'L', toSide: 'R' },
      { from: 'disk1', to: 'db', fromSide: 'T', toSide: 'B' },
    ])
  })

  it('accepts the bare architecture header', () => {
    expect(parseArchitecture('architecture\nservice s(server)[S]').services).toHaveLength(1)
  })

  it('throws on non-architecture input', () => {
    expect(() => parseArchitecture('gitGraph\ncommit')).toThrow(/architecture/i)
  })

  it('parses sideless and arrow edges as plain edges', () => {
    const c = parseArchitecture('architecture-beta\nservice a(server)[A]\nservice b(disk)[B]\na -- b\na --> b')
    expect(c.edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'a', to: 'b' },
    ])
  })

  it('handles services without icon or group and unknown icons as undefined icon', () => {
    const c = parseArchitecture('architecture-beta\nservice a[Just label]\nservice b(rocket)[B]')
    expect(c.services[0]).toEqual({ id: 'a', label: 'Just label' })
    expect(c.services[1].icon).toBeUndefined()
  })

  it('ignores junctions, comments, and unknown lines', () => {
    const c = parseArchitecture('architecture-beta\n%% note\njunction j1\nnonsense\nservice a(db)[A]')
    expect(c.services).toHaveLength(1)
  })
})
