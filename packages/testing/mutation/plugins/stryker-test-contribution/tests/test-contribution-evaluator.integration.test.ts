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

import { strykerPlugins, strykerValidationSchema, suffixesToRequire } from '../src/mod.js'
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

const reportWithToothlessPropertyFile = (): schema.MutationTestResult => ({
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
    'earns.property.test.ts': { tests: [{ id: 't1', name: 'test t1' }] },
    'idle.property.test.ts': { tests: [{ id: 't2', name: 'test t2' }] },
  },
})

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
      'Should_DeclareRequireTestContributionOnTheValidationSchema',
      Gherkin.Do.pipe(
        Given('the published validation schema')(
          'document',
          () => Effect.succeed(JSON.stringify(strykerValidationSchema)),
        ),
        Then('properties.requireTestContribution exists and names the default suffixes')((s) => {
          expect(s.document).toContain('requireTestContribution')
          expect(s.document).toContain('.workflow.property.test.ts')
          expect(s.document).toContain('.policy.property.test.ts')
          expect(s.document).toContain('.kernel.property.test.ts')
        }),
      ),
    )

    scenario(
      'Should_RecordVerdictFail_When_ARequiredFileIsToothless',
      Gherkin.Do.pipe(
        Given('an evaluator with the property suffix required and disableBail true')(
          'evaluator',
          () =>
            Effect.sync(() => {
              const options = {
                requireTestContribution: ['.property.test.ts'],
                disableBail: true,
              } as unknown as StrykerOptions
              return new TestContributionEvaluator(options, silentLogger())
            }),
        ),
        When('a report with one toothless in-scope file is evaluated')('pending', (s) =>
          Effect.sync(() => {
            s.evaluator.evaluate(reportWithToothlessPropertyFile())
            return getPendingExitClasses()
          })),
        Then('VerdictFail is pending and the resolved exit code is 1')((s) => {
          expect(s.pending.has(ExitClass.VerdictFail)).toBe(true)
          expect(resolveExitCode(s.pending, null)).toBe(1)
        }),
      ),
    )

    scenario(
      'Should_TreatNullAndUndefinedAsOff',
      Gherkin.Do.pipe(
        Given('null and undefined option values')('values', () => Effect.succeed([null, undefined] as const)),
        Then('suffixesToRequire stays undefined')((s) => {
          expect(suffixesToRequire(s.values[0])).toBeUndefined()
          expect(suffixesToRequire(s.values[1])).toBeUndefined()
        }),
      ),
    )
  })
