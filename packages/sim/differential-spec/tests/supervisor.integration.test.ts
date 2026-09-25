import { differentialReport, reportCheck } from '@systemfsoftware/differential-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { integers } from './__fixtures__/arbitraries.js'
import { CandidateDefect } from './__fixtures__/CandidateDefect.schema.js'
import {
  atomicBumps,
  atomicBumpsByModify,
  sequentialBumps,
  splitWorkerBumps,
} from './__fixtures__/concurrentCounters.js'

const Feature = makeFeature({ it })

const sameOutcome = (a: number, b: number): boolean => a === b

Feature('Proving two implementations agree under generated schedules', { timeout: 0 })
  .withLayer(Layer.empty)
  .live('the supervisor explores its own generated schedules')
  .body(({ scenario }) => {
    scenario(
      'A diverging candidate is reduced to the smallest failing input in the report',
      Gherkin.Do.pipe(
        Given('a candidate that is always one more than the reference')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) => Effect.succeed(x * 2),
              candidate: (x: number) => Effect.succeed(x * 2 + 1),
            }),
        ),
        When('the parity check runs over generated integers')(
          'report',
          (s) => differentialReport(s.targets.reference, s.targets.candidate, integers, sameOutcome),
        ),
        Then('the report names zero as the minimal input with both sides and its seed')((s, expect) =>
          expect(s.report).toEqual({
            holds: false,
            report: expect.stringMatching(/Input: 0[\s\S]*Output A: 0[\s\S]*Output B: 1[\s\S]*seed/),
          })
        ),
      ),
    )

    scenario(
      'Two implementations that refuse the same amounts the same way still agree',
      Gherkin.Do.pipe(
        Given('a reference and a candidate that both refuse negative amounts')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) => (x < 0 ? Effect.fail(new CandidateDefect()) : Effect.succeed(x * 2)),
              candidate: (x: number) => (x < 0 ? Effect.fail(new CandidateDefect()) : Effect.succeed(x + x)),
            }),
        ),
        When('the parity check runs over generated integers')(
          'report',
          (s) => differentialReport(s.targets.reference, s.targets.candidate, integers, sameOutcome),
        ),
        Then('the run completes without complaint')((s, expect) => reportCheck(s.report, expect)),
      ),
    )

    scenario(
      'A concurrent counter that agrees with the sequential one only when its workers run one after the other is caught',
      Gherkin.Do.pipe(
        Given('two ways of bumping one counter twice: one bump after another, or each bump in its own worker')(
          'implementations',
          () => Effect.succeed({ reference: sequentialBumps, candidate: splitWorkerBumps }),
        ),
        When('the two implementations are compared over generated starting counts')(
          'report',
          (s) =>
            differentialReport(s.implementations.reference, s.implementations.candidate, integers, sameOutcome, {
              runBudget: 1000,
            }),
        ),
        Then('the comparison fails at the smallest starting count with both counts and the deciding schedule shown')(
          (s, expect) =>
            expect(s.report).toEqual({
              holds: false,
              report: expect.stringMatching(
                /Input: 0[\s\S]*Output A: 2[\s\S]*Output B: 1[\s\S]*schedule: search with 1 preemption, deviations 1,[\s\S]*path \[.+\]/,
              ),
            }),
        ),
      ),
    )

    scenario(
      'Two counter implementations that both bump in a single step agree under every schedule',
      Gherkin.Do.pipe(
        Given('two ways of bumping one counter twice, both bumps in a single step')(
          'implementations',
          () => Effect.succeed({ reference: atomicBumps, candidate: atomicBumpsByModify }),
        ),
        When('the two implementations are compared over generated starting counts')(
          'report',
          (s) => differentialReport(s.implementations.reference, s.implementations.candidate, integers, sameOutcome),
        ),
        Then('the comparison holds for every generated starting count')((s, expect) => reportCheck(s.report, expect)),
      ),
    )
    scenario(
      'Two implementations that settle through promises still agree',
      Gherkin.Do.pipe(
        Given('a reference and a candidate that both settle their doubling through a promise')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) => Effect.promise(() => Promise.resolve(x * 2)),
              candidate: (x: number) => Effect.promise(() => Promise.resolve(x + x)),
            }),
        ),
        When('the parity check runs over generated integers')(
          'report',
          (s) => differentialReport(s.targets.reference, s.targets.candidate, integers, (a, b) => a === b),
        ),
        Then('the asynchronous run completes without complaint')((s, expect) => reportCheck(s.report, expect)),
      ),
    )

    scenario(
      'An asynchronous candidate that is always one more is reduced to the smallest failing input',
      Gherkin.Do.pipe(
        Given('a candidate that settles one more than the reference through a promise')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) => Effect.promise(() => Promise.resolve(x * 2)),
              candidate: (x: number) => Effect.promise(() => Promise.resolve(x * 2 + 1)),
            }),
        ),
        When('the parity check runs over generated integers')(
          'report',
          (s) => differentialReport(s.targets.reference, s.targets.candidate, integers, (a, b) => a === b),
        ),
        Then('the report names zero as the minimal input with both sides and its seed')((s, expect) =>
          expect(s.report).toEqual({
            holds: false,
            report: expect.stringMatching(/Input: 0[\s\S]*Output A: 0[\s\S]*Output B: 1[\s\S]*seed/),
          })
        ),
      ),
    )

    scenario(
      'Targets that pause on a sleep before settling are compared like any other',
      Gherkin.Do.pipe(
        Given('a reference and a candidate that both pause briefly before settling their doubling')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) =>
                Effect.gen(function*() {
                  yield* Effect.sleep('1 millis')
                  return yield* Effect.promise(() => Promise.resolve(x * 2))
                }),
              candidate: (x: number) =>
                Effect.gen(function*() {
                  yield* Effect.sleep('1 millis')
                  return yield* Effect.promise(() => Promise.resolve(x + x))
                }),
            }),
        ),
        When('the parity check runs over generated integers')(
          'report',
          (s) => differentialReport(s.targets.reference, s.targets.candidate, integers, (a, b) => a === b),
        ),
        Then('the deferred run completes without complaint')((s, expect) => reportCheck(s.report, expect)),
      ),
    )
  })
