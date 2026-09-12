import { NodePath } from '@effect/platform-node'
import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import type { Location, MutantStatus } from '@systemfsoftware/stryker-js/Mutant'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import { Array as Arr, Equal } from 'effect'
import * as Effect from 'effect/Effect'
import * as Path from 'effect/Path'
import { FastCheck as fc } from 'effect/testing'

import {
  buildVerdictEnvelope,
  generateRunId,
  VERDICT_ENVELOPE_SCHEMA_VERSION,
  type VerdictEnvelope,
} from '../run/verdict-envelope.js'

const pathService = Effect.runSync(Path.Path.pipe(Effect.provide(NodePath.layer)))

const RUN_ID = '01HZJ4QW2TB6N7P8K9M3X5Y7ZA'

const BASE_PATH = '/project'

const DEFAULT_REPORT_FILE = `${BASE_PATH}/reports/mutation/mutation.json`

const THRESHOLDS = { high: 80, low: 60, break: 80 }

type MutationReport = schema.MutationTestResult

interface EnvelopeCase {
  readonly report: MutationReport
  readonly mode: 'human' | 'machine'
  readonly signal: 'tty' | 'agent' | 'flag'
}

const locationOf = (index: number): Location => ({
  start: { line: index + 1, column: 0 },
  end: { line: index + 1, column: 4 },
})

const mutantOf = (
  id: string,
  status: MutantStatus,
  location: Location,
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
    jsonReporter: { fileName: DEFAULT_REPORT_FILE },
    disableBail: false,
  },
): MutationReport => ({
  schemaVersion: '1.0',
  files: {
    'src/subject.ts': {
      language: 'typescript',
      source: 'export const a = 1\n',
      mutants,
    },
  },
  testFiles: {},
  thresholds: THRESHOLDS,
  config,
})

const envelopeOf = (testCase: EnvelopeCase): VerdictEnvelope =>
  buildVerdictEnvelope(testCase.report, testCase.mode, testCase.signal, RUN_ID, BASE_PATH, pathService)

const countedTotal = (counts: VerdictEnvelope['counts']): number =>
  counts.killed + counts.timeout + counts.survived + counts.noCoverage + counts.runtimeErrors +
  counts.compileErrors + counts.ignored + counts.pending

const ACTIONABLE_STATUSES: readonly MutantStatus[] = ['Survived', 'NoCoverage', 'Timeout', 'RuntimeError']

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

interface ReportCase {
  readonly envelope: EnvelopeCase
  readonly expected: VerdictEnvelope['mutants']
  readonly actionableIds: readonly string[]
  readonly counts: VerdictEnvelope['counts']
  readonly total: number
}

const COUNT_KEY_BY_STATUS: Record<MutantStatus, keyof VerdictEnvelope['counts']> = {
  Killed: 'killed',
  Timeout: 'timeout',
  Survived: 'survived',
  NoCoverage: 'noCoverage',
  RuntimeError: 'runtimeErrors',
  CompileError: 'compileErrors',
  Ignored: 'ignored',
  Pending: 'pending',
}

const REPLACEMENT_ARB = fc.constantFrom('-', '+', '*', '?', '!', '%')

const REPORT_CASE_ARB: fc.Arbitrary<ReportCase> = fc
  .uniqueArray(fc.stringMatching(/^m[0-9]{1,2}$/), { minLength: 0, maxLength: 6 })
  .chain((ids) =>
    fc.tuple(
      fc.array(STATUS_ARB, { minLength: ids.length, maxLength: ids.length }),
      fc.array(REPLACEMENT_ARB, { minLength: ids.length, maxLength: ids.length }),
    ).map(([statuses, replacements]) => {
      const mutants = Arr.zip(ids, Arr.zip(statuses, replacements))
      const counts = {
        killed: 0,
        timeout: 0,
        survived: 0,
        noCoverage: 0,
        runtimeErrors: 0,
        compileErrors: 0,
        ignored: 0,
        pending: 0,
      }
      for (const [, [status]] of mutants) counts[COUNT_KEY_BY_STATUS[status]] += 1
      const expected = Arr.flatMap(mutants, ([id, [status, replacement]], index) => {
        if (!ACTIONABLE_STATUSES.includes(status)) return []
        return [{
          id,
          file: 'src/subject.ts',
          location: locationOf(index),
          mutator: 'BinaryOperator',
          replacement,
          status,
        }]
      })
      return {
        envelope: {
          report: reportOf(Arr.map(
            mutants,
            ([id, [status, replacement]], index) => mutantOf(id, status, locationOf(index), { replacement }),
          )),
          mode: 'machine',
          signal: 'tty',
        },
        expected,
        actionableIds: Arr.map(expected, (mutant) => mutant.id),
        counts,
        total: ids.length,
      }
    })
  )

describe('buildVerdictEnvelope', () => {
  it.prop('∀n_Ids_≡EveryGeneratedRunIdIsDistinct', [fc.integer({ min: 2, max: 32 })], ([count]) => {
    const ids = Array.from({ length: count }, generateRunId)
    return new Set(ids).size === count
  })

  it.prop(
    '∀r_Reports_≡EveryActionableMutantIsCarriedVerbatim',
    [REPORT_CASE_ARB],
    ([testCase]) => {
      const envelope = envelopeOf(testCase.envelope)
      return Equal.equals(envelope.mutants, testCase.expected)
    },
  )

  it.prop(
    '∀r_Reports_≡CountsAreTheStatusTally',
    [REPORT_CASE_ARB],
    ([testCase]) => {
      const envelope = envelopeOf(testCase.envelope)
      return envelope.schemaVersion === VERDICT_ENVELOPE_SCHEMA_VERSION &&
        Equal.equals(envelope.counts, testCase.counts) && countedTotal(envelope.counts) === testCase.total
    },
  )

  it.prop(
    '∀n_FileNames_≡ConfiguredReportFilesCarryRelativeToTheBasePath',
    [fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/)],
    ([fileName]) => {
      const envelope = envelopeOf({
        report: reportOf([mutantOf('1', 'Killed', locationOf(0))], {
          jsonReporter: { fileName: `${BASE_PATH}/custom/${fileName}.json` },
        }),
        mode: 'machine',
        signal: 'flag',
      })
      return envelope.reportFile === `custom/${fileName}.json`
    },
  )

  it.prop(
    '∀n_EvaluatorNames_≡OnlyTheReturnedVerdictsAreCarriedByName',
    [
      fc.tuple(fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/), fc.nat({ max: 9 })).map(
        ([name, n]): readonly [string, string] => [name, `${name}${n}`],
      ),
      fc.constantFrom('VerdictFail', 'ConfigError', 'RuntimeError', 'InternalError'),
      fc.string({ minLength: 1, maxLength: 20 }),
    ],
    ([[returnedName, silentName], exitClass, message]) => {
      const envelope = buildVerdictEnvelope(
        reportOf([mutantOf('1', 'Killed', locationOf(0))]),
        'machine',
        'tty',
        RUN_ID,
        BASE_PATH,
        pathService,
        [
          { name: returnedName, verdict: { exitClass, message } },
          { name: silentName, verdict: null },
        ],
      )
      return Equal.equals(envelope.evaluators, { [returnedName]: { exitClass, message } })
    },
  )

  it.prop(
    '∀n_SilentEvaluators_≡NoReturnedVerdictLeavesTheFieldAbsent',
    [fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/), { minLength: 0, maxLength: 3 })],
    ([names]) => {
      const envelope = buildVerdictEnvelope(
        reportOf([mutantOf('1', 'Killed', locationOf(0))]),
        'machine',
        'tty',
        RUN_ID,
        BASE_PATH,
        pathService,
        Arr.map(names, (name) => ({ name, verdict: null })),
      )
      return envelope.evaluators === undefined && !Object.hasOwn(envelope, 'evaluators')
    },
  )
})
