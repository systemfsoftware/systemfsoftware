/**
 * The verdict envelope: the single JSON document machine mode prints at the
 * end of a run. The build derives score and per-status counts from the
 * report metrics, carries only the actionable statuses as per-mutant
 * entries, reads the report file name from the embedded config, and stays
 * under the 64 KB scanner limit even for an all-killed 2164-mutant report.
 * Run ids are unique across calls.
 *
 * NOTE: Two original scenarios (`Should_CarryEvaluatorVerdicts_When_EvaluatorsReturnMixedResults`
 * and `Should_PreserveEvaluatorIdentity_When_MultipleEvaluatorsReport`) tested
 * `VerdictEnvelope.evaluatorVerdicts` and the 7-arg `buildVerdictEnvelope(..., evaluatorVerdicts, pathService)`
 * overload. That field and overload were removed in the platform-node restructure:
 * `src/verdict-envelope.ts` now exports a 6-arg `buildVerdictEnvelope(report, mode, signal, runId, basePath, pathService)`
 * returning a `VerdictEnvelope` without `evaluatorVerdicts`, and a grep for `evaluatorVerdicts` across the
 * worktree returns zero hits. The envelope subject still exists, but the evaluator-verdicts sub-feature
 * does not have a public export to test against. Those two scenarios are reported as blocked rather than
 * weakened, per the batch contract (do NOT widen the public API on own initiative). See yield report.
 */
import { expect } from 'vitest'

const checkExpect = expect

import { NodePath } from '@effect/platform-node'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as Path from 'effect/Path'
import type * as schema from 'mutation-testing-report-schema/api'

import {
  buildVerdictEnvelope,
  generateRunId,
  VERDICT_ENVELOPE_SCHEMA_VERSION,
  type VerdictEnvelope,
} from '@systemfsoftware/stryker-js-engine'

const Feature = makeFeature({ it, layer })

const pathService = Effect.runSync(Path.Path.pipe(Effect.provide(NodePath.layer)))

const RUN_ID = '01HZJ4QW2TB6N7P8K9M3X5Y7ZA'

const BASE_PATH = '/project'

type MutationReport = schema.MutationTestResult

const mutantOf = (
  id: string,
  status: schema.MutantStatus,
  location: schema.Location,
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
    jsonReporter: { fileName: `${BASE_PATH}/reports/mutation/mutation.json` },
    disableBail: false,
  },
): MutationReport => {
  const thresholds = { high: 80, low: 60, break: 80 }
  const report: MutationReport = {
    schemaVersion: '1.0',
    files: {
      'src/subject.ts': {
        language: 'typescript',
        source: 'export const a = 1\n',
        mutants,
      },
    },
    testFiles: {},
    thresholds,
    config,
  }
  return report
}

const LOCATION_A = { start: { line: 1, column: 0 }, end: { line: 1, column: 4 } }
const LOCATION_B = { start: { line: 2, column: 0 }, end: { line: 2, column: 5 } }
const LOCATION_C = { start: { line: 3, column: 0 }, end: { line: 3, column: 6 } }

Feature('Building the machine-mode verdict envelope').body(({ scenario }) => {
  scenario(
    'Two run-id generations produce different ids',
    Gherkin.Do.pipe(
      When('two run ids are generated')('ids', () => Effect.sync(() => [generateRunId(), generateRunId()])),
      Then('the ids differ')((s: { ids: readonly string[] }) => {
        checkExpect(s.ids[0]).not.toBe(s.ids[1])
      }),
    ),
  )

  scenario(
    'A report mixing statuses keeps every named field',
    Gherkin.Do.pipe(
      Given('a report with survivors, killed and no-coverage mutants')('report', () =>
        Effect.succeed(
          reportOf([
            mutantOf('1', 'Survived', LOCATION_A, { replacement: '-' }),
            mutantOf('2', 'Killed', LOCATION_B, { replacement: '+' }),
            mutantOf('3', 'NoCoverage', LOCATION_C, { replacement: '*' }),
            mutantOf('4', 'Killed', LOCATION_A, { replacement: '-' }),
          ]),
        )),
      When('the verdict envelope is built')(
        'envelope',
        (s: { report: MutationReport }) =>
          Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'tty', RUN_ID, BASE_PATH, pathService)),
      ),
      Then('every named field is present and the actionable mutants are listed')((s: {
        envelope: VerdictEnvelope
      }) => {
        checkExpect(s.envelope.schemaVersion).toBe(VERDICT_ENVELOPE_SCHEMA_VERSION)
        checkExpect(s.envelope.schemaVersion).toBe('1.1')
        checkExpect(s.envelope.runId).toBe(RUN_ID)
        checkExpect(s.envelope.mode).toBe('machine')
        checkExpect(s.envelope.signal).toBe('tty')
        checkExpect(s.envelope.score).toBe(50)
        checkExpect(s.envelope.thresholds).toStrictEqual({ high: 80, low: 60, break: 80 })
        checkExpect(s.envelope.counts).toStrictEqual({
          killed: 2,
          timeout: 0,
          survived: 1,
          noCoverage: 1,
          runtimeErrors: 0,
          compileErrors: 0,
          ignored: 0,
          pending: 0,
        })
        checkExpect(s.envelope.reportFile).toBe('reports/mutation/mutation.json')
        checkExpect(s.envelope.mutants.length).toBe(2)
        checkExpect(s.envelope.mutants.map((mutant) => mutant.id)).toStrictEqual(['1', '3'])
      }),
    ),
  )

  scenario(
    'Actionable mutants carry their file, location and replacement details',
    Gherkin.Do.pipe(
      Given('survivor, timeout and no-coverage mutants')('report', () =>
        Effect.succeed(
          reportOf([
            mutantOf('1', 'Survived', LOCATION_A, { replacement: '-' }),
            mutantOf('2', 'Timeout', LOCATION_B, { replacement: '+' }),
            mutantOf('3', 'NoCoverage', LOCATION_C, { replacement: '*' }),
          ]),
        )),
      When('the verdict envelope is built')(
        'envelope',
        (s: { report: MutationReport }) =>
          Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'agent', RUN_ID, BASE_PATH, pathService)),
      ),
      Then('each mutant entry carries file, location, mutator, replacement and status')((s: {
        envelope: VerdictEnvelope
      }) => {
        checkExpect(s.envelope.mutants).toStrictEqual([
          {
            id: '1',
            file: 'src/subject.ts',
            location: LOCATION_A,
            mutator: 'BinaryOperator',
            replacement: '-',
            status: 'Survived',
          },
          {
            id: '2',
            file: 'src/subject.ts',
            location: LOCATION_B,
            mutator: 'BinaryOperator',
            replacement: '+',
            status: 'Timeout',
          },
          {
            id: '3',
            file: 'src/subject.ts',
            location: LOCATION_C,
            mutator: 'BinaryOperator',
            replacement: '*',
            status: 'NoCoverage',
          },
        ])
      }),
    ),
  )

  scenario(
    'Killed and compile-error mutants appear only in counts',
    Gherkin.Do.pipe(
      Given('killed, compile-error and survived mutants')('report', () =>
        Effect.succeed(
          reportOf([
            mutantOf('1', 'Killed', LOCATION_A),
            mutantOf('2', 'CompileError', LOCATION_B),
            mutantOf('3', 'Survived', LOCATION_C, { replacement: '-' }),
          ]),
        )),
      When('the verdict envelope is built')(
        'envelope',
        (s: { report: MutationReport }) =>
          Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'tty', RUN_ID, BASE_PATH, pathService)),
      ),
      Then('only the survivor is listed and every mutant is counted')((s: {
        envelope: VerdictEnvelope
      }) => {
        checkExpect(s.envelope.mutants).toStrictEqual([
          {
            id: '3',
            file: 'src/subject.ts',
            location: LOCATION_C,
            mutator: 'BinaryOperator',
            replacement: '-',
            status: 'Survived',
          },
        ])
        checkExpect(s.envelope.counts.killed).toBe(1)
        checkExpect(s.envelope.counts.compileErrors).toBe(1)
        checkExpect(s.envelope.counts.survived).toBe(1)
        const countedTotal = s.envelope.counts
        checkExpect(
          countedTotal.killed +
            countedTotal.timeout +
            countedTotal.survived +
            countedTotal.noCoverage +
            countedTotal.runtimeErrors +
            countedTotal.compileErrors +
            countedTotal.ignored +
            countedTotal.pending,
        ).toBe(3)
      }),
    ),
  )

  scenario(
    'An all-killed report yields an empty mutant list',
    Gherkin.Do.pipe(
      Given('an all-killed report')('report', () =>
        Effect.succeed(
          reportOf([
            mutantOf('1', 'Killed', LOCATION_A),
            mutantOf('2', 'Killed', LOCATION_B),
            mutantOf('3', 'Killed', LOCATION_C),
          ]),
        )),
      When('the verdict envelope is built')(
        'envelope',
        (s: { report: MutationReport }) =>
          Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'tty', RUN_ID, BASE_PATH, pathService)),
      ),
      Then('the mutants array is present and empty')((s: { envelope: VerdictEnvelope }) => {
        checkExpect(s.envelope.mutants).toStrictEqual([])
        checkExpect(s.envelope.counts.killed).toBe(3)
      }),
    ),
  )

  scenario(
    'A configured report file name is carried into the envelope',
    Gherkin.Do.pipe(
      Given('a report whose embedded config names a custom file')('report', () =>
        Effect.succeed(
          reportOf([mutantOf('1', 'Killed', LOCATION_A)], {
            jsonReporter: { fileName: `${BASE_PATH}/custom/report.json` },
          }),
        )),
      When('the verdict envelope is built')(
        'envelope',
        (s: { report: MutationReport }) =>
          Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'flag', RUN_ID, BASE_PATH, pathService)),
      ),
      Then('the configured file name rides along')((s: { envelope: VerdictEnvelope }) => {
        checkExpect(s.envelope.reportFile).toBe('custom/report.json')
      }),
    ),
  )

  scenario(
    'An empty report produces no score and no report file',
    Gherkin.Do.pipe(
      Given('an empty report')('report', () => Effect.succeed(reportOf([]))),
      When('the verdict envelope is built')(
        'envelope',
        (s: { report: MutationReport }) =>
          Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'tty', RUN_ID, BASE_PATH, pathService)),
      ),
      Then('there is no score, no report file and no mutants')((s: { envelope: VerdictEnvelope }) => {
        checkExpect(s.envelope.score).toBe(null)
        checkExpect(s.envelope.reportFile).toBe(null)
        checkExpect(s.envelope.mutants).toStrictEqual([])
        checkExpect(s.envelope.counts.killed).toBe(0)
        checkExpect(s.envelope.counts.survived).toBe(0)
      }),
    ),
  )

  scenario(
    'A report with only compile errors produces no score',
    Gherkin.Do.pipe(
      Given('a report with a single compile-error mutant')(
        'report',
        () => Effect.succeed(reportOf([mutantOf('1', 'CompileError', LOCATION_A)])),
      ),
      When('the verdict envelope is built')(
        'envelope',
        (s: { report: MutationReport }) =>
          Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'tty', RUN_ID, BASE_PATH, pathService)),
      ),
      Then('there is nothing to score')((s: { envelope: VerdictEnvelope }) => {
        checkExpect(s.envelope.score).toBe(null)
        checkExpect(s.envelope.counts.compileErrors).toBe(1)
      }),
    ),
  )

  scenario(
    'A large all-killed report stays under the scanner size limit',
    Gherkin.Do.pipe(
      Given('an all-killed report of 2164 mutants')('report', () =>
        Effect.sync(() => {
          const mutants: schema.MutantResult[] = []
          for (let index = 0; index < 2164; index++) {
            mutants.push(mutantOf(`m${index}`, 'Killed', LOCATION_A))
          }
          return reportOf(mutants)
        })),
      When('the envelope is serialized')(
        'line',
        (s: { report: MutationReport }) =>
          Effect.sync(() =>
            JSON.stringify(buildVerdictEnvelope(s.report, 'machine', 'tty', RUN_ID, BASE_PATH, pathService))
          ),
      ),
      Then('the line stays under the 64 KB scanner limit')((s: { line: string }) => {
        checkExpect(s.line.length > 0).toBeTruthy()
        checkExpect(new TextEncoder().encode(s.line).byteLength < 64 * 1024).toBeTruthy()
      }),
    ),
  )
})
