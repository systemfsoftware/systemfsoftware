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

const LARGE_MUTANT_COUNT = 2164

/** The published wire version, widened so the pin below compares a string to a literal. */
const PINNED_SCHEMA_VERSION: string = VERDICT_ENVELOPE_SCHEMA_VERSION

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

const largeAllKilledReport = (): MutationReport =>
  reportOf(Array.from({ length: LARGE_MUTANT_COUNT }, (_, index) => mutantOf(`m${index}`, 'Killed', locationOf(index))))

const envelopeOf = (testCase: EnvelopeCase): VerdictEnvelope =>
  buildVerdictEnvelope(testCase.report, testCase.mode, testCase.signal, RUN_ID, BASE_PATH, pathService)

const countedTotal = (counts: VerdictEnvelope['counts']): number =>
  counts.killed + counts.timeout + counts.survived + counts.noCoverage + counts.runtimeErrors +
  counts.compileErrors + counts.ignored + counts.pending

const idsOf = (envelope: VerdictEnvelope): readonly string[] => Arr.map(envelope.mutants, (mutant) => mutant.id)

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
  readonly actionableIds: readonly string[]
  readonly total: number
}

const REPORT_CASE_ARB: fc.Arbitrary<ReportCase> = fc
  .uniqueArray(fc.stringMatching(/^m[0-9]{1,2}$/), { minLength: 0, maxLength: 6 })
  .chain((ids) =>
    fc.array(STATUS_ARB, { minLength: ids.length, maxLength: ids.length }).map((statuses) => {
      const mutants = Arr.zip(ids, statuses)
      return {
        envelope: {
          report: reportOf(Arr.map(mutants, ([id, status], index) => mutantOf(id, status, locationOf(index)))),
          mode: 'machine',
          signal: 'tty',
        },
        actionableIds: Arr.map(
          Arr.filter(mutants, ([, status]) => ACTIONABLE_STATUSES.includes(status)),
          ([id]) => id,
        ),
        total: ids.length,
      }
    })
  )

const MIXED_STATUSES: EnvelopeCase = {
  report: reportOf([
    mutantOf('1', 'Survived', locationOf(0), { replacement: '-' }),
    mutantOf('2', 'Killed', locationOf(1), { replacement: '+' }),
    mutantOf('3', 'NoCoverage', locationOf(2), { replacement: '*' }),
    mutantOf('4', 'Killed', locationOf(0), { replacement: '-' }),
  ]),
  mode: 'machine',
  signal: 'tty',
}

describe('buildVerdictEnvelope', () => {
  it.prop('∀n_Ids_≡EveryGeneratedRunIdIsDistinct', [fc.integer({ min: 2, max: 32 })], ([count]) => {
    const ids = Array.from({ length: count }, generateRunId)
    return new Set(ids).size === count
  })

  it.prop('∀c_MixedStatuses_≡EveryNamedFieldSurvives', [fc.constant(MIXED_STATUSES)], ([testCase]) => {
    const envelope = envelopeOf(testCase)
    return envelope.schemaVersion === VERDICT_ENVELOPE_SCHEMA_VERSION &&
      PINNED_SCHEMA_VERSION === '1.2' &&
      envelope.runId === RUN_ID &&
      envelope.mode === 'machine' &&
      envelope.signal === 'tty' &&
      envelope.score === 50 &&
      Equal.equals(envelope.thresholds, THRESHOLDS) &&
      Equal.equals(envelope.counts, {
        killed: 2,
        timeout: 0,
        survived: 1,
        noCoverage: 1,
        runtimeErrors: 0,
        compileErrors: 0,
        ignored: 0,
        pending: 0,
      }) &&
      envelope.reportFile === 'reports/mutation/mutation.json' &&
      envelope.mutants.length === 2 &&
      Equal.equals(idsOf(envelope), ['1', '3'])
  })

  it.prop(
    '∀c_Actionable_≡FileLocationMutatorReplacementAndStatus',
    [
      fc.constant({
        report: reportOf([
          mutantOf('1', 'Survived', locationOf(0), { replacement: '-' }),
          mutantOf('2', 'Timeout', locationOf(1), { replacement: '+' }),
          mutantOf('3', 'NoCoverage', locationOf(2), { replacement: '*' }),
        ]),
        mode: 'machine',
        signal: 'agent',
      }),
    ],
    ([testCase]) =>
      Equal.equals(envelopeOf(testCase).mutants, [
        {
          id: '1',
          file: 'src/subject.ts',
          location: locationOf(0),
          mutator: 'BinaryOperator',
          replacement: '-',
          status: 'Survived',
        },
        {
          id: '2',
          file: 'src/subject.ts',
          location: locationOf(1),
          mutator: 'BinaryOperator',
          replacement: '+',
          status: 'Timeout',
        },
        {
          id: '3',
          file: 'src/subject.ts',
          location: locationOf(2),
          mutator: 'BinaryOperator',
          replacement: '*',
          status: 'NoCoverage',
        },
      ]),
  )

  it.prop(
    '∀c_KilledAndCompileError_≡CountsOnly',
    [
      fc.constant({
        report: reportOf([
          mutantOf('1', 'Killed', locationOf(0)),
          mutantOf('2', 'CompileError', locationOf(1)),
          mutantOf('3', 'Survived', locationOf(2), { replacement: '-' }),
        ]),
        mode: 'machine',
        signal: 'tty',
      }),
    ],
    ([testCase]) => {
      const envelope = envelopeOf(testCase)
      return Equal.equals(envelope.mutants, [
        {
          id: '3',
          file: 'src/subject.ts',
          location: locationOf(2),
          mutator: 'BinaryOperator',
          replacement: '-',
          status: 'Survived',
        },
      ]) && envelope.counts.killed === 1 && envelope.counts.compileErrors === 1 &&
        envelope.counts.survived === 1 && countedTotal(envelope.counts) === 3
    },
  )

  it.prop(
    '∀c_AllKilled_≡NoMutantIsListed',
    [
      fc.constant({
        report: reportOf([
          mutantOf('1', 'Killed', locationOf(0)),
          mutantOf('2', 'Killed', locationOf(1)),
          mutantOf('3', 'Killed', locationOf(2)),
        ]),
        mode: 'machine',
        signal: 'tty',
      }),
    ],
    ([testCase]) => {
      const envelope = envelopeOf(testCase)
      return Equal.equals(envelope.mutants, []) && envelope.counts.killed === 3
    },
  )

  it.prop(
    '∀c_ConfiguredFileName_≡CarriedRelativeToTheBasePath',
    [
      fc.constant({
        report: reportOf([mutantOf('1', 'Killed', locationOf(0))], {
          jsonReporter: { fileName: `${BASE_PATH}/custom/report.json` },
        }),
        mode: 'machine',
        signal: 'flag',
      }),
    ],
    ([testCase]) => envelopeOf(testCase).reportFile === 'custom/report.json',
  )

  it.prop(
    '∀c_EmptyReport_≡NoScoreAndNoReportFile',
    [fc.constant({ report: reportOf([]), mode: 'machine', signal: 'tty' })],
    ([testCase]) => {
      const envelope = envelopeOf(testCase)
      return envelope.score === null && envelope.reportFile === null && Equal.equals(envelope.mutants, []) &&
        envelope.counts.killed === 0 && envelope.counts.survived === 0
    },
  )

  it.prop(
    '∀c_CompileErrorOnly_≡NoScore',
    [fc.constant({ report: reportOf([mutantOf('1', 'CompileError', locationOf(0))]), mode: 'machine', signal: 'tty' })],
    ([testCase]) => {
      const envelope = envelopeOf(testCase)
      return envelope.score === null && envelope.counts.compileErrors === 1
    },
  )

  it.prop(
    '∀n_LargeAllKilled_≡StaysUnderTheScannerSizeLimit',
    [fc.constant({ report: largeAllKilledReport(), mode: 'machine', signal: 'tty' })],
    ([testCase]) => {
      const line = JSON.stringify(envelopeOf(testCase))
      return line.length > 0 && new TextEncoder().encode(line).byteLength < 64 * 1024
    },
  )

  it.prop('∀r_Reports_≡CountsAndEntriesComeFromTheReport', [REPORT_CASE_ARB], ([testCase]) => {
    const envelope = envelopeOf(testCase.envelope)
    return envelope.mutants.length === testCase.actionableIds.length &&
      Equal.equals(idsOf(envelope), testCase.actionableIds) &&
      countedTotal(envelope.counts) === testCase.total
  })

  it.prop(
    '∀c_EvaluatorVerdicts_≡OnlyTheReturnedVerdictsAreCarriedByName',
    [
      fc.constant({
        report: reportOf([mutantOf('1', 'Killed', locationOf(0))]),
        mode: 'machine',
        signal: 'tty',
      }),
    ],
    ([testCase]) => {
      const envelope = buildVerdictEnvelope(
        testCase.report,
        testCase.mode,
        testCase.signal,
        RUN_ID,
        BASE_PATH,
        pathService,
        [
          { name: 'fixture-gate', verdict: { exitClass: 'VerdictFail', message: 'the gate rejected the report' } },
          { name: 'fixture-clean', verdict: null },
        ],
      )
      return Equal.equals(envelope.evaluators, {
        'fixture-gate': { exitClass: 'VerdictFail', message: 'the gate rejected the report' },
      })
    },
  )

  it.prop(
    '∀c_NoEvaluatorVerdicts_≡TheFieldIsAbsent',
    [fc.constant({ report: reportOf([mutantOf('1', 'Killed', locationOf(0))]), mode: 'machine', signal: 'tty' })],
    ([testCase]) => {
      const envelope = buildVerdictEnvelope(
        testCase.report,
        testCase.mode,
        testCase.signal,
        RUN_ID,
        BASE_PATH,
        pathService,
        [],
      )
      return envelope.evaluators === undefined && !Object.hasOwn(envelope, 'evaluators')
    },
  )
})
