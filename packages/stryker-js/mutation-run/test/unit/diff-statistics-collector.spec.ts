import { describe, expect, it } from 'vitest'

import { DiffChanges, DiffStatisticsCollector } from '../../src/mutants/diff-statistics-collector.js'

describe('DiffChanges', () => {
  it('formats added and removed counts as a raw +N -N string with no ANSI escapes', () => {
    const changes = new DiffChanges()
    changes.added = 3
    changes.removed = 1

    const rendered = changes.toString()

    expect(rendered).toBe('+3 -1')
    expect(rendered).not.toContain('\u001b')
  })
})

describe('DiffStatisticsCollector', () => {
  it('createTotalsReport names the changed-file count with no escape sequences', () => {
    const collector = new DiffStatisticsCollector()
    collector.count('calculator.js', 'added', 2)
    collector.count('test.js', 'removed', 1)

    const report = collector.createTotalsReport()

    expect(report).toBe('2 files changed (+2 -1)')
    expect(report).not.toContain('\u001b')
  })
})
