import { PlanKind, schema } from '@stryker-mutator/api/core'
import type { MutantResult } from '@stryker-mutator/api/core'
import type { MutationTestingPlanReadyEvent } from '@stryker-mutator/api/report'
import { calculateMutationTestMetrics } from 'mutation-testing-metrics'
import type { MutationTestMetricsResult } from 'mutation-testing-metrics'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

import { ProgressStreamReporter } from '../../src/reporters/progress-stream-reporter.js'

const location: schema.Location = {
  start: { line: 1, column: 0 },
  end: { line: 1, column: 4 },
}

const mutantResult = (overrides: Partial<MutantResult> = {}): MutantResult => ({
  id: '1',
  fileName: 'src/foo.ts',
  location,
  mutatorName: 'StringLiteral',
  replacement: '"x"',
  status: 'Killed',
  ...overrides,
})

const planEvent = (count: number): MutationTestingPlanReadyEvent => ({
  mutantPlans: Array.from({ length: count }, (_, index) => ({
    plan: PlanKind.EarlyResult,
    mutant: {
      id: String(index),
      fileName: 'src/foo.ts',
      location,
      mutatorName: 'StringLiteral',
      replacement: '"x"',
      status: 'NoCoverage',
    },
  })),
})

const report: schema.MutationTestResult = {
  schemaVersion: '1.0',
  thresholds: { high: 80, low: 60 },
  files: {
    'src/foo.ts': {
      language: 'ts',
      source: 'const x = "a"',
      mutants: [
        mutantResult({ id: '1', status: 'Killed' }),
        mutantResult({ id: '2', status: 'Survived' }),
      ],
    },
  },
}

const metrics = (): MutationTestMetricsResult => calculateMutationTestMetrics(report)

const captureStderr = (): MockInstance => {
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  return write
}

const writtenLines = (write: MockInstance): string[] => write.mock.calls.map((call) => String(call[0]))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProgressStreamReporter', () => {
  it('streams one self-contained NDJSON line per event, plan before mutants, in machine mode', () => {
    const write = captureStderr()
    const reporter = new ProgressStreamReporter({
      runId: 'run-1',
      mode: 'machine',
      reportFile: 'reports/mutation/mutation.json',
    })

    reporter.onMutationTestingPlanReady(planEvent(2))
    reporter.onMutantTested(mutantResult({ id: '1', status: 'Killed' }))
    reporter.onMutantTested(mutantResult({ id: '2', status: 'Survived' }))
    reporter.onMutationTestReportReady(report, metrics())

    const lines = writtenLines(write)
    expect(lines).toHaveLength(4)
    // Every line parses on its own: a line-by-line consumer never buffers.
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { kind: 'plan', total: 2, runId: 'run-1' },
      {
        kind: 'mutant',
        id: '1',
        status: 'Killed',
        file: 'src/foo.ts',
        location,
        completed: 1,
        total: 2,
      },
      {
        kind: 'mutant',
        id: '2',
        status: 'Survived',
        file: 'src/foo.ts',
        location,
        completed: 2,
        total: 2,
      },
      { kind: 'done', score: 50, reportFile: 'reports/mutation/mutation.json' },
    ])
  })

  it('writes nothing in human mode', () => {
    const write = captureStderr()
    const reporter = new ProgressStreamReporter({ runId: 'run-1', mode: 'human' })

    reporter.onMutationTestingPlanReady(planEvent(2))
    reporter.onMutantTested(mutantResult({ id: '1', status: 'Killed' }))
    reporter.onMutationTestReportReady(report, metrics())

    expect(write).not.toHaveBeenCalled()
  })

  it('keeps the progress stream and a stderr error envelope individually parseable', () => {
    const write = captureStderr()
    const reporter = new ProgressStreamReporter({
      runId: 'run-1',
      mode: 'machine',
      reportFile: 'reports/mutation/mutation.json',
    })

    reporter.onMutationTestingPlanReady(planEvent(1))
    reporter.onMutantTested(mutantResult({ id: '1', status: 'Killed' }))
    // The error envelope (U6) lands on the same stderr mid-stream as its own
    // JSON document, written the same way — never through Console.
    process.stderr.write(
      `${JSON.stringify({ error: 'ConfigError', code: 2, remediation: 'Fix the config and rerun' })}\n`,
    )
    reporter.onMutationTestReportReady(report, metrics())

    const lines = writtenLines(write)
    expect(lines).toHaveLength(4)
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { kind: 'plan', total: 1, runId: 'run-1' },
      {
        kind: 'mutant',
        id: '1',
        status: 'Killed',
        file: 'src/foo.ts',
        location,
        completed: 1,
        total: 1,
      },
      { error: 'ConfigError', code: 2, remediation: 'Fix the config and rerun' },
      { kind: 'done', score: 50, reportFile: 'reports/mutation/mutation.json' },
    ])
  })

  it('emits a null reportFile when none is provided', () => {
    const write = captureStderr()
    const reporter = new ProgressStreamReporter({ runId: 'run-1', mode: 'machine' })

    reporter.onMutationTestingPlanReady(planEvent(0))
    reporter.onMutationTestReportReady(report, metrics())

    expect(writtenLines(write).map((line) => JSON.parse(line))).toEqual([
      { kind: 'plan', total: 0, runId: 'run-1' },
      { kind: 'done', score: 50, reportFile: null },
    ])
  })
})
