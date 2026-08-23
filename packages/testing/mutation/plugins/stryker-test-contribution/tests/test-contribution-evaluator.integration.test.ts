/**
 * Evaluator plugin wiring: listing the plugin is enough. A failed
 * contribution verdict records VerdictFail.
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  ExitClass,
  getPendingExitClasses,
  resolveExitCode,
} from '@systemfsoftware/stryker-js-mutation-run/exit-classification'
import { schema, type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { strykerPlugins } from '../src/mod.js'
import { TestContributionEvaluator } from '../src/test-contribution-evaluator.js'

const Feature = makeFeature({ it, layer })

const LOCATION = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }

const silentLogger = (): Logger => ({
  isTraceEnabled: () => false,
  isDebugEnabled: () => false,
  isInfoEnabled: () => true,
  isWarnEnabled: () => true,
  isErrorEnabled: () => true,
  isFatalEnabled: () => true,
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
})

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

const evaluatorWith = (options: Record<string, unknown>): TestContributionEvaluator =>
  new TestContributionEvaluator(options as unknown as StrykerOptions, silentLogger())

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
      'Should_RecordVerdictFail_When_ARequiredFileIsToothless',
      Gherkin.Do.pipe(
        Given('an evaluator with disableBail true and no other options')(
          'evaluator',
          () => Effect.sync(() => evaluatorWith({ disableBail: true })),
        ),
        When('a report with one toothless kernel property file is evaluated')('pending', (s) =>
          Effect.sync(() => {
            s.evaluator.evaluate(reportWithToothlessKernelFile())
            return getPendingExitClasses()
          })),
        Then('VerdictFail is pending and the resolved exit code is 1')((s) => {
          expect(s.pending.has(ExitClass.VerdictFail)).toBe(true)
          expect(resolveExitCode(s.pending, null)).toBe(1)
        }),
      ),
    )

    scenario(
      'Should_RefuseToJudge_When_BailStoppedRecordingKillers',
      Gherkin.Do.pipe(
        Given('an evaluator with bail active (disableBail unset)')(
          'evaluator',
          () => Effect.sync(() => evaluatorWith({})),
        ),
        When('a report with one toothless kernel property file is evaluated')('pending', (s) =>
          Effect.sync(() => {
            s.evaluator.evaluate(reportWithToothlessKernelFile())
            return getPendingExitClasses()
          })),
        Then('VerdictFail is pending with the disableBail instruction')((s) => {
          expect(s.pending.has(ExitClass.VerdictFail)).toBe(true)
        }),
      ),
    )
  })
