import { NodePath } from '@effect/platform-node'
import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { type AnyPluginContribution, declarePlugin, type PluginKind } from '@systemfsoftware/stryker-js'
import { resolveExitCode, verdictExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import type { Location, MutantStatus } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Path from 'effect/Path'
import { FastCheck as fc } from 'effect/testing'

import { strykerPlugins } from '../../tests/__fixtures__/evaluator-fixture/index.js'
import { createDefaultOptions } from '../run/Config.js'
import { evaluatorMessageLine, finalVerdictOf, runLoadedEvaluators } from '../run/mutation-reporting.js'
import { buildVerdictEnvelope } from '../run/verdict-envelope.js'

const pathService = Effect.runSync(Path.Path.pipe(Effect.provide(NodePath.layer)))

const OPTIONS: StrykerOptions = Effect.runSync(createDefaultOptions())

const RUN_ID = '01HZJ4QW2TB6N7P8K9M3X5Y7ZA'

const BASE_PATH = '/project'

const FIXTURE_GATE = 'fixture-gate'

const GATE_MESSAGE = 'the fixture gate rejects a report with surviving or uncovered mutants'

const THROWING_GATE = 'fixture-thrower'

const SIGNAL = 15

const SIGNAL_EXIT_CODE = 143

const PASSING_SCORE = 100

const THRESHOLDS = { high: 80, low: 60, break: 80 }

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

const FAILING_STATUS_ARB = fc.constantFrom<MutantStatus>('Survived', 'NoCoverage')

const CLEAN_STATUS_ARB = fc.constantFrom<MutantStatus>(
  'Killed',
  'CompileError',
  'RuntimeError',
  'Timeout',
  'Ignored',
  'Pending',
)

const locationOf = (index: number): Location => ({
  start: { line: index + 1, column: 0 },
  end: { line: index + 1, column: 4 },
})

const reportOf = (statuses: readonly MutantStatus[]): schema.MutationTestResult => ({
  schemaVersion: '1.0',
  files: {
    'src/subject.ts': {
      language: 'typescript',
      source: 'export const a = 1\n',
      mutants: statuses.map((status, index) => ({
        id: String(index),
        status,
        mutatorName: 'BinaryOperator',
        location: locationOf(index),
      })),
    },
  },
  testFiles: {},
  thresholds: THRESHOLDS,
  config: {},
})

const REPORT_ARB = fc.array(STATUS_ARB, { minLength: 1, maxLength: 3 }).map(reportOf)

const throwingEvaluator = declarePlugin('Evaluator', THROWING_GATE, () => () => {
  throw new Error('the fixture evaluator could not judge this report')
})

const pluginsOf = (
  contributions: readonly AnyPluginContribution[],
): HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]> =>
  HashMap.fromIterable([['Evaluator', contributions] as const])

describe('evaluator dispatch', () => {
  it.effect.prop(
    '∀s_FailingStatusBesideAPassingScore_≡TheGateVerdictFailsTheRun',
    [FAILING_STATUS_ARB],
    ([status]) =>
      Effect.gen(function*() {
        const runs = yield* runLoadedEvaluators(pluginsOf(strykerPlugins), reportOf([status]), OPTIONS)
        return finalVerdictOf(verdictExitClass(PASSING_SCORE, THRESHOLDS.break), null, runs) === 'VerdictFail'
      }),
  )

  it.effect.prop(
    '∀s_CleanStatusBesideAPassingScore_≡TheRunSucceedsQuietly',
    [CLEAN_STATUS_ARB],
    ([status]) =>
      Effect.gen(function*() {
        const report = reportOf([status])
        const runs = yield* runLoadedEvaluators(pluginsOf(strykerPlugins), report, OPTIONS)
        const envelope = buildVerdictEnvelope(report, 'machine', 'tty', RUN_ID, BASE_PATH, pathService, runs)
        return finalVerdictOf(verdictExitClass(PASSING_SCORE, THRESHOLDS.break), null, runs) === null &&
          envelope.evaluators === undefined &&
          runs.map(evaluatorMessageLine).every((line) => line === null)
      }),
  )

  it.effect.prop(
    '∀r_Report_≡AThrowingGateMapsToRuntimeErrorAndTheRunCompletes',
    [REPORT_ARB],
    ([report]) =>
      Effect.gen(function*() {
        const runs = yield* runLoadedEvaluators(pluginsOf([throwingEvaluator]), report, OPTIONS)
        const envelope = buildVerdictEnvelope(report, 'machine', 'tty', RUN_ID, BASE_PATH, pathService, runs)
        const line = runs.map(evaluatorMessageLine)[0] ?? null
        return finalVerdictOf(null, null, runs) === 'RuntimeError' &&
          line !== null && line.includes(`evaluator ${THROWING_GATE} failed`) &&
          envelope.evaluators?.[THROWING_GATE]?.exitClass === 'RuntimeError'
      }),
  )

  it.effect.prop(
    '∀r_Report_≡ATerminatingSignalOutranksEveryGateVerdict',
    [REPORT_ARB],
    ([report]) =>
      Effect.gen(function*() {
        const runs = yield* runLoadedEvaluators(pluginsOf([...strykerPlugins, throwingEvaluator]), report, OPTIONS)
        const verdict = finalVerdictOf(null, null, runs)
        return verdict !== null && resolveExitCode([verdict], SIGNAL) === SIGNAL_EXIT_CODE
      }),
  )

  it.effect.prop(
    '∀s_FailingStatus_≡TheEnvelopeCarriesTheVerdictAndItsMessage',
    [FAILING_STATUS_ARB],
    ([status]) =>
      Effect.gen(function*() {
        const report = reportOf([status])
        const runs = yield* runLoadedEvaluators(pluginsOf(strykerPlugins), report, OPTIONS)
        const envelope = buildVerdictEnvelope(report, 'machine', 'tty', RUN_ID, BASE_PATH, pathService, runs)
        const entry = envelope.evaluators?.[FIXTURE_GATE]
        return envelope.schemaVersion === '1.2' && entry !== undefined &&
          entry.exitClass === 'VerdictFail' && entry.message === GATE_MESSAGE
      }),
  )

  it.effect.prop(
    '∀s_FailingStatus_≡TheHostRendersTheMessageForStderr',
    [FAILING_STATUS_ARB],
    ([status]) =>
      Effect.gen(function*() {
        const runs = yield* runLoadedEvaluators(pluginsOf(strykerPlugins), reportOf([status]), OPTIONS)
        const lines = runs.map(evaluatorMessageLine)
        return lines.length === 1 && lines[0] === `evaluator ${FIXTURE_GATE}: ${GATE_MESSAGE}`
      }),
  )
})
