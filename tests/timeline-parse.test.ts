import { describe, it, expect } from 'vitest'
import { parseTimeline } from '../src/timeline/parse'

describe('parseTimeline', () => {
  it('parses the Mermaid docs example', () => {
    const c = parseTimeline(`timeline
      title History of Social Media
      2002 : LinkedIn
      2004 : Facebook
           : Google
      2005 : YouTube
      2006 : Twitter`)
    expect(c.type).toBe('timeline')
    expect(c.title).toBe('History of Social Media')
    expect(c.sections).toHaveLength(1)
    expect(c.sections[0].title).toBeUndefined()
    expect(c.sections[0].periods).toEqual([
      { label: '2002', events: ['LinkedIn'] },
      { label: '2004', events: ['Facebook', 'Google'] },
      { label: '2005', events: ['YouTube'] },
      { label: '2006', events: ['Twitter'] },
    ])
  })

  it('throws on non-timeline input', () => {
    expect(() => parseTimeline('journey\nA: 4')).toThrow(/timeline/i)
  })

  it('splits multiple events on one line', () => {
    const c = parseTimeline('timeline\n2004 : Facebook : Google')
    expect(c.sections[0].periods[0].events).toEqual(['Facebook', 'Google'])
  })

  it('groups periods under sections', () => {
    const c = parseTimeline(`timeline
      section 2000s
      2002 : LinkedIn
      section 2010s
      2011 : Snapchat : Twitch`)
    expect(c.sections.map((s) => s.title)).toEqual(['2000s', '2010s'])
    expect(c.sections[1].periods[0].events).toEqual(['Snapchat', 'Twitch'])
  })

  it('accepts a period with no events', () => {
    const c = parseTimeline('timeline\n2020\n2021 : Vaccines')
    expect(c.sections[0].periods[0]).toEqual({ label: '2020', events: [] })
  })

  it('ignores a leading continuation line with no period to attach to', () => {
    const c = parseTimeline('timeline\n: orphan event\n2020 : Real')
    expect(c.sections[0].periods).toEqual([{ label: '2020', events: ['Real'] }])
  })

  it('drops sections that end up with no periods', () => {
    const c = parseTimeline('timeline\nsection Empty\nsection Full\n2020 : A')
    expect(c.sections).toHaveLength(1)
    expect(c.sections[0].title).toBe('Full')
  })

  it('ignores comment lines and blank lines', () => {
    const c = parseTimeline('timeline\n%% note\n\n2020 : A')
    expect(c.sections[0].periods).toHaveLength(1)
  })

  it('ignores bare keywords and accTitle/accDescr directives instead of turning them into periods', () => {
    const c = parseTimeline('timeline\ntitle\nsection\naccTitle: my title\naccDescr: d\n2020 : A')
    expect(c.sections[0].periods).toEqual([{ label: '2020', events: ['A'] }])
  })
})
