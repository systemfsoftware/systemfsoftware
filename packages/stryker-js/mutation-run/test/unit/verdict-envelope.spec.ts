import { schema } from '@stryker-mutator/api/core'
import { describe, expect, it } from 'vitest'

import {
  buildVerdictEnvelope,
  generateRunId,
  isActionableStatus,
  VERDICT_ENVELOPE_SCHEMA_VERSION,
} from '../../src/verdict-envelope.js'

const RUN_ID = '01HZJ4QW2TB6N7P8K9M3X5Y7ZA'

const mutantOf = (
  id: string,
  status: schema.MutantStatus,
  location: schema.Location,
  overrides: Partial<Pick<schema.MutantResult, 'replacement' | 'killedBy'>> = {},
): schema.MutantResult => ({
  id,
  status,
  mutatorName: 'BinaryOperator',
  location,
  ...overrides,
})

const reportOf = (
  mutants: schema.MutantResult[],
  config: Record<string, unknown> | undefined = {
    jsonReporter: { fileName: 'reports/mutation/mutation.json' },
    requireTestContribution: null,
    disableBail: false,
  },
) => ({
  schemaVersion: '1.0',
  files: {
    'src/subject.ts': {
      language: 'typescript',
      source: 'export const a = 1\n',
      mutants,
    },
  },
  testFiles: {},
  thresholds: { high: 80, low: 60, break: 80 },
  config,
})

const LOCATION_A = { start: { line: 1, column: 0 }, end: { line: 1, column: 4 } }
const LOCATION_B = { start: { line: 2, column: 0 }, end: { line: 2, column: 5 } }
const LOCATION_C = { start: { line: 3, column: 0 }, end: { line: 3, column: 6 } }

describe('generateRunId', () => {
  it('is exactly 26 Crockford base32 characters', () => {
    expect(generateRunId()).toMatch(
      /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/,
    )
  })

  it('differs between calls', () => {
    expect(generateRunId()).not.toBe(generateRunId())
  })
})

describe('buildVerdictEnvelope', () => {
  it('carries every named field', () => {
    const envelope = buildVerdictEnvelope(
      reportOf([
        mutantOf('1', 'Survived', LOCATION_A, { replacement: '-' }),
        mutantOf('2', 'Killed', LOCATION_B, { replacement: '+' }),
        mutantOf('3', 'NoCoverage', LOCATION_C, { replacement: '*' }),
        mutantOf('4', 'Killed', LOCATION_A, { replacement: '-' }),
      ]),
      'machine',
      'tty',
      RUN_ID,
    )

    expect(envelope.schemaVersion).toBe(VERDICT_ENVELOPE_SCHEMA_VERSION)
    expect(envelope.runId).toBe(RUN_ID)
    expect(envelope.mode).toBe('machine')
    expect(envelope.signal).toBe('tty')
    expect(envelope.score).toBe(50)
    expect(envelope.thresholds).toEqual({ high: 80, low: 60, break: 80 })
    expect(envelope.counts).toEqual({
      killed: 2,
      timeout: 0,
      survived: 1,
      noCoverage: 1,
      runtimeErrors: 0,
      compileErrors: 0,
      ignored: 0,
      pending: 0,
    })
    expect(envelope.testContribution).toBeNull()
    expect(envelope.reportFile).toBe('reports/mutation/mutation.json')
    expect(envelope.mutants).toHaveLength(2)
    expect(envelope.mutants.map((mutant) => mutant.id)).toEqual(['1', '3'])
  })

  it('carries the full survivor re-run key for survivor, timeout and no-coverage mutants', () => {
    const envelope = buildVerdictEnvelope(
      reportOf([
        mutantOf('1', 'Survived', LOCATION_A, { replacement: '-' }),
        mutantOf('2', 'Timeout', LOCATION_B, { replacement: '+' }),
        mutantOf('3', 'NoCoverage', LOCATION_C, { replacement: '*' }),
      ]),
      'machine',
      'agent',
      RUN_ID,
    )

    expect(envelope.mutants).toEqual([
      {
        id: '1',
        file: 'src/subject.ts',
        location: LOCATION_A,
        mutator: 'BinaryOperator',
        replacement: '-',
        status: 'Survived',
      },
      {
        id: '2',
        file: 'src/subject.ts',
        location: LOCATION_B,
        mutator: 'BinaryOperator',
        replacement: '+',
        status: 'Timeout',
      },
      {
        id: '3',
        file: 'src/subject.ts',
        location: LOCATION_C,
        mutator: 'BinaryOperator',
        replacement: '*',
        status: 'NoCoverage',
      },
    ])
  })

  it('reports killed and compile-error mutants in counts only, absent from mutants', () => {
    const envelope = buildVerdictEnvelope(
      reportOf([
        mutantOf('1', 'Killed', LOCATION_A),
        mutantOf('2', 'CompileError', LOCATION_B),
        mutantOf('3', 'Survived', LOCATION_C, { replacement: '-' }),
      ]),
      'machine',
      'tty',
      RUN_ID,
    )

    expect(envelope.mutants).toEqual([
      {
        id: '3',
        file: 'src/subject.ts',
        location: LOCATION_C,
        mutator: 'BinaryOperator',
        replacement: '-',
        status: 'Survived',
      },
    ])
    expect(envelope.counts.killed).toBe(1)
    expect(envelope.counts.compileErrors).toBe(1)
    expect(envelope.counts.survived).toBe(1)
    const countedTotal = Object.values(envelope.counts).reduce(
      (sum, count) => sum + count,
      0,
    )
    expect(countedTotal).toBe(3)
  })

  it('yields an empty mutants array, never a missing key, when every mutant is killed', () => {
    const envelope = buildVerdictEnvelope(
      reportOf([
        mutantOf('1', 'Killed', LOCATION_A),
        mutantOf('2', 'Killed', LOCATION_B),
        mutantOf('3', 'Killed', LOCATION_C),
      ]),
      'machine',
      'tty',
      RUN_ID,
    )

    expect(envelope.mutants).toEqual([])
    expect(envelope.counts.killed).toBe(3)
  })

  it('uses the report file name from the embedded config', () => {
    const envelope = buildVerdictEnvelope(
      reportOf([mutantOf('1', 'Killed', LOCATION_A)], {
        jsonReporter: { fileName: 'custom/report.json' },
      }),
      'machine',
      'flag',
      RUN_ID,
    )
    expect(envelope.reportFile).toBe('custom/report.json')
  })

  it('reports a null score and null report file for a run with zero mutants', () => {
    const envelope = buildVerdictEnvelope(
      reportOf([]),
      'machine',
      'tty',
      RUN_ID,
    )
    expect(envelope.score).toBeNull()
    expect(envelope.reportFile).toBeNull()
    expect(envelope.mutants).toEqual([])
    expect(envelope.counts.killed).toBe(0)
    expect(envelope.counts.survived).toBe(0)
  })

  it('reports a null score when no valid mutant exists to score', () => {
    const envelope = buildVerdictEnvelope(
      reportOf([mutantOf('1', 'CompileError', LOCATION_A)]),
      'machine',
      'tty',
      RUN_ID,
    )
    expect(envelope.score).toBeNull()
    expect(envelope.counts.compileErrors).toBe(1)
  })

  it('carries the test-contribution verdict when the check is configured', () => {
    const report = {
      ...reportOf([mutantOf('1', 'Killed', LOCATION_A, { killedBy: ['t1'] })]),
      testFiles: {
        'src/subject.spec.ts': {
          tests: [{ id: 't1', name: 'kills the mutant' }],
        },
      },
      config: {
        jsonReporter: { fileName: 'reports/mutation/mutation.json' },
        requireTestContribution: ['.spec.ts'],
        disableBail: true,
      },
    }
    const envelope = buildVerdictEnvelope(report, 'machine', 'env', RUN_ID)
    expect(envelope.testContribution).toEqual({
      failed: false,
      message: 'Every test file matching .spec.ts kills a mutant nothing else kills (every killing test was recorded).',
    })
  })

  it('carries a null test-contribution verdict when the check is off', () => {
    const envelope = buildVerdictEnvelope(
      reportOf([mutantOf('1', 'Survived', LOCATION_A)], {
        jsonReporter: { fileName: 'reports/mutation/mutation.json' },
        requireTestContribution: null,
        disableBail: false,
      }),
      'machine',
      'tty',
      RUN_ID,
    )
    expect(envelope.testContribution).toBeNull()
  })
})

describe('verdict envelope size bound (R20)', () => {
  it('keeps an all-killed 2164-mutant report under the 64 KB scanner limit', () => {
    const mutants: schema.MutantResult[] = []
    for (let index = 0; index < 2164; index++) {
      mutants.push(mutantOf(`m${index}`, 'Killed', LOCATION_A))
    }
    const line = JSON.stringify(
      buildVerdictEnvelope(reportOf(mutants), 'machine', 'tty', RUN_ID),
    )
    expect(Buffer.byteLength(line)).toBeLessThan(64 * 1024)
  })
})

describe('isActionableStatus', () => {
  it('accepts Survived, NoCoverage, Timeout and RuntimeError', () => {
    expect(isActionableStatus('Survived')).toBe(true)
    expect(isActionableStatus('NoCoverage')).toBe(true)
    expect(isActionableStatus('Timeout')).toBe(true)
    expect(isActionableStatus('RuntimeError')).toBe(true)
  })

  it('rejects every non-actionable MutantStatus', () => {
    expect(isActionableStatus('Killed')).toBe(false)
    expect(isActionableStatus('CompileError')).toBe(false)
    expect(isActionableStatus('Ignored')).toBe(false)
    expect(isActionableStatus('Pending')).toBe(false)
  })
})
