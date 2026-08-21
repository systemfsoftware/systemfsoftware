/**
 * Incremental run semantics: a static mutant whose verdict came from a prior
 * run is only reused when its per-test coverage is unchanged — but a survivor
 * of a static mutant must be re-run because the static mutant has no coverage
 * data to confirm, and the reuse-count summary is logged as plain text.
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { type FileDescriptions, type Mutant, schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { type TestResult, TestStatus } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { createDefaultOptions } from '../src/config/options-validator.js'
import { IncrementalDiffer } from '../src/mutants/incremental-differ.js'
import { TestCoverage } from '../src/mutants/test-coverage.js'

const Feature = makeFeature({ it, layer })

const SOURCE_FILE = 'src/thing.ts'
const SOURCE = 'export const pattern = /^[0-9a-f]*$/\n'
const TEST_FILE = 'src/thing.test.ts'
const TEST_SOURCE = "it('works', () => {})\n"

const silentLogger: Logger = {
  isFatalEnabled: () => false,
  isErrorEnabled: () => false,
  isWarnEnabled: () => false,
  isInfoEnabled: () => false,
  isDebugEnabled: () => false,
  isTraceEnabled: () => false,
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
}

const fileDescriptions: FileDescriptions = { [SOURCE_FILE]: { mutate: true } }

const currentMutant: Mutant = {
  id: '1',
  fileName: new URL(`../${SOURCE_FILE}`, import.meta.url).pathname,
  mutatorName: 'Regex',
  replacement: '/[a-f]/',
  location: { start: { line: 1, column: 22 }, end: { line: 1, column: 36 } },
}

const passingTest: TestResult = {
  id: 'test-1',
  name: 'works',
  fileName: new URL(`../${TEST_FILE}`, import.meta.url).pathname,
  status: TestStatus.Success,
  timeSpentMs: 1,
}

const incrementalReport = (mutant: schema.MutantResult): schema.MutationTestResult => ({
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
})

const currentFiles = new Map<string, string>([
  [SOURCE_FILE, SOURCE],
  [TEST_FILE, TEST_SOURCE],
])

const survivedMutantResult = (coveredBy: string[] | undefined): schema.MutantResult => ({
  id: '1',
  mutatorName: 'Regex',
  replacement: '/[a-f]/',
  location: { start: { line: 1, column: 22 }, end: { line: 1, column: 36 } },
  status: 'Survived',
  ...(coveredBy === undefined ? {} : { coveredBy }),
})

const diffWith = (
  logger: Logger,
  testCoverage: TestCoverage,
  mutantResult: schema.MutantResult,
): readonly Mutant[] => {
  const differ = new IncrementalDiffer(logger, createDefaultOptions(), fileDescriptions)
  return differ.diff([currentMutant], testCoverage, incrementalReport(mutantResult), currentFiles)
}

Feature('Incremental differ static-mutant reuse')
  .body(({ scenario }) => {
    scenario(
      'Should_RerunASurvivedStaticMutant_When_ItHasNoPerTestCoverage',
      Gherkin.Do.pipe(
        Given('static-only coverage recorded by the dry run')(
          'coverage',
          () =>
            Effect.succeed(
              new TestCoverage(
                new Map(),
                new Map([[passingTest.id, passingTest]]),
                { '1': 1 },
                new Map(),
              ),
            ),
        ),
        When('the differ diffs the survived static mutant')(
          'verdicts',
          (s) =>
            Effect.sync(() =>
              diffWith(silentLogger, s.coverage, {
                ...survivedMutantResult(undefined),
                static: true,
                coveredBy: [],
              })
            ),
        ),
        Then('the mutant carries no status, so it is re-run')((s) => {
          expect(s.verdicts[0]?.status).toBeUndefined()
        }),
      ),
    )

    scenario(
      'Should_ReuseASurvivorVerdict_When_PerTestCoverageIsUnchanged',
      Gherkin.Do.pipe(
        Given('per-test coverage naming the covering test')(
          'coverage',
          () =>
            Effect.succeed(
              new TestCoverage(
                new Map([['1', new Set([passingTest])]]),
                new Map([[passingTest.id, passingTest]]),
                {},
                new Map(),
              ),
            ),
        ),
        When('the differ diffs the covered survivor')(
          'verdicts',
          (s) => Effect.sync(() => diffWith(silentLogger, s.coverage, survivedMutantResult(['test-1']))),
        ),
        Then('the prior mutable status is kept')((s) => {
          expect(s.verdicts[0]?.status).toBe('Survived')
        }),
      ),
    )

    scenario(
      'Should_LogReuseCountsAsPlainText_When_AnInfoLoggerConsumesTheRun',
      Gherkin.Do.pipe(
        Given('an info logger capturing messages')(
          'capture',
          () =>
            Effect.sync(() => {
              const captured: string[] = []
              const logger: Logger = {
                ...silentLogger,
                isInfoEnabled: () => true,
                info: (input: string) => captured.push(input),
              }
              return { captured, logger }
            }),
        ),
        When('the differ diffs a covered survivor through the logger')(
          'output',
          (s) =>
            Effect.sync(() => {
              const coverage = new TestCoverage(
                new Map([['1', new Set([passingTest])]]),
                new Map([[passingTest.id, passingTest]]),
                {},
                new Map(),
              )
              diffWith(s.capture.logger, coverage, survivedMutantResult(['test-1']))
              return s.capture.captured.join('\n')
            }),
        ),
        Then('the summary is plain text with no ANSI escapes')((s) => {
          expect(s.output).toContain('Incremental report:')
          expect(s.output).toContain('0 files changed (+0 -0)')
          expect(s.output).toContain('1 of 1 mutant result(s) are reused.')
          expect(s.output).not.toContain('\u001b')
        }),
      ),
    )
  })
