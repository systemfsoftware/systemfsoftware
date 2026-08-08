import path from 'path'

import { FileDescriptions, Mutant, schema } from '@stryker-mutator/api/core'
import { Logger } from '@stryker-mutator/api/logging'
import { TestResult, TestStatus } from '@stryker-mutator/api/test-runner'
import chalk from 'chalk'
import { describe, expect, it } from 'vitest'

import { createDefaultOptions } from '../../src/config/options-validator.js'
import { IncrementalDiffer } from '../../src/mutants/incremental-differ.js'
import { TestCoverage } from '../../src/mutants/test-coverage.js'

const SOURCE_FILE = 'src/thing.ts'
const SOURCE = 'export const pattern = /^[0-9a-f]*$/\n'
const TEST_FILE = 'src/thing.test.ts'
const TEST_SOURCE = "it('works', () => {})\n"

const silentLogger: Logger = {
  isTraceEnabled: () => false,
  isDebugEnabled: () => false,
  isInfoEnabled: () => false,
  isWarnEnabled: () => false,
  isErrorEnabled: () => false,
  isFatalEnabled: () => false,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
}

const fileDescriptions: FileDescriptions = { [SOURCE_FILE]: { mutate: true } }

const currentMutant: Mutant = {
  id: '1',
  fileName: path.resolve(SOURCE_FILE),
  mutatorName: 'Regex',
  replacement: '/[a-f]/',
  location: { start: { line: 1, column: 22 }, end: { line: 1, column: 36 } },
}

const passingTest: TestResult = {
  id: 'test-1',
  name: 'works',
  fileName: path.resolve(TEST_FILE),
  status: TestStatus.Success,
  timeSpentMs: 1,
}

function incrementalReport(mutant: schema.MutantResult): schema.MutationTestResult {
  return {
    schemaVersion: '1.0',
    thresholds: { high: 100, low: 100 },
    files: {
      [SOURCE_FILE]: { language: 'typescript', source: SOURCE, mutants: [mutant] },
    },
    testFiles: {
      [TEST_FILE]: {
        source: TEST_SOURCE,
        tests: [{ id: 'test-1', name: 'works' }],
      },
    },
  }
}

const survivedMutantResult: schema.MutantResult = {
  id: '1',
  mutatorName: 'Regex',
  replacement: '/[a-f]/',
  location: { start: { line: 1, column: 22 }, end: { line: 1, column: 36 } },
  status: 'Survived',
}

const currentFiles = new Map([
  [SOURCE_FILE, SOURCE],
  [TEST_FILE, TEST_SOURCE],
])

function diffWith(testCoverage: TestCoverage, mutantResult: schema.MutantResult): readonly Mutant[] {
  const differ = new IncrementalDiffer(silentLogger, createDefaultOptions(), fileDescriptions)
  return differ.diff([currentMutant], testCoverage, incrementalReport(mutantResult), currentFiles)
}

describe('IncrementalDiffer static-mutant reuse', () => {
  it('re-runs a survived static mutant instead of reusing the stale verdict', () => {
    const staticOnly = new TestCoverage(
      new Map(),
      new Map([[passingTest.id, passingTest]]),
      { '1': 1 },
      new Map(),
    )

    const [reused] = diffWith(staticOnly, { ...survivedMutantResult, static: true, coveredBy: [] })

    expect(reused?.status).toBeUndefined()
  })

  it('still reuses a survived mutant that has unchanged per-test coverage', () => {
    const perTest = new TestCoverage(
      new Map([['1', new Set([passingTest])]]),
      new Map([[passingTest.id, passingTest]]),
      {},
      new Map(),
    )

    const [reused] = diffWith(perTest, { ...survivedMutantResult, coveredBy: ['test-1'] })

    expect(reused?.status).toBe('Survived')
  })

  it('logs the reuse count and file-change totals as plain text with no ANSI escapes', () => {
    const infoMessages: string[] = []
    const infoLogger: Logger = {
      ...silentLogger,
      isInfoEnabled: () => true,
      info: (input: string) => infoMessages.push(input),
    }
    const perTest = new TestCoverage(
      new Map([['1', new Set([passingTest])]]),
      new Map([[passingTest.id, passingTest]]),
      {},
      new Map(),
    )
    const differ = new IncrementalDiffer(infoLogger, createDefaultOptions(), fileDescriptions)

    const previousChalkLevel = chalk.level
    chalk.level = 1
    try {
      differ.diff(
        [currentMutant],
        perTest,
        incrementalReport({ ...survivedMutantResult, coveredBy: ['test-1'] }),
        currentFiles,
      )
    } finally {
      chalk.level = previousChalkLevel
    }

    const logOutput = infoMessages.join('\n')
    expect(logOutput).toContain('Incremental report:')
    expect(logOutput).toContain('0 files changed (+0 -0)')
    expect(logOutput).toContain('1 of 1 mutant result(s) are reused.')
    expect(logOutput).not.toContain('\u001b')
  })
})
