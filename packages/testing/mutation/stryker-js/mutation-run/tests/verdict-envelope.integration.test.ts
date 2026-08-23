/**
 * The verdict envelope: the single JSON document machine mode prints at the
 * end of a run. The build derives score and per-status counts from the
 * report metrics, carries only the actionable statuses as per-mutant
 * entries, reads the report file name from the embedded config, and stays
 * under the 64 KB scanner limit even for an all-killed 2164-mutant report.
 * Run ids are unique across calls.
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect } from 'effect'
import { expect } from 'vitest'

import {
  buildVerdictEnvelope,
  generateRunId,
  VERDICT_ENVELOPE_SCHEMA_VERSION,
} from '@systemfsoftware/stryker-js-mutation-run/verdict-envelope'

const Feature = makeFeature({ it, layer })

const RUN_ID = '01HZJ4QW2TB6N7P8K9M3X5Y7ZA'

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
    jsonReporter: { fileName: 'reports/mutation/mutation.json' },
    disableBail: false,
  },
) => ({
  schemaVersion: '1.0',
  files: {
    'src/subject.ts': {
      language: 'typescript',
      source: 'export const a = 1\n',
      mutants,
    },
  },
  testFiles: {},
  thresholds: { high: 80, low: 60, break: 80 },
  config,
})

const LOCATION_A = { start: { line: 1, column: 0 }, end: { line: 1, column: 4 } }
const LOCATION_B = { start: { line: 2, column: 0 }, end: { line: 2, column: 5 } }
const LOCATION_C = { start: { line: 3, column: 0 }, end: { line: 3, column: 6 } }

Feature('Building the machine-mode verdict envelope')
  .body(({ scenario }) => {
    scenario(
      'Should_ProduceADifferentRunId_When_ItIsCalledTwice',
      Gherkin.Do.pipe(
        When('two run ids are generated')('ids', () => Effect.sync(() => [generateRunId(), generateRunId()])),
        Then('the ids differ')((s) => {
          expect(s.ids[0]).not.toBe(s.ids[1])
        }),
      ),
    )

    scenario(
      'Should_CarryEveryNamedField_When_TheReportMixesStatuses',
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
          (s) => Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'tty', RUN_ID)),
        ),
        Then('every named field is present and the actionable mutants are listed')((s) => {
          expect(s.envelope.schemaVersion).toBe(VERDICT_ENVELOPE_SCHEMA_VERSION)
          expect(s.envelope.runId).toBe(RUN_ID)
          expect(s.envelope.mode).toBe('machine')
          expect(s.envelope.signal).toBe('tty')
          expect(s.envelope.score).toBe(50)
          expect(s.envelope.thresholds).toEqual({ high: 80, low: 60, break: 80 })
          expect(s.envelope.counts).toEqual({
            killed: 2,
            timeout: 0,
            survived: 1,
            noCoverage: 1,
            runtimeErrors: 0,
            compileErrors: 0,
            ignored: 0,
            pending: 0,
          })
          expect(s.envelope.reportFile).toBe('reports/mutation/mutation.json')
          expect(s.envelope.mutants).toHaveLength(2)
          expect(s.envelope.mutants.map((mutant) => mutant.id)).toEqual(['1', '3'])
        }),
      ),
    )

    scenario(
      'Should_CarryTheFullSurvivorRerunKey_When_MutantsSurviveTimeoutOrLackCoverage',
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
          (s) => Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'agent', RUN_ID)),
        ),
        Then('each mutant entry carries file, location, mutator, replacement and status')((s) => {
          expect(s.envelope.mutants).toEqual([
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
      'Should_ReportKilledMutantsAsCountsOnly_When_TheyAreNotIncludedInTheMutantList',
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
          (s) => Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'tty', RUN_ID)),
        ),
        Then('only the survivor is listed and every mutant is counted')((s) => {
          expect(s.envelope.mutants).toEqual([
            {
              id: '3',
              file: 'src/subject.ts',
              location: LOCATION_C,
              mutator: 'BinaryOperator',
              replacement: '-',
              status: 'Survived',
            },
          ])
          expect(s.envelope.counts.killed).toBe(1)
          expect(s.envelope.counts.compileErrors).toBe(1)
          expect(s.envelope.counts.survived).toBe(1)
          const countedTotal = s.envelope.counts
          expect(
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
      'Should_YieldAnEmptyMutantList_When_EveryMutantIsKilled',
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
          (s) => Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'tty', RUN_ID)),
        ),
        Then('the mutants array is present and empty')((s) => {
          expect(s.envelope.mutants).toEqual([])
          expect(s.envelope.counts.killed).toBe(3)
        }),
      ),
    )

    scenario(
      'Should_UseTheConfiguredReportFileName_When_TheEmbeddedConfigDeclaresIt',
      Gherkin.Do.pipe(
        Given('a report whose embedded config names a custom file')('report', () =>
          Effect.succeed(
            reportOf([mutantOf('1', 'Killed', LOCATION_A)], {
              jsonReporter: { fileName: 'custom/report.json' },
            }),
          )),
        When('the verdict envelope is built')(
          'envelope',
          (s) => Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'flag', RUN_ID)),
        ),
        Then('the configured file name rides along')((s) => {
          expect(s.envelope.reportFile).toBe('custom/report.json')
        }),
      ),
    )

    scenario(
      'Should_ReportNullScoreAndNullReportFile_When_TheRunHadNoMutants',
      Gherkin.Do.pipe(
        Given('an empty report')('report', () => Effect.succeed(reportOf([]))),
        When('the verdict envelope is built')(
          'envelope',
          (s) => Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'tty', RUN_ID)),
        ),
        Then('there is no score, no report file and no mutants')((s) => {
          expect(s.envelope.score).toBeNull()
          expect(s.envelope.reportFile).toBeNull()
          expect(s.envelope.mutants).toEqual([])
          expect(s.envelope.counts.killed).toBe(0)
          expect(s.envelope.counts.survived).toBe(0)
        }),
      ),
    )

    scenario(
      'Should_ReportANullScore_When_OnlyCompileErrorsExistInTheReport',
      Gherkin.Do.pipe(
        Given('a report with a single compile-error mutant')(
          'report',
          () => Effect.succeed(reportOf([mutantOf('1', 'CompileError', LOCATION_A)])),
        ),
        When('the verdict envelope is built')(
          'envelope',
          (s) => Effect.sync(() => buildVerdictEnvelope(s.report, 'machine', 'tty', RUN_ID)),
        ),
        Then('there is nothing to score')((s) => {
          expect(s.envelope.score).toBeNull()
          expect(s.envelope.counts.compileErrors).toBe(1)
        }),
      ),
    )

    scenario(
      'Should_StayUnderTheScannerLimit_When_AnAllKilled2164MutantReportIsEnveloped',
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
          (s) => Effect.sync(() => JSON.stringify(buildVerdictEnvelope(s.report, 'machine', 'tty', RUN_ID))),
        ),
        Then('the line stays under the 64 KB scanner limit')((s) => {
          expect(s.line).toBeDefined()
          expect(Buffer.byteLength(s.line)).toBeLessThan(64 * 1024)
        }),
      ),
    )
  })
