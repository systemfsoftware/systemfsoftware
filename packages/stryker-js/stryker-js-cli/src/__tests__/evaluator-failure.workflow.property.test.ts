import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { type AnyPluginContribution, declarePlugin } from '@systemfsoftware/stryker-js'
import type { MutantStatus } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import { FastCheck as fc } from 'effect/testing'

import { createDefaultOptions } from '../run/Config.js'
import { runLoadedEvaluators } from '../run/mutation-reporting.js'

const OPTIONS: StrykerOptions = Effect.runSync(createDefaultOptions())

const FACTORY_THROWER = 'fixture-factory-thrower'

const EVALUATOR_THROWER = 'fixture-evaluator-thrower'

const THRESHOLDS = { high: 80, low: 60, break: 80 }

const factoryThatThrows = declarePlugin('Evaluator', FACTORY_THROWER, () => {
  throw new Error('the fixture evaluator factory could not be built')
})

const evaluatorThatThrows = declarePlugin('Evaluator', EVALUATOR_THROWER, () => () => {
  throw new Error('the fixture evaluator could not judge this report')
})

const STATUS_ARB = fc.constantFrom<MutantStatus>(
  'Killed',
  'Survived',
  'NoCoverage',
  'CompileError',
  'RuntimeError',
  'Timeout',
  'Ignored',
  'Pending',
)

const REPORT_ARB = fc.array(STATUS_ARB, { minLength: 1, maxLength: 3 }).map(
  (statuses): schema.MutationTestResult => ({
    schemaVersion: '1.0',
    files: {
      'src/subject.ts': {
        language: 'typescript',
        source: 'export const a = 1\n',
        mutants: statuses.map((status, index) => ({
          id: String(index),
          status,
          mutatorName: 'BinaryOperator',
          location: { start: { line: index + 1, column: 0 }, end: { line: index + 1, column: 4 } },
        })),
      },
    },
    testFiles: {},
    thresholds: THRESHOLDS,
    config: {},
  }),
)

const reportedAsRuntimeError = (
  report: schema.MutationTestResult,
  contribution: AnyPluginContribution,
  name: string,
): Effect.Effect<boolean> =>
  Effect.gen(function*() {
    const pluginsByKind = HashMap.fromIterable([['Evaluator', [contribution]] as const])
    const exit = yield* Effect.exit(runLoadedEvaluators(pluginsByKind, report, OPTIONS))
    if (!Exit.isSuccess(exit)) {
      return false
    }
    const [run] = exit.value
    if (run === undefined || run.name !== name) {
      return false
    }
    const verdict = run.verdict
    return exit.value.length === 1 && verdict !== null && verdict.exitClass === 'RuntimeError' &&
      (verdict.message ?? '').includes(`evaluator ${name} failed`)
  })

describe('evaluator failure containment', () => {
  it.effect.prop(
    '∀r_Report_≡AFactoryThatThrowsBecomesAVerdictInsteadOfACrash',
    [REPORT_ARB],
    ([report]) => reportedAsRuntimeError(report, factoryThatThrows, FACTORY_THROWER),
  )

  it.effect.prop(
    '∀r_Report_≡AnEvaluatorThatThrowsWhenCalledBecomesAVerdictInsteadOfACrash',
    [REPORT_ARB],
    ([report]) => reportedAsRuntimeError(report, evaluatorThatThrows, EVALUATOR_THROWER),
  )
})
