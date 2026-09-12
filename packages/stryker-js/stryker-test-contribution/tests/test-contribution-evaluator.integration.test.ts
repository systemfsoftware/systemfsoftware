import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { makeContributionGateEvaluator, strykerPlugins } from '@systemfsoftware/stryker-test-contribution'

const Feature = makeFeature({ it, layer })

const LOCATION = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }

const kernelMutant = (id: string, killedBy?: string[], coveredBy?: string[]): schema.MutantResult => ({
  id,
  status: 'Killed',
  mutatorName: 'BooleanLiteral',
  location: LOCATION,
  ...(killedBy === undefined ? {} : { killedBy }),
  ...(coveredBy === undefined ? {} : { coveredBy }),
})

const reportWithToothlessKernelFile = (
  mutants: schema.MutantResult[] = [kernelMutant('m1', ['t1'], ['t1', 't2'])],
): schema.MutationTestResult => ({
  schemaVersion: '2',
  thresholds: { high: 80, low: 60 },
  files: {
    'src/subject.ts': { language: 'typescript', source: 'export const a = 1\n', mutants },
  },
  testFiles: {
    'earns.kernel.property.test.ts': { tests: [{ id: 't1', name: 'test t1' }] },
    'idle.kernel.property.test.ts': { tests: [{ id: 't2', name: 'test t2' }] },
  },
})

const reportWhoseFilesThrow = (failure: () => never): schema.MutationTestResult => {
  const report = reportWithToothlessKernelFile()
  Object.defineProperty(report, 'files', { get: failure })
  return report
}

const unreadableReport = (): schema.MutationTestResult =>
  reportWhoseFilesThrow(() => {
    throw new Error('report files unreadable')
  })

const reportThrowingNonError = (): schema.MutationTestResult =>
  reportWhoseFilesThrow(() => {
    throw { code: 'EIO' }
  })

const reportThrowingNothing = (): schema.MutationTestResult =>
  reportWhoseFilesThrow(() => {
    throw undefined
  })

Feature('The contribution gate as an evaluator plugin')
  .body(({ scenario }) => {
    scenario(
      'The published plugin list declares one contribution gate',
      Gherkin.Do.pipe(
        Given('the published plugin list')('plugins', () => Effect.succeed(strykerPlugins)),
        When('the declared contributions are inspected')('contributions', (s) => Effect.sync(() => s.plugins)),
        Then('it declares a single evaluator wired to the gate factory')((s) => {
          expect(s.contributions).toHaveLength(1)
          expect(s.contributions[0]).toMatchObject({ kind: 'Evaluator', name: 'contribution-gate' })
          expect(s.contributions[0]?.make).toBe(makeContributionGateEvaluator)
        }),
      ),
    )

    scenario(
      'A redundant required test file fails the run',
      Gherkin.Do.pipe(
        Given('a gate built with bail disabled')(
          'evaluator',
          () => Effect.sync(() => makeContributionGateEvaluator({ disableBail: true })),
        ),
        When('a report whose required kernel file kills nothing alone is evaluated')(
          'verdict',
          (s) => Effect.sync(() => s.evaluator(reportWithToothlessKernelFile())),
        ),
        Then('the run is reported as failing, naming the file that earns nothing alone')((s) => {
          expect(s.verdict?.exitClass).toBe('VerdictFail')
          expect(s.verdict?.message).toContain('idle.kernel.property.test.ts')
        }),
      ),
    )

    scenario(
      'A run that stopped at first killers fails rather than clearing the files',
      Gherkin.Do.pipe(
        Given('a gate built with the default options')(
          'evaluator',
          () => Effect.sync(() => makeContributionGateEvaluator({})),
        ),
        When('a report whose required kernel file kills nothing alone is evaluated')(
          'verdict',
          (s) => Effect.sync(() => s.evaluator(reportWithToothlessKernelFile())),
        ),
        Then('the run is reported as failing, saying the run recorded too little to judge')((s) => {
          expect(s.verdict?.exitClass).toBe('VerdictFail')
          expect(s.verdict?.message).toContain('bail')
        }),
      ),
    )

    scenario(
      'A run where every required file defends a mutant stays clean',
      Gherkin.Do.pipe(
        Given('a gate built with bail disabled')(
          'evaluator',
          () => Effect.sync(() => makeContributionGateEvaluator({ disableBail: true })),
        ),
        When('a report where every required kernel file kills a mutant of its own is evaluated')(
          'verdict',
          (s) =>
            Effect.sync(() =>
              s.evaluator(reportWithToothlessKernelFile([kernelMutant('m1', ['t1']), kernelMutant('m2', ['t2'])]))
            ),
        ),
        Then('the gate reports no verdict')((s) => {
          expect(s.verdict).toBeNull()
        }),
      ),
    )

    scenario(
      'A report the gate cannot read fails the run instead of crashing it',
      Gherkin.Do.pipe(
        Given('a gate built with bail disabled')(
          'evaluator',
          () => Effect.sync(() => makeContributionGateEvaluator({ disableBail: true })),
        ),
        When('a report whose files cannot be read is evaluated')(
          'verdict',
          (s) => Effect.sync(() => s.evaluator(unreadableReport())),
        ),
        Then('the run is reported as a runtime fault, saying why the report could not be read')((s) => {
          expect(s.verdict?.exitClass).toBe('RuntimeError')
          expect(s.verdict?.message).toBe('report files unreadable')
        }),
      ),
    )

    scenario(
      'A failure that is not an error still reports the text it carried',
      Gherkin.Do.pipe(
        Given('a gate built with bail disabled')(
          'evaluator',
          () => Effect.sync(() => makeContributionGateEvaluator({ disableBail: true })),
        ),
        When('a report whose files cannot be read fails with a plain value instead of an error')(
          'verdict',
          (s) => Effect.sync(() => s.evaluator(reportThrowingNonError())),
        ),
        Then('the run is reported as a runtime fault carrying that value as text')((s) => {
          expect(s.verdict?.exitClass).toBe('RuntimeError')
          expect(s.verdict?.message).toBe('{"code":"EIO"}')
        }),
      ),
    )

    scenario(
      'A failure with nothing to say still names the read that failed',
      Gherkin.Do.pipe(
        Given('a gate built with bail disabled')(
          'evaluator',
          () => Effect.sync(() => makeContributionGateEvaluator({ disableBail: true })),
        ),
        When('a report whose files cannot be read fails with a value carrying no text')(
          'verdict',
          (s) => Effect.sync(() => s.evaluator(reportThrowingNothing())),
        ),
        Then('the run is reported as a runtime fault saying reading the report failed')((s) => {
          expect(s.verdict?.exitClass).toBe('RuntimeError')
          expect(s.verdict?.message).toBe('the report could not be read')
        }),
      ),
    )
  })
