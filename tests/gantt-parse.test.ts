import { describe, it, expect } from 'vitest'
import { parseGantt } from '../src/gantt/parse'

describe('parseGantt', () => {
  it('parses the Mermaid docs example shape', () => {
    const c = parseGantt(`gantt
      title A Gantt Diagram
      dateFormat YYYY-MM-DD
      section Section
        A task : a1, 2014-01-01, 30d
        Another task : after a1, 20d
      section Another
        Task in Another : 2014-01-12, 12d`)
    expect(c.type).toBe('gantt')
    expect(c.title).toBe('A Gantt Diagram')
    expect(c.sections).toHaveLength(2)
    expect(c.sections[0].tasks[0]).toEqual({
      name: 'A task',
      id: 'a1',
      start: '2014-01-01',
      durationDays: 30,
    })
    // `after a1` resolves to a1's end: 2014-01-01 + 30d
    expect(c.sections[0].tasks[1]).toEqual({
      name: 'Another task',
      start: '2014-01-31',
      durationDays: 20,
    })
  })

  it('throws on non-gantt input', () => {
    expect(() => parseGantt('pie\n"A" : 1')).toThrow(/gantt/i)
  })

  it('parses status tags, milestone, and weeks', () => {
    const c = parseGantt(`gantt
      dateFormat YYYY-MM-DD
      section S
        Done thing : done, d1, 2024-01-01, 1w
        Active thing : active, 2024-01-08, 3d
        Critical thing : crit, 2024-01-11, 2d
        Ship it : milestone, 2024-01-13, 0d`)
    const tasks = c.sections[0].tasks
    expect(tasks[0]).toMatchObject({ status: 'done', id: 'd1', durationDays: 7 })
    expect(tasks[1]).toMatchObject({ status: 'active' })
    expect(tasks[2]).toMatchObject({ status: 'crit' })
    expect(tasks[3]).toMatchObject({ milestone: true, start: '2024-01-13' })
  })

  it('parses an end date instead of a duration', () => {
    const c = parseGantt('gantt\ndateFormat YYYY-MM-DD\nsection S\nT : 2024-03-01, 2024-03-05')
    expect(c.sections[0].tasks[0]).toEqual({ name: 'T', start: '2024-03-01', durationDays: 4 })
  })

  it('starts a dateless task at the previous task end', () => {
    const c = parseGantt(`gantt
      dateFormat YYYY-MM-DD
      section S
        First : 2024-05-01, 2d
        Second : 3d`)
    expect(c.sections[0].tasks[1]).toEqual({ name: 'Second', start: '2024-05-03', durationDays: 3 })
  })

  it('skips tasks whose start cannot be resolved (unknown after, no prior task)', () => {
    const c = parseGantt(`gantt
      dateFormat YYYY-MM-DD
      section S
        Ghost : after nope, 3d
        Real : 2024-01-01, 1d`)
    expect(c.sections[0].tasks.map((t) => t.name)).toEqual(['Real'])
  })

  it('starts fractional-duration dependents at the next whole day, identically to the renderer', () => {
    const c = parseGantt(`gantt
      dateFormat YYYY-MM-DD
      section S
        A : a1, 2024-01-01, 2.5d
        B : b1, after a1, 3d
        C : after b1, 1d`)
    const tasks = c.sections[0].tasks
    // a ends at day 2.5 → b starts day 3 (ceil); b ends 6 → c starts day 6
    expect(tasks[1].start).toBe('2024-01-04')
    expect(tasks[2].start).toBe('2024-01-07')
  })

  it('handles month boundaries and leap years in day arithmetic', () => {
    const c = parseGantt('gantt\ndateFormat YYYY-MM-DD\nsection S\nA : a, 2024-02-28, 2d\nB : after a, 1d')
    expect(c.sections[0].tasks[1].start).toBe('2024-03-01') // 2024 is a leap year
  })

  it('drops empty sections and puts sectionless tasks in an untitled section', () => {
    const c = parseGantt('gantt\ndateFormat YYYY-MM-DD\nLoose : 2024-01-01, 1d\nsection Empty\nsection Full\nT : 2024-01-02, 1d')
    expect(c.sections.map((s) => s.title)).toEqual([undefined, 'Full'])
  })

  it('ignores comments, axisFormat, excludes, todayMarker, accTitle, and unknown lines', () => {
    const c = parseGantt(`gantt
      %% comment
      dateFormat YYYY-MM-DD
      axisFormat %m-%d
      excludes weekends
      todayMarker off
      accTitle: hello
      section S
      T : 2024-01-01, 1d`)
    expect(c.sections[0].tasks).toHaveLength(1)
  })
})
