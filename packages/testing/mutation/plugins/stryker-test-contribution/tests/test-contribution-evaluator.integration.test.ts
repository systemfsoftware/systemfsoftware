/**
 * Evaluator plugin wiring: listing the plugin is enough. A failing
 * contribution verdict returns ExitClass.VerdictFail on the SUCCESS channel;
 * EvaluatorFailed is only for the evaluator itself breaking.
 *
 * Warrant: composition — real gate decision through the Evaluator port's
 * Layer, not a mock; property tests cover the pure decision, this covers the
 * shell wiring (options via RunConfiguration, success value vs error channel).
 * Refusal: not a tautology — removing the system under test (the evaluator's
 * evaluate) would make the Then assertions fail (no VerdictFail where expected,
 * or no EvaluatorFailed where breaking expected).
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { type PartialStrykerOptions, schema, StrykerOptionsSchema } from '@systemfsoftware/stryker-js-plugin-api/core'
import { PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { expect } from 'vitest'

import { Evaluator, type EvaluatorFailed, ExitClass } from '@systemfsoftware/stryker-js-plugin-api/evaluate'
import { RunConfiguration } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import {
  makeTestContributionEvaluatorService,
  testContributionEvaluatorLayer,
} from '@systemfsoftware/stryker-test-contribution'

import { strykerPlugins } from '@systemfsoftware/stryker-test-contribution'

const Feature = makeFeature({ it, layer })

const LOCATION = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }

const reportWithToothlessKernelFile = (): schema.MutationTestResult => ({
  schemaVersion: '2',
  thresholds: { high: 80, low: 60 },
  files: {
    'src/subject.ts': {
      language: 'typescript',
      source: 'export const a = 1\n',
      mutants: [
        {
          id: 'm1',
          status: 'Killed',
          mutatorName: 'BooleanLiteral',
          location: LOCATION,
          killedBy: ['t1'],
        },
      ],
    },
  },
  testFiles: {
    'earns.kernel.property.test.ts': { tests: [{ id: 't1', name: 'test t1' }] },
    'idle.kernel.property.test.ts': { tests: [{ id: 't2', name: 'test t2' }] },
  },
})

// test fixture constructing StrykerOptions via decodeUnknownSync — allowed per no-sync-schema-codecs (test file)
const evaluatorServiceWith = (options: PartialStrykerOptions) => {
  const decoded = Schema.decodeUnknownSync(StrykerOptionsSchema)(options)
  return makeTestContributionEvaluatorService(decoded)
}

const evaluatorViaLayerWith = (options: PartialStrykerOptions) => {
  const decoded = Schema.decodeUnknownSync(StrykerOptionsSchema)(options)
  return Effect.gen(function*() {
    const context = yield* Layer.build(
      testContributionEvaluatorLayer.pipe(Layer.provide(Layer.succeed(RunConfiguration, decoded))),
    )
    return Context.get(context, Evaluator)
  })
}
interface EvaluatorServiceShape {
  readonly evaluate: (report: schema.MutationTestResult) => Effect.Effect<ExitClass | null, EvaluatorFailed>
}

const causeStringOf = (cause: unknown): string | null => {
  if (cause === null || cause === undefined) return null
  if (typeof cause === 'string') return cause
  return JSON.stringify(cause)
}

const exitOf = (evaluator: EvaluatorServiceShape, report: schema.MutationTestResult) =>
  Effect.exit(evaluator.evaluate(report))

const causeOfExit = (exit: Exit.Exit<ExitClass | null, EvaluatorFailed>): string | null => {
  if (Exit.isSuccess(exit)) return null
  const errorOption = Exit.findErrorOption(exit)
  if (Option.isSome(errorOption)) {
    const err = errorOption.value
    return causeStringOf(err.cause)
  }
  return Cause.pretty(exit.cause)
}

Feature('test-contribution evaluator plugin')
  .body(({ scenario }) => {
    scenario(
      'Should_DeclareOneEvaluatorNamedTestContribution',
      Gherkin.Do.pipe(
        Given('the published plugin list')('plugins', () => Effect.succeed(strykerPlugins)),
        Then('it contains one Evaluator named test-contribution')((s) => {
          expect(s.plugins).toHaveLength(1)
          expect(s.plugins[0]?.kind).toBe(PluginKind.Evaluator)
          expect(s.plugins[0]?.name).toBe('test-contribution')
        }),
      ),
    )

    scenario(
      'Should_ReturnVerdictFail_When_ARequiredFileIsToothless',
      Gherkin.Do.pipe(
        Given('an evaluator service with disableBail true')(
          'evaluator',
          () => Effect.sync(() => evaluatorServiceWith({ disableBail: true })),
        ),
        When('a report with one toothless kernel property file is evaluated')(
          'exit',
          (s) => exitOf(s.evaluator, reportWithToothlessKernelFile()),
        ),
        Then('the evaluation succeeds with ExitClass.VerdictFail')((s) => {
          expect(Exit.isSuccess(s.exit)).toBe(true)
          if (Exit.isSuccess(s.exit)) {
            expect(s.exit.value).toBe(ExitClass.VerdictFail)
          }
        }),
      ),
    )

    scenario(
      'Should_ReturnVerdictFail_When_BailStoppedRecordingKillers',
      Gherkin.Do.pipe(
        Given('an evaluator service with bail active (disableBail unset)')(
          'evaluator',
          () => Effect.sync(() => evaluatorServiceWith({})),
        ),
        When('a report with one toothless kernel property file is evaluated')(
          'exit',
          (s) => exitOf(s.evaluator, reportWithToothlessKernelFile()),
        ),
        Then('the evaluation succeeds with ExitClass.VerdictFail for the bail case')((s) => {
          expect(Exit.isSuccess(s.exit)).toBe(true)
          if (Exit.isSuccess(s.exit)) {
            expect(s.exit.value).toBe(ExitClass.VerdictFail)
          }
        }),
      ),
    )

    scenario(
      'Should_ReturnNull_When_EveryRequiredFileDefends',
      Gherkin.Do.pipe(
        Given('an evaluator service with disableBail true')(
          'evaluator',
          () => Effect.sync(() => evaluatorServiceWith({ disableBail: true })),
        ),
        When('a report where the required file defends a mutant is evaluated')('exit', (s) => {
          const report: schema.MutationTestResult = {
            schemaVersion: '2',
            thresholds: { high: 80, low: 60 },
            files: {
              'src/subject.ts': {
                language: 'typescript',
                source: 'export const a = 1\n',
                mutants: [
                  {
                    id: 'm1',
                    status: 'Killed',
                    mutatorName: 'BooleanLiteral',
                    location: LOCATION,
                    killedBy: ['t1'],
                  },
                  {
                    id: 'm2',
                    status: 'Killed',
                    mutatorName: 'BooleanLiteral',
                    location: LOCATION,
                    killedBy: ['t2'],
                  },
                ],
              },
            },
            testFiles: {
              'earns.kernel.property.test.ts': { tests: [{ id: 't1', name: 'test t1' }] },
              'idle.kernel.property.test.ts': { tests: [{ id: 't2', name: 'test t2' }] },
            },
          }
          return exitOf(s.evaluator, report)
        }),
        Then('the evaluation succeeds with null')((s) => {
          expect(Exit.isSuccess(s.exit)).toBe(true)
          if (Exit.isSuccess(s.exit)) {
            expect(s.exit.value).toBeNull()
          }
        }),
      ),
    )

    scenario(
      'Should_ProvideEvaluatorViaLayer_WithRunConfiguration',
      Gherkin.Do.pipe(
        Given('a RunConfiguration with disableBail true')('options', () => Effect.succeed({ disableBail: true })),
        When('the evaluator layer is built with that configuration')('exit', (s) =>
          Effect.gen(function*() {
            const evaluator = yield* evaluatorViaLayerWith(s.options)
            return yield* exitOf(evaluator, reportWithToothlessKernelFile())
          })),
        Then('the layer-provided evaluator also succeeds with ExitClass.VerdictFail')((s) => {
          expect(Exit.isSuccess(s.exit)).toBe(true)
          if (Exit.isSuccess(s.exit)) {
            expect(s.exit.value).toBe(ExitClass.VerdictFail)
          }
        }),
      ),
    )

    scenario(
      'Should_FailWithEvaluatorFailed_When_ReportIsUnreadable',
      Gherkin.Do.pipe(
        Given('an evaluator service with disableBail true')(
          'evaluator',
          () => Effect.sync(() => evaluatorServiceWith({ disableBail: true })),
        ),
        When('a report missing required fields is evaluated')('exit', (s) => {
          const brokenReport = reportWithToothlessKernelFile()
          Object.defineProperty(brokenReport, 'files', {
            get() {
              throw new Error('report files unreadable')
            },
          })
          return exitOf(s.evaluator, brokenReport)
        }),
        Then('the evaluation fails with EvaluatorFailed')((s) => {
          expect(Exit.isFailure(s.exit)).toBe(true)
          const cause = causeOfExit(s.exit)
          expect(cause).not.toBeNull()
        }),
      ),
    )
  })
