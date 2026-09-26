import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { recordOfRun } from '@systemfsoftware/vitest/failure'
import { Effect, Layer, Match } from 'effect'
import { judgementFailure, rejectedReport } from './__fixtures__/failure-corpus/judgement-failure.js'
import { verdictOrNull } from './__fixtures__/failure-corpus/record.js'

const Feature = makeFeature({ it })

const explanationOf = <C, R>(report: Conformance.Report<C, R>): string =>
  Match.value(report).pipe(
    Match.tag('Pass', () => ''),
    Match.tag('Fail', (failed) => failed.explanation),
    Match.tag('Incomplete', (incomplete) => incomplete.explanation),
    Match.tag('OverBudget', (overBudget) => overBudget.explanation),
    Match.exhaustive,
  )

Feature('The conformance family prints a failure record that names the defect')
  .withLayer(Layer.empty)
  .live('the conformance check drives the simulation kernel itself')
  .body(({ scenario }) => {
    scenario(
      'A rejected linearizability check yields a record naming its defect file and starting at the raising frame',
      Gherkin.Do.pipe(
        Given('a defective conformance check whose rejection the corpus renders')(
          'subject',
          () =>
            Effect.gen(function*() {
              const record = yield* Effect.promise(() => recordOfRun(judgementFailure.program))
              const report = yield* Effect.orDie(rejectedReport)
              return { record, report }
            }),
        ),
        Then('the record names the defect file and the rejected report carries its explanation')((s, expect) =>
          expect({
            verdict: verdictOrNull({ record: s.subject.record, fixture: judgementFailure }),
            explanation: explanationOf(s.subject.report),
          }).toMatchObject({
            verdict: {
              name: 'AssertionError',
              namesDefectFile: true,
              hasHeadline: true,
              carriesExplanation: true,
              firstLocationFile: judgementFailure.raisingFile,
              breaches: [],
            },
            explanation: expect.stringContaining('no sequential order explains this history'),
          })
        ),
      ),
    )
  })
