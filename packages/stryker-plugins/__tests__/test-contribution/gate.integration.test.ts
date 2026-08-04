import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { decideGate, parseMutationReport, verdictOf } from '../../src/test-contribution/index.js'

import { mutantOf, reportOf } from '../helpers/mutation-report.fixtures.js'

const Feature = makeFeature({ it, layer })

const REPORT_FILE = 'reports/mutation-report.json'
const PROPERTY_SUFFIXES = ['.property.test.ts']

const measure = (raw: unknown, everyKillerRecorded: boolean) => {
  const report = parseMutationReport(raw)
  return report === undefined ? undefined : verdictOf(report, everyKillerRecorded, PROPERTY_SUFFIXES)
}

Feature('Failing a build when a test file defends nothing')
  .body(({ scenario }) => {
    scenario(
      'Should_Fail_When_TheRunLeftNoUsableReport',
      Gherkin.Do.pipe(
        Given('a mutation run that never wrote a report')(
          'verdict',
          () => Effect.sync(() => measure(undefined, true)),
        ),
        When('the gate is consulted')(
          'decision',
          (s) => Effect.sync(() => decideGate(s.verdict, REPORT_FILE)),
        ),
        Then('it refuses and names the report it could not read')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(false)
            expect(s.decision.message).toContain(REPORT_FILE)
          })
        ),
      ),
    )

    scenario(
      'Should_Fail_When_ATestFileDefendsNothing',
      Gherkin.Do.pipe(
        Given('a report where one property test file never lands a kill')(
          'verdict',
          () =>
            Effect.sync(() =>
              measure(
                reportOf([mutantOf('m1', 'Killed', ['t1'])], {
                  'test/alpha.property.test.ts': ['t1'],
                  'test/beta.property.test.ts': ['t2'],
                }),
                true,
              )
            ),
        ),
        When('the gate is consulted')(
          'decision',
          (s) => Effect.sync(() => decideGate(s.verdict, REPORT_FILE)),
        ),
        Then('it refuses and names the offending file')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(false)
            expect(s.decision.message).toContain('test/beta.property.test.ts')
          })
        ),
      ),
    )

    scenario(
      'Should_Pass_When_EveryInScopeFileDefendsSomething',
      Gherkin.Do.pipe(
        Given('a report where every property test file lands a kill of its own')(
          'verdict',
          () =>
            Effect.sync(() =>
              measure(
                reportOf([mutantOf('m1', 'Killed', ['t1']), mutantOf('m2', 'Killed', ['t2'])], {
                  'test/alpha.property.test.ts': ['t1'],
                  'test/beta.property.test.ts': ['t2'],
                }),
                true,
              )
            ),
        ),
        When('the gate is consulted')(
          'decision',
          (s) => Effect.sync(() => decideGate(s.verdict, REPORT_FILE)),
        ),
        Then('it passes and confirms the file measured clean')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(true)
            expect(s.verdict?.byTestFile['test/alpha.property.test.ts']).toEqual({ soleKills: 1, totalKills: 1 })
          })
        ),
      ),
    )

    scenario(
      'Should_Pass_AndDeclareReducedPrecision_When_TheRunBailed',
      Gherkin.Do.pipe(
        Given('a clean report from a run that stopped at the first killing test')(
          'verdict',
          () =>
            Effect.sync(() =>
              measure(
                reportOf([mutantOf('m1', 'Killed', ['t1'])], { 'test/alpha.property.test.ts': ['t1'] }),
                false,
              )
            ),
        ),
        When('the gate is consulted')(
          'decision',
          (s) => Effect.sync(() => decideGate(s.verdict, REPORT_FILE)),
        ),
        Then('it passes but says the answer only proves files that killed nothing')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(true)
            expect(s.decision.message).toContain('bailed at the first killing test')
          })
        ),
      ),
    )

    scenario(
      'Should_RejectReport_When_TheFileOnDiskIsNotAMutationReport',
      Gherkin.Do.pipe(
        Given('documents that are JSON but not mutation reports')(
          'candidates',
          () =>
            Effect.sync(() => [
              parseMutationReport('a string'),
              parseMutationReport({ testFiles: {} }),
              parseMutationReport({ files: { 'a.ts': { source: 'x' } } }),
              parseMutationReport({ files: { 'a.ts': { mutants: ['not an object'] } } }),
              parseMutationReport({ files: {}, testFiles: { 'a.test.ts': { tests: [{ id: 7 }] } } }),
            ]),
        ),
        When('each is parsed as a mutation report')('parsed', (s) => Effect.sync(() => s.candidates)),
        Then('every one is rejected rather than half-trusted')((s) =>
          Effect.sync(() => {
            expect(s.parsed).toEqual([undefined, undefined, undefined, undefined, undefined])
          })
        ),
      ),
    )

    scenario(
      'Should_BlameTheRun_When_NoKillWasAttributedToAnyTest',
      Gherkin.Do.pipe(
        Given('a report whose only kill recorded no killing test')(
          'verdict',
          () =>
            Effect.sync(() =>
              measure(reportOf([mutantOf('m1', 'Timeout')], { 'test/alpha.property.test.ts': ['t1'] }), true)
            ),
        ),
        When('the gate is consulted')(
          'decision',
          (s) => Effect.sync(() => decideGate(s.verdict, REPORT_FILE)),
        ),
        Then('it refuses but blames the run instead of accusing the test file')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(false)
            expect(s.decision.message).toContain('attributes no kill')
            expect(s.decision.message).not.toContain('alpha.property.test.ts')
          })
        ),
      ),
    )
  })
